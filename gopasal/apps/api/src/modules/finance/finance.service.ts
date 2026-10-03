import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import {
  ConfigEnvironment,
  EscrowStatus,
  FinanceJournalType,
  LedgerAccount,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  RefundMethod,
  RefundStatus,
  SettlementDirection,
  SettlementStatus,
} from '@prisma/client';
import { customAlphabet } from 'nanoid';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PAYMENT_PROVIDERS, type PaymentProvider } from '../../providers/payment.provider';
import { allocateRefund, allocateRefundReversal, assertBalanced, calculateFinanceSplit, discountFunding } from './finance-calculation';

const financeCode = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8);
type Db = Prisma.TransactionClient;
type LedgerRow = { account: LedgerAccount; debit: number; credit: number };

const ONLINE_METHODS: PaymentMethod[] = [
  // Read-side compatibility for payment records created before the simulator
  // was retired. Checkout validation and the provider registry cannot create
  // new DEVELOPMENT payments.
  PaymentMethod.DEVELOPMENT,
  PaymentMethod.ESEWA,
  PaymentMethod.KHALTI,
];

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PAYMENT_PROVIDERS) private readonly payments: PaymentProvider[] = [],
  ) {}

  /** Snapshot the commission rule alongside the order, inside checkout's transaction. */
  async recordOrderPlaced(tx: Db, orderId: string) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    return this.ensureOrderFinance(tx, order);
  }

  async enforceCodLimit(method: PaymentMethod, amount: number, tx?: Db) {
    if (method !== PaymentMethod.COD) return;
    const rule = await this.rules(tx ?? this.prisma);
    if (amount > rule.codLimit) {
      throw new BadRequestException(`Cash on delivery is limited to Rs ${rule.codLimit}`);
    }
  }

  /** A verified online payment becomes customer money held in escrow. */
  async recordPaymentCaptured(tx: Db, orderId: string, actorId?: string) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (!ONLINE_METHODS.includes(order.paymentMethod)) return;

    const finance = await this.ensureOrderFinance(tx, order);
    const existing = await tx.escrow.findUnique({ where: { orderId } });
    if (!existing) {
      const rules = await this.rules(tx);
      await tx.escrow.create({
        data: {
          orderId,
          shopId: order.shopId,
          amount: finance.grossAmount + finance.platformFundedDiscount,
          releaseEligibleAt: order.deliveredAt
            ? new Date(order.deliveredAt.getTime() + rules.refundWindowHours * 3_600_000)
            : null,
        },
      });
    }

    await this.journal(tx, {
      eventKey: `payment-captured:${orderId}`,
      type: FinanceJournalType.PAYMENT_CAPTURED,
      description: `Verified ${order.paymentMethod} payment for order ${order.code}`,
      orderId,
      shopId: order.shopId,
      actorId,
      entries: [
        { account: LedgerAccount.PAYMENT_CLEARING_ASSET, debit: finance.grossAmount, credit: 0 },
        ...(finance.platformFundedDiscount > 0 ? [{ account: LedgerAccount.PLATFORM_PROMOTION_EXPENSE, debit: finance.platformFundedDiscount, credit: 0 }] : []),
        { account: LedgerAccount.CUSTOMER_ESCROW_LIABILITY, debit: 0, credit: finance.grossAmount + finance.platformFundedDiscount },
      ],
    });
  }

  /** Delivery starts the escrow clock, or recognises GoPasal's COD commission receivable. */
  async recordOrderDelivered(tx: Db, orderId: string, actorId?: string) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    const finance = await this.ensureOrderFinance(tx, order);

    if (order.paymentMethod === PaymentMethod.COD) {
      if (!finance.codAccruedAt) {
        await tx.orderFinance.update({ where: { orderId }, data: { codAccruedAt: order.deliveredAt ?? new Date() } });
      }
      if (finance.commissionAmount > 0 || finance.platformFundedDiscount > 0) {
        await this.journal(tx, {
          eventKey: `cod-commission:${orderId}`,
          type: FinanceJournalType.COD_COMMISSION_ACCRUED,
          description: `Commission due after COD collection for order ${order.code}`,
          orderId,
          shopId: order.shopId,
          actorId,
          entries: [
            ...(finance.commissionAmount > 0 ? [{ account: LedgerAccount.SELLER_COD_RECEIVABLE_ASSET, debit: finance.commissionAmount, credit: 0 }] : []),
            ...(finance.platformFundedDiscount > 0 ? [{ account: LedgerAccount.PLATFORM_PROMOTION_EXPENSE, debit: finance.platformFundedDiscount, credit: 0 }] : []),
            ...(finance.platformFundedDiscount > 0 ? [{ account: LedgerAccount.SELLER_PAYABLE_LIABILITY, debit: 0, credit: finance.platformFundedDiscount }] : []),
            ...(finance.commissionAmount > 0 ? [{ account: LedgerAccount.PLATFORM_COMMISSION_REVENUE, debit: 0, credit: finance.commissionAmount }] : []),
          ],
        });
      }
      return;
    }

    if (order.paymentStatus !== PaymentStatus.PAID && order.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED) {
      throw new BadRequestException('Online payment must be verified before delivery');
    }
    await this.recordPaymentCaptured(tx, orderId, actorId);
    const rules = await this.rules(tx);
    const deliveredAt = order.deliveredAt ?? new Date();
    await tx.escrow.update({
      where: { orderId },
      data: { releaseEligibleAt: new Date(deliveredAt.getTime() + rules.refundWindowHours * 3_600_000) },
    });
  }

  /** Release due escrows and build one auditable open settlement per seller. */
  async reconcile(actorId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(1196748621) AS locked`;
      if (!locked[0]?.locked) return { locked: false, released: 0, settlements: [] };
      await this.backfillDeliveredOrders(tx, actorId);
      const released = await this.releaseEligibleEscrows(tx, actorId);
      const settlements = await this.createSettlementBatches(tx);
      return { locked: true, released, settlements };
    }, { timeout: 120_000 });
  }

  /** Daily release/batching; transfer completion still requires a verified external reference. */
  @Cron('0 5 2 * * *', { name: 'daily-finance-reconciliation', timeZone: 'Asia/Kathmandu' })
  async scheduledReconcile() {
    try {
      const result = await this.reconcile();
      this.logger.log(`Daily finance reconciliation released ${result.released} escrows and created ${result.settlements.length} batches`);
    } catch (error) {
      this.logger.error('Daily finance reconciliation failed', error instanceof Error ? error.stack : String(error));
    }
  }

  async overview() {
    const [held, released, codDue, refunds, settlements, ledger] = await Promise.all([
      this.prisma.escrow.aggregate({ where: { status: { in: [EscrowStatus.HELD, EscrowStatus.PARTIALLY_REFUNDED] } }, _sum: { amount: true, refundedAmount: true }, _count: true }),
      this.prisma.orderFinance.aggregate({ where: { settledAt: null, order: { escrow: { is: { status: EscrowStatus.RELEASED } } } }, _sum: { sellerNetAmount: true, refundAmount: true }, _count: true }),
      this.prisma.orderFinance.aggregate({ where: { settledAt: null, codAccruedAt: { not: null } }, _sum: { commissionAmount: true, refundAmount: true }, _count: true }),
      this.prisma.refund.aggregate({ where: { status: RefundStatus.COMPLETED }, _sum: { amount: true }, _count: true }),
      this.prisma.settlement.groupBy({ by: ['status'], _count: { _all: true }, _sum: { netAmount: true } }),
      this.prisma.ledgerEntry.groupBy({ by: ['account'], _sum: { debit: true, credit: true } }),
    ]);
    return {
      escrow: {
        held: (held._sum.amount ?? 0) - (held._sum.refundedAmount ?? 0),
        orders: held._count,
        releasedSellerPayable: Math.max(0, (released._sum?.sellerNetAmount ?? 0) - (released._sum?.refundAmount ?? 0)),
        releasedOrders: released._count,
      },
      cod: {
        commissionDue: Math.max(0, (codDue._sum.commissionAmount ?? 0) - (codDue._sum.refundAmount ?? 0)),
        orders: codDue._count,
      },
      refunds: { amount: refunds._sum.amount ?? 0, count: refunds._count },
      settlements: Object.fromEntries(settlements.map((row) => [row.status, { count: row._count._all, amount: row._sum.netAmount ?? 0 }])),
      ledger: Object.fromEntries(ledger.map((row) => [row.account, (row._sum.debit ?? 0) - (row._sum.credit ?? 0)])),
      generatedAt: new Date().toISOString(),
    };
  }

  async listSettlements(shopId?: string) {
    return this.prisma.settlement.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        shop: { select: { id: true, name: true, area: true } },
        lines: {
          include: { orderFinance: { include: { order: { select: { id: true, code: true, paymentMethod: true, total: true, deliveredAt: true } } } } },
        },
      },
    });
  }

  /** Refund queue used by finance operations. Customer-facing order reads expose
   * only their own refund status; this richer view stays behind platform finance RBAC. */
  async listRefunds(status?: RefundStatus) {
    return this.prisma.refund.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: {
        order: {
          select: {
            id: true,
            code: true,
            total: true,
            paymentMethod: true,
            paymentStatus: true,
            shop: { select: { id: true, name: true } },
            customer: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    });
  }

  async ledger(limit = 100) {
    return this.prisma.financeJournal.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, Math.max(1, limit)),
      include: {
        entries: true,
        shop: { select: { id: true, name: true } },
        order: { select: { id: true, code: true } },
      },
    });
  }

  async forShop(shopId: string) {
    const [held, releasedRows, codRows, settlements, refunds] = await Promise.all([
      this.prisma.escrow.aggregate({ where: { shopId, status: { in: [EscrowStatus.HELD, EscrowStatus.PARTIALLY_REFUNDED] } }, _sum: { amount: true, refundedAmount: true }, _count: true }),
      this.prisma.orderFinance.findMany({ where: { shopId, settledAt: null, order: { escrow: { is: { status: EscrowStatus.RELEASED } } } } }),
      this.prisma.orderFinance.findMany({ where: { shopId, settledAt: null, codAccruedAt: { not: null } } }),
      this.listSettlements(shopId),
      this.prisma.refund.findMany({ where: { order: { shopId } }, orderBy: { createdAt: 'desc' }, take: 50, include: { order: { select: { code: true } } } }),
    ]);
    const remaining = (row: { grossAmount: number; commissionAmount: number; sellerNetAmount: number; refundAmount: number }) => {
      const split = allocateRefund(row.grossAmount, row.commissionAmount, row.refundAmount);
      return { seller: Math.max(0, row.sellerNetAmount - split.sellerReversal), commission: Math.max(0, row.commissionAmount - split.commissionReversal) };
    };
    return {
      summary: {
        escrowHeld: (held._sum.amount ?? 0) - (held._sum.refundedAmount ?? 0),
        escrowOrders: held._count,
        onlineReady: releasedRows.reduce((sum, row) => sum + remaining(row).seller, 0),
        codCommissionDue: codRows.reduce((sum, row) => sum + remaining(row).commission, 0),
        openSettlementAmount: settlements.filter((row) => row.status !== SettlementStatus.PAID).reduce((sum, row) => sum + (row.direction === SettlementDirection.PAYOUT_TO_SELLER ? row.netAmount : -row.netAmount), 0),
      },
      settlements,
      refunds,
      generatedAt: new Date().toISOString(),
    };
  }

  async completeSettlement(actorId: string, settlementId: string, input: { outcome: 'success' | 'failure'; providerReference?: string; failureReason?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const settlement = await tx.settlement.findUnique({ where: { id: settlementId } });
      if (!settlement) throw new NotFoundException('Settlement not found');
      if (settlement.status === SettlementStatus.PAID) return settlement;
      if (input.outcome === 'failure') {
        if (!input.failureReason?.trim()) throw new BadRequestException('Failure reason is required');
        return tx.settlement.update({ where: { id: settlementId }, data: { status: SettlementStatus.FAILED, failureReason: input.failureReason.trim(), completedById: actorId, completedAt: new Date() } });
      }
      if (!input.providerReference?.trim()) throw new BadRequestException('Bank or wallet transaction reference is required');

      const entries: LedgerRow[] = [];
      if (settlement.direction === SettlementDirection.PAYOUT_TO_SELLER) {
        if (settlement.onlineSellerPayable > 0) entries.push({ account: LedgerAccount.SELLER_PAYABLE_LIABILITY, debit: settlement.onlineSellerPayable, credit: 0 });
        if (settlement.codCommissionReceivable > 0) entries.push({ account: LedgerAccount.SELLER_COD_RECEIVABLE_ASSET, debit: 0, credit: settlement.codCommissionReceivable });
        if (settlement.netAmount > 0) entries.push({ account: LedgerAccount.PAYMENT_CLEARING_ASSET, debit: 0, credit: settlement.netAmount });
      } else {
        if (settlement.netAmount > 0) entries.push({ account: LedgerAccount.PAYMENT_CLEARING_ASSET, debit: settlement.netAmount, credit: 0 });
        if (settlement.onlineSellerPayable > 0) entries.push({ account: LedgerAccount.SELLER_PAYABLE_LIABILITY, debit: settlement.onlineSellerPayable, credit: 0 });
        if (settlement.codCommissionReceivable > 0) entries.push({ account: LedgerAccount.SELLER_COD_RECEIVABLE_ASSET, debit: 0, credit: settlement.codCommissionReceivable });
      }
      await this.journal(tx, {
        eventKey: `settlement-completed:${settlementId}`,
        type: FinanceJournalType.SETTLEMENT_COMPLETED,
        description: `${settlement.direction === SettlementDirection.PAYOUT_TO_SELLER ? 'Seller payout' : 'COD commission collection'} ${settlement.code}`,
        shopId: settlement.shopId,
        settlementId,
        actorId,
        entries,
      });
      return tx.settlement.update({
        where: { id: settlementId },
        data: { status: SettlementStatus.PAID, providerReference: input.providerReference.trim(), failureReason: null, completedById: actorId, completedAt: new Date() },
      });
    });
  }

  async issueRefund(actorId: string, orderId: string, input: { amount: number; reason: string; method: RefundMethod; providerRef?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { finance: { include: { settlementLine: { include: { settlement: true } } } }, escrow: true } });
      if (!order) throw new NotFoundException('Order not found');
      if (order.paymentStatus !== PaymentStatus.PAID && order.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED) throw new BadRequestException('Only a paid order can be refunded');
      if (!order.finance) await this.ensureOrderFinance(tx, order);
      const finance = await tx.orderFinance.findUnique({ where: { orderId }, include: { settlementLine: { include: { settlement: true } } } });
      if (!finance) throw new BadRequestException('Order finance could not be created');
      if (finance.settlementLine && finance.settlementLine.settlement.status !== SettlementStatus.PAID) throw new BadRequestException('Remove this order from its open settlement before refunding it');
      const remaining = order.total - finance.refundAmount - finance.refundReservedAmount;
      if (input.amount > remaining) throw new BadRequestException(`Refund cannot exceed Rs ${remaining}`);
      if (input.method === RefundMethod.STORE_CREDIT) throw new BadRequestException('Store-credit refunds are not enabled because GoPasal has no customer cash wallet');
      if (order.paymentMethod === PaymentMethod.COD && input.method === RefundMethod.ORIGINAL_SOURCE) throw new BadRequestException('COD has no digital payment source; choose manual transfer');
      if (order.paymentMethod !== PaymentMethod.COD && input.method !== RefundMethod.ORIGINAL_SOURCE) throw new BadRequestException('Online payments must return to the original source');

      const external = input.method === RefundMethod.ORIGINAL_SOURCE;
      const status = external ? RefundStatus.PENDING : input.providerRef?.trim() ? RefundStatus.COMPLETED : RefundStatus.PENDING;
      const reservation = await tx.orderFinance.updateMany({
        where: {
          id: finance.id,
          refundAmount: finance.refundAmount,
          refundReservedAmount: finance.refundReservedAmount,
        },
        data: status === RefundStatus.COMPLETED
          ? { refundAmount: { increment: input.amount } }
          : { refundReservedAmount: { increment: input.amount } },
      });
      if (reservation.count !== 1) throw new BadRequestException('Refund amount changed; retry the request');

      const refund = await tx.refund.create({ data: {
        code: `RF-${financeCode()}`, orderId, amount: input.amount,
        reason: input.reason.trim(), method: input.method, providerRef: input.providerRef?.trim() || null,
        status, completedAt: status === RefundStatus.COMPLETED ? new Date() : null, issuedById: actorId,
      } });
      if (status === RefundStatus.COMPLETED) {
        await this.completeRefundAccounting(tx, order, finance, refund.id, input.amount, actorId);
      }
      return refund;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /** Reserve the unpaid balance of a cancelled/rejected paid order in the same
   * transaction as the status and inventory release. The actual gateway/manual
   * transfer is deliberately a separate, retryable finance operation. */
  async reserveCancellationRefund(
    tx: Db,
    orderId: string,
    actorId: string,
    reason: string,
  ) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { finance: true },
    });
    if (!order || !order.finance) throw new BadRequestException('Order finance not found');
    if (
      order.paymentStatus !== PaymentStatus.PAID &&
      order.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED
    ) return null;

    const remaining = Math.max(
      0,
      order.total - order.finance.refundAmount - order.finance.refundReservedAmount,
    );
    if (remaining === 0) return null;
    const reservation = await tx.orderFinance.updateMany({
      where: {
        id: order.finance.id,
        refundAmount: order.finance.refundAmount,
        refundReservedAmount: order.finance.refundReservedAmount,
      },
      data: { refundReservedAmount: { increment: remaining } },
    });
    if (reservation.count !== 1)
      throw new BadRequestException('Refund amount changed; retry the cancellation');

    return tx.refund.create({
      data: {
        code: `RF-${financeCode()}`,
        orderId,
        amount: remaining,
        reason: `Automatic full refund: ${reason.trim()}`,
        method:
          order.paymentMethod === PaymentMethod.COD
            ? RefundMethod.MANUAL_TRANSFER
            : RefundMethod.ORIGINAL_SOURCE,
        status: RefundStatus.PENDING,
        issuedById: actorId,
      },
    });
  }

  /** Execute a retry-safe vendor refund. Khalti full wallet refunds can complete
   * automatically because its published API first proves the transaction state.
   * Bank/partial refunds and providers without an approved, sufficient API stay
   * in the human operations queue with their real external reference. */
  async processRefund(refundId: string, actorId?: string) {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: {
        order: {
          include: { finance: true, paymentIntent: true },
        },
      },
    });
    if (!refund) throw new NotFoundException('Refund not found');
    if (refund.status === RefundStatus.COMPLETED) return refund;
    if (refund.status === RefundStatus.FAILED)
      throw new BadRequestException('This refund was closed as failed; issue a new operation');
    if (refund.method !== RefundMethod.ORIGINAL_SOURCE)
      throw new BadRequestException('Manual transfers must be completed with their real transfer reference');
    if (!refund.order.paymentIntent?.reference)
      throw new BadRequestException('Original payment reference is missing');
    if (
      refund.amount !== refund.order.total ||
      (refund.order.finance?.refundAmount ?? 0) !== 0
    ) {
      throw new BadRequestException(
        'Automatic execution is limited to a single full refund; process partial refunds in the gateway dashboard',
      );
    }
    const provider = this.payments.find(
      (candidate) => candidate.method === refund.order.paymentMethod,
    );
    if (!provider?.enabled || !provider.refundFull) {
      throw new BadRequestException(
        `${refund.order.paymentMethod} refund API is not configured; process it in the merchant dashboard`,
      );
    }

    const now = new Date();
    if (refund.nextAttemptAt && refund.nextAttemptAt > now)
      throw new BadRequestException('This refund is waiting for its retry window');
    const staleBefore = new Date(now.getTime() - 10 * 60_000);
    const claimed = await this.prisma.refund.updateMany({
      where: {
        id: refund.id,
        attemptCount: refund.attemptCount,
        OR: [
          { status: RefundStatus.PENDING },
          {
            status: RefundStatus.PROCESSING,
            OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lte: staleBefore } }],
          },
        ],
      },
      data: {
        status: RefundStatus.PROCESSING,
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        nextAttemptAt: null,
        failureReason: null,
      },
    });
    if (claimed.count !== 1)
      return this.prisma.refund.findUniqueOrThrow({ where: { id: refundId } });

    try {
      const result = await provider.refundFull({
        providerRef: refund.order.paymentIntent.reference,
        amount: refund.order.total,
      });
      return this.completeRefund(actorId, refund.id, {
        outcome: 'success',
        providerReference: result.providerRef,
      });
    } catch (error) {
      const attempt = refund.attemptCount + 1;
      const delayMinutes = Math.min(360, 2 ** Math.min(attempt, 8));
      const message = this.refundError(error);
      await this.prisma.refund.updateMany({
        where: { id: refund.id, status: RefundStatus.PROCESSING, attemptCount: attempt },
        data: {
          status: RefundStatus.PENDING,
          failureReason: message,
          nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
        },
      });
      throw error;
    }
  }

  @Cron('*/5 * * * *', { name: 'refund-processing', timeZone: 'Asia/Kathmandu' })
  async scheduledRefundProcessing() {
    const provider = this.payments.find((candidate) => candidate.method === 'KHALTI');
    if (!provider?.enabled || !provider.refundFull) return;
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 10 * 60_000);
    const rows = await this.prisma.refund.findMany({
      where: {
        method: RefundMethod.ORIGINAL_SOURCE,
        order: { paymentMethod: PaymentMethod.KHALTI },
        OR: [
          {
            status: RefundStatus.PENDING,
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          {
            status: RefundStatus.PROCESSING,
            OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lte: staleBefore } }],
          },
        ],
      },
      select: {
        id: true,
        amount: true,
        order: { select: { total: true, finance: { select: { refundAmount: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 25,
    });
    for (const row of rows.filter(
      (candidate) =>
        candidate.amount === candidate.order.total &&
        (candidate.order.finance?.refundAmount ?? 0) === 0,
    )) {
      try {
        await this.processRefund(row.id);
      } catch (error) {
        this.logger.warn(`Refund ${row.id} remains pending: ${this.refundError(error)}`);
      }
    }
  }

  async completeRefund(actorId: string | undefined, refundId: string, input: { outcome: 'success' | 'failure'; providerReference?: string; failureReason?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({ where: { id: refundId }, include: { order: { include: { finance: { include: { settlementLine: { include: { settlement: true } } } }, escrow: true } } } });
      if (!refund) throw new NotFoundException('Refund not found');
      if (refund.status === RefundStatus.COMPLETED || refund.status === RefundStatus.FAILED) return refund;
      if (input.outcome === 'failure') {
        if (!input.failureReason?.trim()) throw new BadRequestException('Failure reason is required');
        const claimed = await tx.refund.updateMany({
          where: {
            id: refundId,
            status: { in: [RefundStatus.PENDING, RefundStatus.PROCESSING] },
          },
          data: {
            status: RefundStatus.FAILED,
            failureReason: input.failureReason.trim(),
          },
        });
        if (claimed.count !== 1)
          return tx.refund.findUniqueOrThrow({ where: { id: refundId } });
        await tx.orderFinance.update({ where: { orderId: refund.orderId }, data: { refundReservedAmount: { decrement: refund.amount } } });
        return tx.refund.findUniqueOrThrow({ where: { id: refundId } });
      }
      if (!input.providerReference?.trim()) throw new BadRequestException('Provider reference is required');
      const claimed = await tx.refund.updateMany({ where: { id: refundId, status: { in: [RefundStatus.PENDING, RefundStatus.PROCESSING] } }, data: { status: RefundStatus.COMPLETED, providerRef: input.providerReference.trim(), completedAt: new Date(), failureReason: null, nextAttemptAt: null } });
      if (claimed.count !== 1) return tx.refund.findUniqueOrThrow({ where: { id: refundId } });
      const finance = refund.order.finance;
      if (!finance) throw new BadRequestException('Order finance not found');
      await tx.orderFinance.update({ where: { orderId: refund.orderId }, data: { refundReservedAmount: { decrement: refund.amount }, refundAmount: { increment: refund.amount } } });
      await this.completeRefundAccounting(tx, refund.order, finance, refund.id, refund.amount, actorId);
      return tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async completeRefundAccounting(
    tx: Db,
    order: Prisma.OrderGetPayload<{ include: { escrow: true } }> & { finance?: unknown },
    finance: Prisma.OrderFinanceGetPayload<{ include: { settlementLine: { include: { settlement: true } } } }>,
    refundId: string,
    amount: number,
    actorId?: string,
  ) {
      const totalRefund = finance.refundAmount + amount;
      // A platform coupon/GoCoin is money GoPasal added for the seller, not cash
      // the customer can be refunded. Partial refunds allocate only customer cash;
      // the final/full refund also unwinds the remaining platform subsidy so no
      // liability or promotion expense is stranded.
      const { commissionReversal, sellerReversal, promotionReversal } =
        allocateRefundReversal({
          grossAmount: finance.grossAmount,
          commissionAmount: finance.commissionAmount,
          sellerNetAmount: finance.sellerNetAmount,
          platformFundedDiscount: finance.platformFundedDiscount,
          previousRefundAmount: finance.refundAmount,
          totalRefundAmount: totalRefund,
          orderTotal: order.total,
        });

      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: totalRefund === order.total ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED } });

      if (order.paymentMethod === PaymentMethod.COD) {
        const settled = finance.settlementLine?.settlement.status === SettlementStatus.PAID;
        if (commissionReversal > 0 || promotionReversal > 0) await this.journal(tx, { eventKey: `refund:${refundId}`, type: settled ? FinanceJournalType.REFUND_RECOVERY : FinanceJournalType.REFUND_ISSUED, description: `COD refund adjustment`, orderId: order.id, shopId: order.shopId, actorId, entries: [
          ...(commissionReversal > 0 ? [{ account: LedgerAccount.PLATFORM_COMMISSION_REVENUE, debit: commissionReversal, credit: 0 }] : []),
          ...(promotionReversal > 0 ? [{ account: settled ? LedgerAccount.SELLER_RECOVERY_RECEIVABLE_ASSET : LedgerAccount.SELLER_PAYABLE_LIABILITY, debit: promotionReversal, credit: 0 }] : []),
          ...(commissionReversal > 0 ? [{ account: LedgerAccount.SELLER_COD_RECEIVABLE_ASSET, debit: 0, credit: commissionReversal }] : []),
          ...(promotionReversal > 0 ? [{ account: LedgerAccount.PLATFORM_PROMOTION_EXPENSE, debit: 0, credit: promotionReversal }] : []),
        ] });
      } else {
        if (!order.escrow) throw new BadRequestException('Online payment escrow not found');
        const entries: LedgerRow[] = order.escrow.status === EscrowStatus.HELD || order.escrow.status === EscrowStatus.PARTIALLY_REFUNDED
          ? [
              { account: LedgerAccount.CUSTOMER_ESCROW_LIABILITY, debit: amount + promotionReversal, credit: 0 },
              { account: LedgerAccount.PAYMENT_CLEARING_ASSET, debit: 0, credit: amount },
              ...(promotionReversal > 0 ? [{ account: LedgerAccount.PLATFORM_PROMOTION_EXPENSE, debit: 0, credit: promotionReversal }] : []),
            ]
          : [
              ...(sellerReversal > 0 ? [{ account: LedgerAccount.SELLER_PAYABLE_LIABILITY, debit: sellerReversal, credit: 0 }] : []),
              ...(commissionReversal > 0 ? [{ account: LedgerAccount.PLATFORM_COMMISSION_REVENUE, debit: commissionReversal, credit: 0 }] : []),
              { account: LedgerAccount.PAYMENT_CLEARING_ASSET, debit: 0, credit: amount },
              ...(promotionReversal > 0 ? [{ account: LedgerAccount.PLATFORM_PROMOTION_EXPENSE, debit: 0, credit: promotionReversal }] : []),
            ];
        const settled = finance.settlementLine?.settlement.status === SettlementStatus.PAID;
        if (settled && sellerReversal > 0) {
          const index = entries.findIndex((entry) => entry.account === LedgerAccount.SELLER_PAYABLE_LIABILITY);
          if (index >= 0) entries[index] = { account: LedgerAccount.SELLER_RECOVERY_RECEIVABLE_ASSET, debit: sellerReversal, credit: 0 };
        }
        await this.journal(tx, { eventKey: `refund:${refundId}`, type: settled ? FinanceJournalType.REFUND_RECOVERY : FinanceJournalType.REFUND_ISSUED, description: `Refund for order ${order.code}`, orderId: order.id, shopId: order.shopId, actorId, entries });
        await tx.escrow.update({ where: { orderId: order.id }, data: { refundedAmount: totalRefund, status: totalRefund === order.total ? EscrowStatus.REFUNDED : EscrowStatus.PARTIALLY_REFUNDED } });
      }
  }

  private async backfillDeliveredOrders(tx: Db, actorId?: string) {
    const rows = await tx.order.findMany({ where: { status: 'DELIVERED', finance: { is: null } }, select: { id: true, paymentMethod: true, paymentStatus: true }, take: 500 });
    for (const row of rows) {
      await this.recordOrderPlaced(tx, row.id);
      if (ONLINE_METHODS.includes(row.paymentMethod) && row.paymentStatus === PaymentStatus.PAID) await this.recordPaymentCaptured(tx, row.id, actorId);
      await this.recordOrderDelivered(tx, row.id, actorId);
    }
  }

  private async releaseEligibleEscrows(tx: Db, actorId?: string) {
    const due = await tx.escrow.findMany({
      where: { status: { in: [EscrowStatus.HELD, EscrowStatus.PARTIALLY_REFUNDED] }, releaseEligibleAt: { lte: new Date() }, order: { status: 'DELIVERED', OR: [{ dispute: null }, { dispute: { status: { in: ['RESOLVED_SHOP', 'REJECTED'] } } }] } },
      select: { orderId: true },
      take: 500,
    });
    let count = 0;
    for (const row of due) {
        const escrow = await tx.escrow.findUnique({ where: { orderId: row.orderId } });
        const finance = await tx.orderFinance.findUnique({ where: { orderId: row.orderId }, include: { order: { select: { code: true } } } });
        if (!escrow || !finance || escrow.releasedAt || !escrow.releaseEligibleAt || escrow.releaseEligibleAt > new Date()) return;
        const split = allocateRefund(finance.grossAmount, finance.commissionAmount, finance.refundAmount);
        const seller = Math.max(0, finance.sellerNetAmount - split.sellerReversal);
        const commission = Math.max(0, finance.commissionAmount - split.commissionReversal);
        const remaining = finance.grossAmount + finance.platformFundedDiscount - finance.refundAmount;
        if (remaining > 0) await this.journal(tx, { eventKey: `escrow-released:${row.orderId}`, type: FinanceJournalType.ESCROW_RELEASED, description: `Escrow released for order ${finance.order.code}`, orderId: row.orderId, shopId: finance.shopId, actorId, entries: [
          { account: LedgerAccount.CUSTOMER_ESCROW_LIABILITY, debit: remaining, credit: 0 },
          ...(seller > 0 ? [{ account: LedgerAccount.SELLER_PAYABLE_LIABILITY, debit: 0, credit: seller }] : []),
          ...(commission > 0 ? [{ account: LedgerAccount.PLATFORM_COMMISSION_REVENUE, debit: 0, credit: commission }] : []),
        ] });
        await tx.escrow.update({ where: { orderId: row.orderId }, data: { status: remaining === 0 ? EscrowStatus.REFUNDED : EscrowStatus.RELEASED, releasedAt: new Date() } });
        count += 1;
    }
    return count;
  }

  private async createSettlementBatches(tx: Db) {
    const rows = await tx.orderFinance.findMany({
      where: { settledAt: null, OR: [{ order: { escrow: { is: { status: EscrowStatus.RELEASED } } } }, { codAccruedAt: { not: null } }] },
      include: { order: { select: { code: true, escrow: true } }, shop: { include: { application: true } } },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });
    const groups = new Map<string, typeof rows>();
    for (const row of rows) groups.set(row.shopId, [...(groups.get(row.shopId) ?? []), row]);
    const created = [];
    for (const [shopId, finances] of groups) {
      const lines = finances.map((row) => {
        const refund = allocateRefund(row.grossAmount, row.commissionAmount, row.refundAmount);
        return {
          orderFinanceId: row.id,
          sellerPayable: row.paymentMethod === PaymentMethod.COD
            ? row.platformFundedDiscount
            : Math.max(0, row.sellerNetAmount - refund.sellerReversal),
          codCommission: row.paymentMethod === PaymentMethod.COD ? Math.max(0, row.commissionAmount - refund.commissionReversal) : 0,
          refundAmount: row.refundAmount,
        };
      });
      const online = lines.reduce((sum, row) => sum + row.sellerPayable, 0);
      const cod = lines.reduce((sum, row) => sum + row.codCommission, 0);
      if (online === 0 && cod === 0) continue;
      const application = finances[0]?.shop.application;
      const destination = application?.payoutMethod === 'BANK' ? this.mask(application.bankAccountNo) : this.mask(application?.walletNumber);
      const settlement = await (async () => {
        const now = new Date();
        const value = await tx.settlement.create({ data: {
          code: `ST-${financeCode()}`,
          shopId,
          windowStart: finances[0]?.createdAt ?? now,
          windowEnd: now,
          onlineSellerPayable: online,
          codCommissionReceivable: cod,
          refundAdjustments: lines.reduce((sum, row) => sum + row.refundAmount, 0),
          netAmount: Math.abs(online - cod),
          direction: online >= cod ? SettlementDirection.PAYOUT_TO_SELLER : SettlementDirection.COLLECTION_FROM_SELLER,
          payoutMethod: application?.payoutMethod ?? null,
          payoutDestinationMasked: destination,
          lines: { create: lines },
        } });
        await tx.orderFinance.updateMany({ where: { id: { in: finances.map((row) => row.id) } }, data: { settledAt: now } });
        return value;
      })();
      created.push(settlement);
    }
    return created;
  }

  private async ensureOrderFinance(tx: Db, order: { id: string; shopId: string; paymentMethod: PaymentMethod; total: number; subtotal: number; discount: number; loyaltyDiscount: number; deliveryFee: number; couponId: string | null }) {
    const existing = await tx.orderFinance.findUnique({ where: { orderId: order.id } });
    if (existing) return existing;
    const rules = await this.rules(tx);
    const coupon = order.couponId ? await tx.coupon.findUnique({ where: { id: order.couponId }, select: { shopId: true } }) : null;
    const funding = discountFunding({ couponDiscount: order.discount, loyaltyDiscount: order.loyaltyDiscount, couponPlatformFunded: coupon?.shopId === null });
    const split = calculateFinanceSplit({ subtotal: order.subtotal, sellerFundedDiscount: funding.sellerFundedDiscount, deliveryFee: order.deliveryFee, commissionRateBps: rules.commissionRateBps });
    return tx.orderFinance.create({ data: { orderId: order.id, shopId: order.shopId, paymentMethod: order.paymentMethod, grossAmount: order.total, deliveryFee: order.deliveryFee, commissionRateBps: rules.commissionRateBps, ...funding, ...split } });
  }

  private async rules(tx: Pick<Prisma.TransactionClient, 'platformConfigVersion'>) {
    const env = this.config.get('env', { infer: true });
    const environment = env === 'production' ? ConfigEnvironment.PRODUCTION : env === 'staging' ? ConfigEnvironment.STAGING : ConfigEnvironment.DEVELOPMENT;
    const row = await tx.platformConfigVersion.findFirst({ where: { environment }, orderBy: { version: 'desc' } });
    if (!row) throw new BadRequestException(`Finance configuration is missing for ${environment}`);
    return row;
  }

  private async journal(tx: Db, input: { eventKey: string; type: FinanceJournalType; description: string; orderId?: string; shopId?: string; settlementId?: string; actorId?: string; entries: LedgerRow[] }) {
    if (await tx.financeJournal.findUnique({ where: { eventKey: input.eventKey } })) return;
    const entries = input.entries.filter((row) => row.debit > 0 || row.credit > 0);
    assertBalanced(entries);
    await tx.financeJournal.create({ data: { eventKey: input.eventKey, type: input.type, description: input.description, orderId: input.orderId, shopId: input.shopId, settlementId: input.settlementId, actorId: input.actorId, entries: { create: entries } } });
  }

  private mask(value?: string | null) {
    if (!value) return null;
    const clean = value.replace(/\s/g, '');
    return clean.length <= 4 ? `••••${clean}` : `•••• ${clean.slice(-4)}`;
  }

  private refundError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Gateway refund request failed';
    return message.replace(/[\r\n\t]+/g, ' ').slice(0, 300);
  }
}

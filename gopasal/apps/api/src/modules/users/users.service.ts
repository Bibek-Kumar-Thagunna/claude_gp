import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuthService } from '../../auth/auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';

export type AccountDeletionBlocker = { code: string; message: string; count: number };
export type AccountDeletionEligibility = {
  eligible: boolean;
  blockers: AccountDeletionBlocker[];
  retained: string[];
};

const RETAINED_AFTER_DELETION = [
  'Completed order, payment, refund and settlement records required for accounting',
  'Resolved disputes and support history required for fraud prevention and legal claims',
  'Policy acceptances and security audit records',
] as const;

type PrivacyClient = Pick<
  Prisma.TransactionClient,
  | 'user'
  | 'shop'
  | 'shopMembership'
  | 'platformMembership'
  | 'rider'
  | 'order'
  | 'dispute'
  | 'refund'
  | 'groupOrder'
  | 'groupOrderParticipant'
  | 'supportTicket'
  | 'subscription'
  | 'shopApplication'
  | 'retentionPolicy'
  | 'legalHold'
>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        email: true,
        name: true,
        avatarUrl: true,
        locale: true,
        status: true,
        isPlatformStaff: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(
    userId: string,
    patch: { name?: string; email?: string; locale?: string; avatarUrl?: string },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: patch.name,
        email: patch.email,
        locale: patch.locale,
        avatarUrl: patch.avatarUrl,
      },
      select: { id: true, phone: true, email: true, name: true, avatarUrl: true, locale: true },
    });
  }

  /**
   * Portable, human-readable account copy. Secrets, provider payloads, internal
   * reviewer notes and object-storage keys are deliberately not selected.
   */
  async exportData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        email: true,
        name: true,
        avatarUrl: true,
        locale: true,
        status: true,
        referralCode: true,
        createdAt: true,
        updatedAt: true,
        addresses: {
          select: {
            id: true,
            label: true,
            recipientName: true,
            phone: true,
            area: true,
            landmark: true,
            fullAddress: true,
            lat: true,
            lng: true,
            isDefault: true,
            createdAt: true,
          },
        },
        sessions: {
          select: {
            id: true,
            surface: true,
            userAgent: true,
            ip: true,
            createdAt: true,
            lastUsedAt: true,
            expiresAt: true,
            revokedAt: true,
          },
        },
        orders: {
          orderBy: { placedAt: 'desc' },
          select: {
            id: true,
            code: true,
            status: true,
            recipientName: true,
            recipientPhone: true,
            area: true,
            landmark: true,
            fullAddress: true,
            lat: true,
            lng: true,
            subtotal: true,
            deliveryFee: true,
            discount: true,
            loyaltyDiscount: true,
            loyaltyPointsRedeemed: true,
            total: true,
            paymentMethod: true,
            paymentStatus: true,
            note: true,
            placedAt: true,
            acceptedAt: true,
            packedAt: true,
            dispatchedAt: true,
            deliveredAt: true,
            cancelledAt: true,
            cancelReason: true,
            shop: { select: { id: true, name: true, slug: true } },
            items: {
              select: { nameSnapshot: true, unitSnapshot: true, price: true, qty: true },
            },
            events: {
              orderBy: { createdAt: 'asc' },
              select: { status: true, note: true, createdAt: true },
            },
            refunds: {
              select: {
                code: true,
                amount: true,
                reason: true,
                method: true,
                status: true,
                providerRef: true,
                failureReason: true,
                completedAt: true,
                createdAt: true,
              },
            },
            review: {
              select: { rating: true, comment: true, sellerReply: true, createdAt: true },
            },
            dispute: {
              select: {
                reason: true,
                detail: true,
                status: true,
                resolution: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
        notifications: {
          orderBy: { createdAt: 'desc' },
          select: {
            type: true,
            title: true,
            body: true,
            data: true,
            channel: true,
            readAt: true,
            createdAt: true,
          },
        },
        supportTickets: {
          orderBy: { createdAt: 'desc' },
          select: {
            code: true,
            orderId: true,
            subject: true,
            category: true,
            status: true,
            priority: true,
            createdAt: true,
            updatedAt: true,
            messages: {
              orderBy: { createdAt: 'asc' },
              select: { body: true, attachments: true, isStaff: true, createdAt: true },
            },
          },
        },
        loyaltyAccount: { select: { points: true, tier: true, updatedAt: true } },
        loyaltyTxns: {
          orderBy: { createdAt: 'desc' },
          select: { delta: true, reason: true, orderId: true, createdAt: true },
        },
        referralsMade: {
          select: {
            code: true,
            status: true,
            rewardGranted: true,
            qualifiedAt: true,
            rewardedAt: true,
            referrerReward: true,
            refereeReward: true,
            createdAt: true,
          },
        },
        referralReceived: {
          select: {
            code: true,
            status: true,
            rewardGranted: true,
            qualifiedAt: true,
            rewardedAt: true,
            refereeReward: true,
            createdAt: true,
          },
        },
        subscription: {
          select: { plan: true, status: true, startedAt: true, renewsAt: true, cancelledAt: true },
        },
        hostedGroupOrders: {
          select: { code: true, status: true, expiresAt: true, createdAt: true },
        },
        groupParticipations: {
          select: {
            items: true,
            joinedAt: true,
            groupOrder: { select: { code: true, status: true, expiresAt: true } },
          },
        },
        policyAcceptances: {
          select: {
            version: true,
            acceptedAt: true,
            policy: { select: { key: true, title: true, effectiveAt: true } },
          },
        },
        couponRedemptions: {
          select: {
            amount: true,
            releasedAt: true,
            createdAt: true,
            coupon: { select: { code: true } },
            order: { select: { code: true } },
          },
        },
        customerConversations: {
          orderBy: { lastMessageAt: 'desc' },
          select: {
            kind: true,
            status: true,
            lastMessageAt: true,
            createdAt: true,
            shop: { select: { name: true, slug: true } },
            order: { select: { code: true } },
            messages: {
              orderBy: { createdAt: 'asc' },
              select: { sender: true, body: true, createdAt: true },
            },
          },
        },
        savedShops: {
          select: { createdAt: true, shop: { select: { name: true, slug: true } } },
        },
        savedProducts: {
          select: { createdAt: true, product: { select: { name: true, id: true } } },
        },
        shopApplications: {
          orderBy: { createdAt: 'desc' },
          select: {
            reference: true,
            status: true,
            shopName: true,
            shopNameNp: true,
            description: true,
            contactPhone: true,
            contactEmail: true,
            area: true,
            fullAddress: true,
            lat: true,
            lng: true,
            locationAccuracyM: true,
            locationCapturedAt: true,
            deliveryRadiusKm: true,
            hours: true,
            ownerName: true,
            ownerNameNp: true,
            citizenshipNo: true,
            registrationNo: true,
            panNo: true,
            vatNo: true,
            payoutMethod: true,
            bankName: true,
            bankBranch: true,
            bankAccountNo: true,
            bankAccountName: true,
            walletNumber: true,
            submittedAt: true,
            reviewedAt: true,
            decisionNote: true,
            createdAt: true,
            updatedAt: true,
            documents: {
              select: {
                kind: true,
                fileName: true,
                mimeType: true,
                sizeBytes: true,
                review: true,
                reviewNote: true,
                createdAt: true,
              },
            },
            events: {
              orderBy: { createdAt: 'asc' },
              select: { type: true, message: true, createdAt: true },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'user.data_exported',
        entityType: 'User',
        entityId: userId,
        surface: 'customer',
      },
    });

    return { schemaVersion: '1.0', generatedAt: new Date().toISOString(), account: user };
  }

  async deletionEligibility(userId: string): Promise<AccountDeletionEligibility> {
    await this.ensureActiveUser(this.prisma, userId);
    return this.collectDeletionEligibility(this.prisma, userId);
  }

  async requestDeletionCode(userId: string) {
    const user = await this.ensureActiveUser(this.prisma, userId);
    const eligibility = await this.collectDeletionEligibility(this.prisma, userId);
    if (!eligibility.eligible) {
      throw new ConflictException({
        message: 'Resolve the listed account responsibilities before deleting your account.',
        ...eligibility,
      });
    }
    return this.auth.requestOtp({ phone: user.phone, purpose: 'account_deletion' });
  }

  async deleteAccount(userId: string, code: string, reason?: string) {
    const user = await this.ensureActiveUser(this.prisma, userId);
    await this.auth.verifyOtpChallenge({
      phone: user.phone,
      code,
      purpose: 'account_deletion',
    });

    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Serialize deletion with compliance staff placing a legal hold. Checking
      // the hold without this lock leaves a gap between eligibility and erase.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(83538, hashtext(${userId}))::text AS acquired`;
      const eligibility = await this.collectDeletionEligibility(tx, userId);
      if (!eligibility.eligible) {
        throw new ConflictException({
          message: 'Your account changed and cannot be deleted yet. Review the new blockers.',
          ...eligibility,
        });
      }

      // Sessions and OTP challenges are authentication data, not transaction
      // evidence. Erase their IP/user-agent and phone identifier immediately.
      await tx.session.deleteMany({ where: { userId } });
      await tx.otpChallenge.deleteMany({ where: { identifier: user.phone } });
      await tx.address.updateMany({
        where: { userId },
        data: {
          label: 'Deleted address',
          recipientName: 'Deleted user',
          phone: '',
          area: 'Removed',
          landmark: null,
          fullAddress: 'Removed at account deletion',
          lat: null,
          lng: null,
          isDefault: false,
        },
      });

      // Ephemeral customer data is erased. Order-linked communication and
      // completed transaction records remain pseudonymised for legal retention.
      await tx.cart.deleteMany({ where: { userId } });
      await tx.savedShop.deleteMany({ where: { userId } });
      await tx.savedProduct.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.supportAssistantSession.deleteMany({ where: { userId, ticketId: null } });
      await tx.shopConversation.deleteMany({ where: { customerId: userId, orderId: null } });
      await tx.loyaltyTransaction.deleteMany({ where: { userId, orderId: null } });
      await tx.loyaltyAccount.deleteMany({ where: { userId } });

      const disposableApplications = await tx.shopApplication.findMany({
        where: { applicantId: userId, status: { in: ['DRAFT', 'REJECTED', 'WITHDRAWN'] } },
        select: { id: true, documents: { select: { storageKey: true } } },
      });
      const documentKeys = new Set<string>();
      for (const application of disposableApplications) {
        for (const document of application.documents) {
          // The key was written by our upload service, not supplied by the
          // customer. Refuse a legacy/malformed key instead of risking the
          // deletion of somebody else's private object.
          if (!document.storageKey.startsWith(`private/shop-applications/${application.id}/`)) {
            throw new ConflictException('Application evidence needs manual review before this account can be deleted');
          }
          documentKeys.add(document.storageKey);
        }
      }
      if (documentKeys.size) {
        await tx.privateObjectDeletion.createMany({
          data: [...documentKeys].map((storageKey) => ({
            storageKey,
            userId,
            source: 'ACCOUNT_DELETION_APPLICATION',
          })),
        });
      }
      await tx.shopApplication.deleteMany({
        where: { applicantId: userId, status: { in: ['DRAFT', 'REJECTED', 'WITHDRAWN'] } },
      });

      const retention = await tx.retentionPolicy.findUnique({
        where: { key: 'deleted_account_order_pii' },
        select: { days: true, isActive: true },
      });
      // 1,825 days can be shorter than five calendar years when leap days
      // intervene. Keep a small cushion pending Nepal counsel sign-off.
      const retentionDays = retention?.isActive && retention.days >= 1830 ? retention.days : 1830;
      const purgeEligibleAt = new Date(deletedAt);
      purgeEligibleAt.setUTCDate(purgeEligibleAt.getUTCDate() + retentionDays);

      await tx.user.update({
        where: { id: userId },
        data: {
          phone: `deleted_${userId}`,
          email: null,
          name: null,
          avatarUrl: null,
          referralCode: null,
          status: 'DELETED',
          locale: 'en',
          isPlatformStaff: false,
        },
      });
      await tx.dataErasureRequest.upsert({
        where: { userId },
        create: {
          userId,
          status: 'ANONYMIZED',
          requestedAt: deletedAt,
          anonymizedAt: deletedAt,
          purgeEligibleAt,
        },
        update: {
          status: 'ANONYMIZED',
          requestedAt: deletedAt,
          anonymizedAt: deletedAt,
          purgeEligibleAt,
          purgedAt: null,
          attempts: 0,
          lastAttemptAt: null,
          lastError: null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'user.account_deleted',
          entityType: 'User',
          entityId: userId,
          surface: 'customer',
          before: { status: 'ACTIVE' },
          after: {
            status: 'DELETED',
            deletedAt: deletedAt.toISOString(),
            purgeEligibleAt: purgeEligibleAt.toISOString(),
            reason: reason || null,
            retainedCategories: [...RETAINED_AFTER_DELETION],
          },
        },
      });
    });

    return { deleted: true as const, retained: [...RETAINED_AFTER_DELETION] };
  }

  private async ensureActiveUser(db: PrivacyClient, userId: string) {
    const user = await db.user.findFirst({
      where: { id: userId, status: 'ACTIVE' },
      select: { id: true, phone: true },
    });
    if (!user) throw new NotFoundException('Active user not found');
    return user;
  }

  private async collectDeletionEligibility(
    db: PrivacyClient,
    userId: string,
  ): Promise<AccountDeletionEligibility> {
    const [
      ownedShops,
      activeShopRoles,
      platformRoles,
      riderProfiles,
      activeOrders,
      openDisputes,
      pendingRefunds,
      hostedGroups,
      joinedGroups,
      openTickets,
      activeSubscriptions,
      activeApplications,
      activeLegalHolds,
    ] = await Promise.all([
      db.shop.count({ where: { ownerId: userId } }),
      db.shopMembership.count({ where: { userId, status: 'ACTIVE' } }),
      db.platformMembership.count({ where: { userId } }),
      db.rider.count({ where: { userId } }),
      db.order.count({
        where: {
          customerId: userId,
          status: { in: ['PLACED', 'ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY'] },
        },
      }),
      db.dispute.count({
        where: { order: { customerId: userId }, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      }),
      db.refund.count({
        where: { order: { customerId: userId }, status: { in: ['PENDING', 'PROCESSING'] } },
      }),
      db.groupOrder.count({
        where: { hostId: userId, status: { in: ['OPEN', 'LOCKED'] } },
      }),
      db.groupOrderParticipant.count({
        where: { userId, groupOrder: { status: { in: ['OPEN', 'LOCKED'] } } },
      }),
      db.supportTicket.count({ where: { userId, status: { in: ['OPEN', 'PENDING'] } } }),
      db.subscription.count({ where: { userId, status: 'ACTIVE' } }),
      db.shopApplication.count({
        where: {
          applicantId: userId,
          status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'] },
        },
      }),
      db.legalHold.count({
        where: {
          subjectType: 'USER',
          subjectId: userId,
          releasedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
    ]);

    const blockers = [
      this.blocker('SHOP_OWNER', ownedShops, 'Transfer or close your owned shop first.'),
      this.blocker('SHOP_ROLE', activeShopRoles, 'Leave your active shop staff role first.'),
      this.blocker('PLATFORM_ROLE', platformRoles, 'Remove your platform staff role first.'),
      this.blocker('RIDER_PROFILE', riderProfiles, 'Deactivate your rider profile first.'),
      this.blocker('ACTIVE_ORDER', activeOrders, 'Wait for active orders to finish or cancel.'),
      this.blocker('OPEN_DISPUTE', openDisputes, 'Resolve open order disputes first.'),
      this.blocker('PENDING_REFUND', pendingRefunds, 'Wait for pending refunds to finish.'),
      this.blocker('HOSTED_GROUP_ORDER', hostedGroups, 'Close your active group orders first.'),
      this.blocker('JOINED_GROUP_ORDER', joinedGroups, 'Leave active group orders first.'),
      this.blocker('OPEN_SUPPORT_TICKET', openTickets, 'Resolve open support tickets first.'),
      this.blocker('ACTIVE_SUBSCRIPTION', activeSubscriptions, 'Cancel GoPasal Gold first.'),
      this.blocker(
        'ACTIVE_SHOP_APPLICATION',
        activeApplications,
        'Withdraw or complete your seller application first.',
      ),
      this.blocker('LEGAL_HOLD', activeLegalHolds, 'This account is subject to a legal preservation hold. Contact support.'),
    ].filter((row): row is AccountDeletionBlocker => row !== null);

    return {
      eligible: blockers.length === 0,
      blockers,
      retained: [...RETAINED_AFTER_DELETION],
    };
  }

  private blocker(code: string, count: number, message: string): AccountDeletionBlocker | null {
    return count > 0 ? { code, count, message } : null;
  }
}

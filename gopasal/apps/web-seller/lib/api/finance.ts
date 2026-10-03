import { authedRequest } from './client';

export type SettlementWire = {
  id: string;
  code: string;
  shopId: string;
  windowStart: string;
  windowEnd: string;
  onlineSellerPayable: number;
  codCommissionReceivable: number;
  refundAdjustments: number;
  netAmount: number;
  direction: 'PAYOUT_TO_SELLER' | 'COLLECTION_FROM_SELLER';
  status: 'OPEN' | 'PAID' | 'FAILED';
  payoutMethod: 'BANK' | 'ESEWA' | 'KHALTI' | null;
  payoutDestinationMasked: string | null;
  providerReference: string | null;
  failureReason: string | null;
  completedAt: string | null;
  createdAt: string;
  shop: { id: string; name: string; area: string | null };
  lines: Array<{ id: string; orderFinance: { order: { id: string; code: string; paymentMethod: string; total: number; deliveredAt: string | null } } }>;
};

export type SellerFinanceWire = {
  summary: {
    escrowHeld: number;
    escrowOrders: number;
    onlineReady: number;
    codCommissionDue: number;
    openSettlementAmount: number;
  };
  settlements: SettlementWire[];
  refunds: Array<{ id: string; code: string; amount: number; reason: string; method: string; createdAt: string; order: { code: string } }>;
  generatedAt: string;
};

export function fetchShopFinance(shopId: string, signal?: AbortSignal) {
  return authedRequest<SellerFinanceWire>(`/seller/shops/${encodeURIComponent(shopId)}/finance`, { signal });
}

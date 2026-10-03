import { authedRequest } from './client';

export type PrivacyOverview = {
  policy: { days: number; legalBasis: string | null; updatedAt: string } | null;
  counts: { due: number; pending: number; purged: number; activeHolds: number; objectsPending: number; objectsFailed: number };
  requests: Array<{
    id: string; userId: string; status: 'ANONYMIZED' | 'PURGING' | 'PURGED'; requestedAt: string;
    purgeEligibleAt: string; purgedAt: string | null; attempts: number; lastError: string | null;
  }>;
  holds: Array<{
    id: string; subjectId: string; reason: string; placedById: string; placedAt: string;
    expiresAt: string | null; releasedAt: string | null; releasedById: string | null; releaseReason: string | null;
  }>;
  objectDeletions: Array<{
    id: string; userId: string; source: string; attempts: number; lastError: string | null; createdAt: string;
  }>;
  runs: Array<{
    id: string; status: 'RUNNING' | 'COMPLETED' | 'FAILED'; source: string; scanned: number;
    purged: number; held: number; failed: number; objectScanned: number; objectsRemoved: number;
    objectFailed: number; objectHeld: number; startedAt: string; completedAt: string | null; error: string | null;
  }>;
};

export const privacyApi = {
  overview: () => authedRequest<PrivacyOverview>('/admin/privacy'),
  updatePolicy: (days: number, legalBasis: string) => authedRequest('/admin/privacy/policy', { method: 'PATCH', body: { days, legalBasis } }),
  placeHold: (userId: string, reason: string, expiresAt?: string) => authedRequest('/admin/privacy/holds', { method: 'POST', body: { userId, reason, ...(expiresAt ? { expiresAt } : {}) } }),
  releaseHold: (holdId: string, reason: string) => authedRequest(`/admin/privacy/holds/${encodeURIComponent(holdId)}/release`, { method: 'POST', body: { reason } }),
  run: () => authedRequest<PrivacyOverview['runs'][number]>('/admin/privacy/runs', { method: 'POST' }),
};

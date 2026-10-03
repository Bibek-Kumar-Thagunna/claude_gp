import { rawRequest } from "@gopasal/api-client";
import { authedRequest } from "./client";

export type InvitePreview = {
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  scope: "SHOP" | "PLATFORM";
  shop: { id: string; name: string; slug: string } | null;
  role: { id: string; name: string; description: string | null };
  invitedBy: string | null;
  name: string | null;
  note: string | null;
  phoneMasked: string;
  expiresAt: string;
  signInWith: "phone-otp";
};

export type AcceptedInvite = {
  accepted: true;
  scope: "SHOP" | "PLATFORM";
  shopId: string | null;
  role: string;
  refreshAccess: true;
};

export type PendingInvite = {
  id: string;
  scope: "SHOP" | "PLATFORM";
  shop: { id: string; name: string } | null;
  role: string;
  note: string | null;
  expiresAt: string;
  requiresCode: true;
};

export const previewInvite = (token: string, signal?: AbortSignal) =>
  rawRequest<InvitePreview>(`/invites/${encodeURIComponent(token)}`, { signal });

export const pendingInvites = () => authedRequest<PendingInvite[]>("/invites/mine/pending");

export const acceptInvite = (input: { token?: string; code?: string; scope?: "SHOP" | "PLATFORM" }) =>
  authedRequest<AcceptedInvite>("/invites/accept", { method: "POST", body: input });

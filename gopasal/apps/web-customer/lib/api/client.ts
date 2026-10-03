import { createApiClient } from "@gopasal/api-client";

const api = createApiClient({ storageKey: "gp-customer-session", surface: "customer" });

export const {
  getSession,
  setSession,
  clearSession,
  sessionFrom,
  subscribe,
  watchStorage,
  authedRequest,
  authedBlob,
  requestOtp,
  verifyOtp,
  fetchMe,
  revokeSession,
} = api;

import { createApiClient } from "@gopasal/api-client";

const api = createApiClient({ storageKey: "gp-rider-session", surface: "rider" });

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

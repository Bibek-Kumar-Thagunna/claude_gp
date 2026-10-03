import type { Paginated } from "@gopasal/api-client";
import { authedRequest } from "./client";

export type ConversationMessage = {
  id: string;
  conversationId: string;
  authorId: string;
  sender: "CUSTOMER" | "SHOP" | "SYSTEM";
  body: string;
  clientMessageId: string;
  createdAt: string;
};

export type ShopConversation = {
  id: string;
  shopId: string;
  customerId: string;
  orderId: string | null;
  kind: "PRE_ORDER" | "ORDER";
  status: "OPEN" | "CLOSED";
  lastMessageAt: string;
  hasUnread: boolean;
  customer: { id: string; name: string | null; avatarUrl: string | null };
  shop: { id: string; name: string; slug: string; emoji: string | null };
  order: { id: string; code: string; status: string; placedAt: string } | null;
  lastMessage?: ConversationMessage | null;
  messages?: ConversationMessage[];
};

export const sellerMessagesApi = {
  list: (shopId: string, page = 1, signal?: AbortSignal) =>
    authedRequest<Paginated<ShopConversation>>(
      `/seller/shops/${encodeURIComponent(shopId)}/conversations?page=${page}&limit=50`,
      { signal },
    ),
  detail: (shopId: string, id: string, signal?: AbortSignal) =>
    authedRequest<ShopConversation>(
      `/seller/shops/${encodeURIComponent(shopId)}/conversations/${encodeURIComponent(id)}`,
      { signal },
    ),
  send: (shopId: string, id: string, body: string) =>
    authedRequest<ConversationMessage>(
      `/seller/shops/${encodeURIComponent(shopId)}/conversations/${encodeURIComponent(id)}/messages`,
      { method: "POST", body: { body, clientMessageId: crypto.randomUUID() } },
    ),
  startForOrder: (shopId: string, orderId: string, body: string) =>
    authedRequest<ConversationMessage>(
      `/seller/shops/${encodeURIComponent(shopId)}/conversations/orders/start`,
      { method: "POST", body: { orderId, body, clientMessageId: crypto.randomUUID() } },
    ),
  markRead: (shopId: string, id: string) =>
    authedRequest<{ ok: true }>(
      `/seller/shops/${encodeURIComponent(shopId)}/conversations/${encodeURIComponent(id)}/read`,
      { method: "PATCH" },
    ),
  close: (shopId: string, id: string) =>
    authedRequest<{ ok: true; status: "CLOSED" }>(
      `/seller/shops/${encodeURIComponent(shopId)}/conversations/${encodeURIComponent(id)}/close`,
      { method: "PATCH" },
    ),
};

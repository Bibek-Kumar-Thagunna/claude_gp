import type { Dictionary } from "@gopasal/native-ui";

/** Strings for the chat screens. See ./core.ts for the house rules. */
export const chat: Dictionary = {
  /* ── the orders list ─────────────────────────────────────────────────────
   *
   * These stage labels are the list's own phrasing and are deliberately not
   * `status.*`: the tracking screen names the stage ("Packed"), the list says
   * what is happening to the order right now ("Ready for a rider").
   */
  "orderlist.stage.PLACED": { en: "Waiting for the shop", np: "पसलको पर्खाइमा" },
  "orderlist.stage.ACCEPTED": { en: "Being packed", np: "प्याक हुँदै" },
  "orderlist.stage.PACKED": { en: "Ready for a rider", np: "राइडर आउन बाँकी" },
  "orderlist.stage.OUT_FOR_DELIVERY": { en: "On the way", np: "बाटोमा" },
  "orderlist.stage.DELIVERED": { en: "Delivered", np: "पुग्यो" },
  "orderlist.stage.CANCELLED": { en: "Cancelled", np: "रद्द भयो" },
  "orderlist.stage.REJECTED": { en: "Not accepted", np: "स्वीकार भएन" },

  "orderlist.section.live": { en: "Happening now", np: "अहिले चलिरहेको" },
  "orderlist.section.past": { en: "Earlier", np: "पहिलेका" },

  "orderlist.meta.one": {
    en: "{code} · {date} · {count} item",
    np: "{code} · {date} · {count} सामान",
  },
  "orderlist.meta.many": {
    en: "{code} · {date} · {count} items",
    np: "{code} · {date} · {count} सामान",
  },

  "orderlist.orderAgain": { en: "ORDER AGAIN", np: "फेरि अर्डर" },
  "orderlist.orderAgain.a11y": {
    en: "Order from {shop} again",
    np: "{shop} बाट फेरि अर्डर गर्नुहोस्",
  },

  "orderlist.signedOut.title": {
    en: "Sign in to see your orders",
    np: "आफ्ना अर्डर हेर्न साइन इन गर्नुहोस्",
  },
  "orderlist.signedOut.detail": {
    en: "Your orders follow your number, so they're there on any phone you sign in on.",
    np: "तपाईंका अर्डर फोन नम्बरसँगै रहन्छन्, त्यसैले जुनसुकै फोनबाट साइन इन गर्दा पनि भेटिन्छन्।",
  },

  /* ── the shop inbox ──────────────────────────────────────────────────── */
  "chat.inbox.title": { en: "Messages", np: "सन्देशहरू" },
  "chat.inbox.subtitle": {
    en: "Ask a shopkeeper about stock, delivery or a substitute.",
    np: "सामान छ कि छैन, डेलिभरी कति बेर लाग्छ, वा अर्को विकल्प — पसललाई सोध्नुहोस्।",
  },
  "chat.inbox.empty.title": { en: "No messages yet", np: "अहिलेसम्म कुनै सन्देश छैन" },
  "chat.inbox.empty.detail": {
    en: 'Open a shop and tap "Message shop" to ask about stock, delivery or a substitute.',
    np: "पसल खोलेर «पसललाई सन्देश» थिच्नुहोस्, अनि सामान, डेलिभरी वा विकल्पबारे सोध्नुहोस्।",
  },
  "chat.row.noMessages": { en: "No messages yet", np: "अहिलेसम्म कुनै सन्देश छैन" },
  "chat.orderTag": { en: "ORDER {code}", np: "अर्डर {code}" },
  "chat.lastFromYou": { en: "You: {body}", np: "तपाईं: {body}" },

  /* Relative times, short enough to sit at the end of a conversation row. */
  "chat.time.now": { en: "now", np: "अहिले" },
  "chat.time.minutes": { en: "{count}m", np: "{count} मि" },
  "chat.time.hours": { en: "{count}h", np: "{count} घ" },
  "chat.time.days": { en: "{count}d", np: "{count} दि" },

  "chat.signedOut.title": {
    en: "Sign in to see your messages",
    np: "आफ्ना सन्देश हेर्न साइन इन गर्नुहोस्",
  },
  "chat.signedOut.detail": {
    en: "Your conversations follow your number, so they are there on any phone you sign in on.",
    np: "तपाईंका कुराकानी फोन नम्बरसँगै रहन्छन्, त्यसैले जुनसुकै फोनबाट साइन इन गर्दा पनि भेटिन्छन्।",
  },

  /* ── one conversation ────────────────────────────────────────────────── */
  "chat.signIn.title": {
    en: "Sign in to message shops",
    np: "पसललाई सन्देश पठाउन साइन इन गर्नुहोस्",
  },
  "chat.shopFallback": { en: "Shop", np: "पसल" },
  "chat.aboutOrder": { en: "About order {code}", np: "अर्डर {code} बारे" },
  "chat.numberPrivate": {
    en: "Your number is not shared",
    np: "तपाईंको फोन नम्बर देखाइँदैन",
  },
  "chat.openShop.a11y": { en: "Open {shop}", np: "{shop} खोल्नुहोस्" },
  "chat.empty.title": { en: "Ask {shop} anything", np: "{shop} लाई जे पनि सोध्नुहोस्" },
  "chat.empty.detail": {
    en: "Whether something is in stock, how long delivery takes, a substitute for an item they are out of. The shop sees your name, never your phone number.",
    np: "सामान छ कि छैन, डेलिभरी कति बेर लाग्छ, सकिएको सामानको सट्टा के पाइन्छ। पसलले तपाईंको नाम मात्र देख्छ, फोन नम्बर कहिल्यै देख्दैन।",
  },
  "chat.sending": { en: "SENDING", np: "पठाउँदै" },
  "chat.composer.placeholder": { en: "Message {shop}…", np: "{shop} लाई सन्देश…" },
  "chat.composer.a11y": { en: "Message", np: "सन्देश" },
  "chat.send.a11y": { en: "Send message", np: "सन्देश पठाउनुहोस्" },
};

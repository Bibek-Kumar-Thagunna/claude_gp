import type { Dictionary } from "@gopasal/native-ui";

/** Strings for the group screens. See ./core.ts for the house rules. */
export const group: Dictionary = {
  /* ── the list of groups you are in ───────────────────────────────────── */
  "group.status.OPEN": {
    en: "Open — people can still add items",
    np: "खुला — अझै सामान थप्न सकिन्छ",
  },
  "group.status.LOCKED": {
    en: "Locked — the host is checking out",
    np: "लक भयो — होस्टले भुक्तानी गर्दै हुनुहुन्छ",
  },
  "group.status.PLACED": { en: "Ordered", np: "अर्डर भयो" },
  "group.status.CANCELLED": { en: "Cancelled", np: "रद्द भयो" },

  "group.hostBadge": { en: "HOST", np: "होस्ट" },
  "group.list.meta.one": { en: "{code} · {count} person", np: "{code} · {count} जना" },
  "group.list.meta.other": { en: "{code} · {count} people", np: "{code} · {count} जना" },

  "group.intro.title": {
    en: "One delivery, split between you",
    np: "एउटै डेलिभरी, आपसमा बाँडेर",
  },
  "group.intro.detail": {
    en: "Everyone adds their own items to the same basket. One delivery fee, and the shop's minimum is easier to reach between you. The host pays and the order arrives together.",
    np: "सबैले एउटै कार्टमा आफ्नो सामान थप्नुहुन्छ। डेलिभरी शुल्क एक पटक मात्र, र पसलको न्यूनतम रकम पनि मिलेर सजिलै पुग्छ। होस्टले भुक्तानी गर्नुहुन्छ र अर्डर सँगै आउँछ।",
  },
  "group.intro.start": { en: "Start one at a shop", np: "पसलबाट सुरु गर्नुहोस्" },

  "group.join.title": { en: "Have a code?", np: "कोड छ?" },
  "group.join.a11y": { en: "Group code", np: "ग्रुप कोड" },
  "group.join.action": { en: "Join", np: "सामेल हुनुहोस्" },
  "group.join.badCode": {
    en: "A group code looks like GRP-XXXXXX.",
    np: "ग्रुप कोड GRP-XXXXXX जस्तो हुन्छ।",
  },
  "group.join.failed": {
    en: "Couldn't join that group.",
    np: "त्यो ग्रुपमा सामेल हुन सकिएन।",
  },

  "group.signIn.title": {
    en: "Sign in to order together",
    np: "मिलेर अर्डर गर्न साइन इन गर्नुहोस्",
  },
  "group.mine.heading": { en: "YOUR GROUPS", np: "तपाईंका ग्रुपहरू" },
  "group.mine.empty": {
    en: 'None yet. Open a shop and tap "Order together" to start one.',
    np: "अहिलेसम्म छैन। पसल खोलेर “मिलेर अर्डर” थिच्नुहोस्।",
  },

  /* ── the room ────────────────────────────────────────────────────────── */
  "group.room.status.open": { en: "Open — everyone can add", np: "खुला — सबैले थप्न सक्नुहुन्छ" },
  "group.room.status.locked": { en: "Locked for checkout", np: "भुक्तानीका लागि लक भयो" },

  "group.code.share": { en: "Share this code", np: "यो कोड पठाउनुहोस्" },
  "group.code.copyA11y": { en: "Copy group code {code}", np: "ग्रुप कोड {code} कपी गर्नुहोस्" },
  "group.code.copied": { en: "COPIED", np: "कपी भयो" },
  "group.code.tapToCopy": { en: "TAP TO COPY", np: "कपी गर्न थिच्नुहोस्" },

  "group.share": { en: "Share", np: "पठाउनुहोस्" },
  "group.share.message": {
    en: "Join my GoPasal order from {shop} — code {code}. https://gopasal.com/group-orders?code={code}",
    np: "{shop} बाट मेरो गोपसल अर्डरमा सामेल हुनुहोस् — कोड {code}। https://gopasal.com/group-orders?code={code}",
  },

  "group.people.one": { en: "{count} person", np: "{count} जना" },
  "group.people.other": { en: "{count} people", np: "{count} जना" },
  "group.you": { en: "You", np: "तपाईं" },
  "group.someone": { en: "Someone", np: "कोही" },
  "group.host": { en: "host", np: "होस्ट" },
  "group.items.none": { en: "nothing yet", np: "अहिलेसम्म केही छैन" },
  "group.items.one": { en: "{count} item", np: "{count} सामान" },
  "group.items.other": { en: "{count} items", np: "{count} सामान" },

  /* ── your own basket inside the room ─────────────────────────────────── */
  "group.basket.title": { en: "Your items", np: "तपाईंका सामान" },
  "group.basket.unsaved": { en: "UNSAVED", np: "सेभ बाँकी" },
  "group.basket.lockedNote": {
    en: "The host locked this group, so items can't change while they check out.",
    np: "होस्टले यो ग्रुप लक गर्नुभयो, त्यसैले भुक्तानी नसकिँदासम्म सामान फेर्न मिल्दैन।",
  },
  "group.basket.closedNote": { en: "This group is closed.", np: "यो ग्रुप बन्द भइसक्यो।" },
  "group.qty.less": { en: "Fewer {item}", np: "{item} घटाउनुहोस्" },
  "group.qty.more": { en: "More {item}", np: "{item} थप्नुहोस्" },
  "group.basket.save": { en: "Save my items", np: "मेरो सामान सेभ गर्नुहोस्" },
  "group.basket.saved": {
    en: "Saved — everyone in the group can see your items.",
    np: "सेभ भयो — ग्रुपका सबैले तपाईंका सामान देख्न सक्नुहुन्छ।",
  },
  "group.basket.addPrompt": {
    en: "Add what you want and save it for the group.",
    np: "आफूलाई चाहिने सामान थपेर ग्रुपका लागि सेभ गर्नुहोस्।",
  },

  /* ── host controls ───────────────────────────────────────────────────── */
  "group.host.title": { en: "When everyone's in", np: "सबै आइसकेपछि" },
  "group.host.lockNote": {
    en: "Locking stops anyone adding more, then you check out for the group.",
    np: "लक गरेपछि कसैले थप्न पाउँदैन, अनि तपाईंले ग्रुपका लागि भुक्तानी गर्नुहुन्छ।",
  },
  "group.host.lock": { en: "Lock and check out", np: "लक गरेर चेकआउट" },
  "group.host.cancel": { en: "Cancel this group", np: "यो ग्रुप रद्द गर्नुहोस्" },

  "group.pay.title": { en: "Pay for the group", np: "ग्रुपका लागि भुक्तानी" },
  "group.pay.deliverTo": { en: "Deliver to {label}", np: "{label} मा पुर्‍याउनुहोस्" },
  "group.pay.items": { en: "Items", np: "सामान" },
  "group.pay.quoteError": {
    en: "Couldn't price the group.",
    np: "ग्रुपको रकम निकाल्न सकिएन।",
  },
  "group.pay.place": { en: "Place the combined order", np: "सबैको अर्डर एकैचोटि गर्नुहोस्" },
  "group.error.tryAgain": { en: "Try again.", np: "फेरि प्रयास गर्नुहोस्।" },

  "group.leave": { en: "Leave this group", np: "यो ग्रुप छोड्नुहोस्" },
  "group.trackOrder": { en: "Track order {code}", np: "अर्डर {code} ट्र्याक गर्नुहोस्" },

  "group.cancel.confirm.title": { en: "Cancel the group?", np: "ग्रुप रद्द गर्ने?" },
  "group.cancel.confirm.message": {
    en: "Everyone's items are discarded.",
    np: "सबैका सामान हटाइन्छन्।",
  },
  "group.cancel.confirm.yes": { en: "Cancel group", np: "ग्रुप रद्द गर्नुहोस्" },
  "group.cancel.confirm.no": { en: "Keep it", np: "रहन दिनुहोस्" },

  "group.leave.confirm.title": { en: "Leave this group?", np: "यो ग्रुप छोड्ने?" },
  "group.leave.confirm.message": {
    en: "Your items are removed from it.",
    np: "तपाईंका सामान यसबाट हटाइन्छन्।",
  },
  "group.leave.confirm.yes": { en: "Leave", np: "छोड्नुहोस्" },
  "group.leave.confirm.no": { en: "Stay", np: "रहनुहोस्" },
};

import type { Dictionary } from "@gopasal/native-ui";

/** Strings for the order screens. See ./core.ts for the house rules. */
export const order: Dictionary = {
  /* ── delivered: handover proof and the review ────────────────────────── */
  "delivered.handover.title": { en: "Handover", np: "सामान बुझाइ" },
  "delivered.photo.show": {
    en: "Show handover photo",
    np: "सामान बुझाउँदाको फोटो हेर्नुहोस्",
  },
  "delivered.photo.showA11y": {
    en: "Show the handover photo",
    np: "सामान बुझाउँदाको फोटो हेर्नुहोस्",
  },
  "delivered.photo.alt": { en: "Photo taken at handover", np: "सामान बुझाउँदा खिचिएको फोटो" },
  "delivered.photo.caption": {
    en: "Taken by the rider at handover. Only you and the shop can see it.",
    np: "राइडरले सामान बुझाउँदा खिचेको हो। तपाईं र पसलले मात्र हेर्न सक्नुहुन्छ।",
  },
  "delivered.photo.none": {
    en: "No handover photo was taken for this delivery.",
    np: "यो डेलिभरीमा सामान बुझाउँदाको फोटो खिचिएको छैन।",
  },

  "delivered.review.title": { en: "How was it?", np: "कस्तो लाग्यो?" },
  "delivered.review.detail": {
    en: "Your rating is what tells the next customer whether this shop is any good.",
    np: "तपाईंको मूल्याङ्कनले नै अर्को ग्राहकलाई यो पसल कस्तो छ भन्ने बताउँछ।",
  },
  "delivered.review.star": { en: "Rate {n} out of 5", np: "5 मध्ये {n} तारा दिनुहोस्" },
  "delivered.review.placeholder": {
    en: "Anything the shop should know? (optional)",
    np: "पसललाई केही भन्नु छ? (वैकल्पिक)",
  },
  "delivered.review.commentA11y": { en: "Review comment", np: "समीक्षा टिप्पणी" },
  "delivered.review.send": { en: "Send review", np: "समीक्षा पठाउनुहोस्" },
  "delivered.review.needRating": { en: "Pick a rating first.", np: "पहिले अंक छान्नुहोस्।" },
  "delivered.review.failed": {
    en: "Couldn't send that review.",
    np: "समीक्षा पठाउन सकिएन।",
  },
  "delivered.thanks": { en: "Thanks", np: "धन्यवाद" },
  "delivered.thanks.detail": { en: "{shop} will see this.", np: "{shop} ले यो देख्नेछ।" },

  /* ── trouble: an unpaid order, and a dispute ─────────────────────────── */
  "trouble.pay.failed": { en: "Payment failed", np: "भुक्तानी असफल भयो" },
  "trouble.pay.unconfirmed": { en: "Payment not confirmed", np: "भुक्तानी पुष्टि भएको छैन" },
  "trouble.pay.detail": {
    en: "The order is placed, but {wallet} hasn't confirmed the money. Finish it here rather than ordering again.",
    np: "अर्डर भइसकेको छ, तर {wallet} ले पैसा पुष्टि गरेको छैन। फेरि अर्डर नगरी यहीँबाट भुक्तानी पूरा गर्नुहोस्।",
  },
  "trouble.pay.esewa": { en: "eSewa", np: "एसेवा" },
  "trouble.pay.khalti": { en: "Khalti", np: "खल्ती" },
  "trouble.pay.finish": { en: "Finish paying", np: "भुक्तानी पूरा गर्नुहोस्" },
  "trouble.pay.opening": { en: "Opening…", np: "खुल्दै…" },
  "trouble.pay.noLink": {
    en: "The gateway didn't return a payment link. Try again in a moment.",
    np: "पेमेन्ट गेटवेले भुक्तानी लिंक दिएन। एकछिनपछि फेरि प्रयास गर्नुहोस्।",
  },
  "trouble.pay.pending": {
    en: "We haven't heard from the gateway yet. If the money left your wallet it will show here within a minute.",
    np: "पेमेन्ट गेटवेबाट अहिलेसम्म जानकारी आएको छैन। तपाईंको वालेटबाट पैसा गइसकेको छ भने एक मिनेटभित्र यहाँ देखिनेछ।",
  },
  "trouble.pay.startFailed": {
    en: "Couldn't start a new payment.",
    np: "नयाँ भुक्तानी सुरु गर्न सकिएन।",
  },

  "trouble.open.title": {
    en: "Something's wrong with this order",
    np: "यो अर्डरमा केही गडबड छ",
  },
  "trouble.open.detail": {
    en: "Missing, damaged or never arrived — raise it and we'll look at it",
    np: "छुटेको, बिग्रेको वा नआएको — उजुरी दर्ता गर्नुहोस्, हामी हेर्नेछौं",
  },
  "trouble.open.a11y": {
    en: "Report a problem with this order",
    np: "यो अर्डरको समस्या जनाउनुहोस्",
  },

  "trouble.form.title": { en: "What went wrong?", np: "के समस्या भयो?" },
  "trouble.form.placeholder": {
    en: "What happened? The more exact, the faster this is settled.",
    np: "के भयो? जति स्पष्ट लेख्नुहुन्छ, त्यति छिटो टुङ्गिन्छ।",
  },
  "trouble.form.detailA11y": { en: "Describe what happened", np: "के भयो लेख्नुहोस्" },
  "trouble.form.needReason": { en: "Pick what went wrong.", np: "के समस्या भयो छान्नुहोस्।" },
  "trouble.form.failed": {
    en: "Couldn't raise this. Try support instead.",
    np: "उजुरी दर्ता गर्न सकिएन। सहयोगमा सम्पर्क गर्नुहोस्।",
  },
  "trouble.form.notNow": { en: "Not now", np: "अहिले होइन" },
  "trouble.form.raise": { en: "Raise it", np: "उजुरी दर्ता गर्नुहोस्" },
  "trouble.form.sending": { en: "Sending…", np: "पठाउँदै…" },

  /* The reason a customer picks. The canonical English value is what goes to
     the server; only the label beside the chip is translated. */
  "trouble.reason.missing": { en: "Items missing", np: "सामान छुटेको" },
  "trouble.reason.damaged": { en: "Something was damaged", np: "केही सामान बिग्रेको" },
  "trouble.reason.neverArrived": { en: "Never arrived", np: "आइपुगेन" },
  "trouble.reason.wrong": { en: "Wrong items", np: "गलत सामान" },
  "trouble.reason.amount": { en: "Charged the wrong amount", np: "गलत रकम काटियो" },

  "trouble.dispute.title": { en: "Your dispute", np: "तपाईंको उजुरी" },
  "trouble.dispute.OPEN": {
    en: "Open — waiting for review",
    np: "दर्ता भयो — समीक्षा हुन बाँकी",
  },
  "trouble.dispute.UNDER_REVIEW": { en: "Under review", np: "समीक्षा हुँदै" },
  "trouble.dispute.RESOLVED_CUSTOMER": {
    en: "Resolved in your favour",
    np: "तपाईंको पक्षमा टुङ्गियो",
  },
  "trouble.dispute.RESOLVED_SHOP": {
    en: "Resolved in the shop's favour",
    np: "पसलको पक्षमा टुङ्गियो",
  },
  "trouble.dispute.REJECTED": { en: "Rejected", np: "अस्वीकृत भयो" },

  /* ── route canvas ────────────────────────────────────────────────────── */
  "route.km": { en: "{value} km", np: "{value} किमी" },
  "route.waitingRider": {
    en: "Waiting for a rider at {shop}",
    np: "{shop} मा राइडर आउन बाँकी",
  },
  "route.directLine": { en: "DIRECT LINE", np: "सीधा रेखा" },

  /* ── variant sheet ───────────────────────────────────────────────────── */
  "variant.oneOption": { en: "One option", np: "एउटा विकल्प" },
  "variant.chooseFrom": {
    en: "Choose from {count} options",
    np: "{count} विकल्पमध्ये छान्नुहोस्",
  },
  "variant.option.addA11y": {
    en: "Add {name} to cart, रु {price}",
    np: "{name} कार्टमा थप्नुहोस्, रु {price}",
  },
  "variant.option.soldOutA11y": { en: "{name}, sold out", np: "{name}, सकियो" },
  "variant.done": { en: "Done · {count} in cart", np: "भयो · कार्टमा {count} वटा" },
  "variant.doneA11y": { en: "Done choosing", np: "छनोट सकियो" },
  "variant.closeA11y": { en: "Close options", np: "विकल्पहरू बन्द गर्नुहोस्" },
};

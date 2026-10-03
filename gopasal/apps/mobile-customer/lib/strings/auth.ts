import type { Dictionary } from "@gopasal/native-ui";

/** Strings for the auth screens. See ./core.ts for the house rules. */
export const auth: Dictionary = {
  /* ── landing / welcome ───────────────────────────────────────────────── */
  "landing.tagline": {
    en: "Your neighbourhood shops,\ndelivered in minutes.",
    np: "तपाईंको छिमेकका पसलहरू,\nमिनेटमै घरमा।",
  },
  "landing.point.shops.title": { en: "Real shops near you", np: "नजिकका साँच्चिकै पसलहरू" },
  "landing.point.shops.detail": {
    en: "Kirana, pharmacy and more — the ones that actually deliver to your door.",
    np: "किराना, फार्मेसी र अरू धेरै — जसले साँच्चै ढोकासम्म पुर्‍याउँछन्।",
  },
  "landing.point.track.title": { en: "Watch it arrive", np: "आउँदै गरेको हेर्नुहोस्" },
  "landing.point.track.detail": {
    en: "Live rider tracking from the shop to your gate.",
    np: "पसलदेखि तपाईंको गेटसम्म राइडर कहाँ पुग्यो, सिधै हेर्नुहोस्।",
  },
  "landing.point.pay.title": { en: "Cash or online", np: "नगद वा अनलाइन" },
  "landing.point.pay.detail": {
    en: "Pay on delivery, or online with funds held until it arrives.",
    np: "सामान बुझेपछि नगद तिर्नुहोस्, वा अनलाइन तिर्नुहोस् — पैसा सामान नआएसम्म रोकिन्छ।",
  },
  "landing.getStarted": { en: "Get started", np: "सुरु गर्नुहोस्" },
  "landing.browse": { en: "Browse without signing in", np: "साइन इन नगरी हेर्नुहोस्" },
  "landing.offline": {
    en: "You can look around offline — signing in needs a connection.",
    np: "अफलाइनमा हेर्न सक्नुहुन्छ — साइन इन गर्न इन्टरनेट चाहिन्छ।",
  },

  /* ── step one: the phone number ──────────────────────────────────────── */
  "auth.phone.title": { en: "What's your number?", np: "तपाईंको नम्बर के हो?" },
  "auth.phone.detail": {
    en: "We'll text you a six-digit code. No password to remember.",
    np: "हामी तपाईंलाई छ अङ्कको ओटिपी पठाउँछौं। पासवर्ड सम्झनु पर्दैन।",
  },
  // The same digit pattern in both scripts, so there is nothing to translate.
  "auth.phone.placeholder": { en: "98XXXXXXXX" },
  "auth.phone.a11yInput": { en: "Mobile number", np: "मोबाइल नम्बर" },
  "auth.phone.hint": {
    en: "Nepali mobile numbers only, starting 97 or 98.",
    np: "नेपाली मोबाइल नम्बर मात्र, 97 वा 98 बाट सुरु हुने।",
  },
  "auth.phone.send": { en: "Send code", np: "ओटिपी पठाउनुहोस्" },
  "auth.phone.waiting": { en: "Waiting for a connection", np: "इन्टरनेट आउन कुर्दै" },
  "auth.phone.terms": {
    en: "By continuing you agree to GoPasal's Terms and Privacy Policy.",
    np: "अगाडि बढ्नुभयो भने तपाईं गोपसलका नियम र गोपनीयता नीति स्वीकार गर्नुहुन्छ।",
  },
  "auth.phone.sendFailed": {
    en: "Couldn't send the code. Try again.",
    np: "ओटिपी पठाउन सकिएन। फेरि प्रयास गर्नुहोस्।",
  },

  /* ── step two: the six-digit code ────────────────────────────────────── */
  "auth.code.title": { en: "Enter the code", np: "ओटिपी हाल्नुहोस्" },
  "auth.code.sentTo": { en: "Sent to +977 {phone}", np: "+977 {phone} मा पठाइयो" },
  "auth.code.a11yBoxes": {
    en: "Verification code, {entered} of {total} digits entered",
    np: "ओटिपी, {total} मध्ये {entered} अङ्क हालियो",
  },
  "auth.code.changeNumber": { en: "Change number", np: "नम्बर बदल्नुहोस्" },
  "auth.code.verify": { en: "Verify", np: "पुष्टि गर्नुहोस्" },
  "auth.code.resend": { en: "Resend code", np: "ओटिपी फेरि पठाउनुहोस्" },
  "auth.code.resendIn": {
    en: "Resend code in {seconds}s",
    np: "{seconds} सेकेन्डपछि फेरि पठाउनुहोस्",
  },
  "auth.code.wrong": { en: "That code didn't work.", np: "यो ओटिपी मिलेन।" },
  "auth.code.resendFailed": {
    en: "Couldn't resend the code.",
    np: "ओटिपी फेरि पठाउन सकिएन।",
  },
};

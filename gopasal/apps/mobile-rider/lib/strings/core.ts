import type { Dictionary } from "@gopasal/native-ui";

/**
 * The strings every GoPasal app shares — sign-in, the connection banner,
 * language, the common buttons — as the rider app says them.
 *
 * They start from the seller app's words so the three apps say "Send code" the
 * same way, with the sign-in and offline lines rewritten for a rider. The
 * house rules for the Nepali are the customer app's and apply here too:
 *
 *  - **Borrowed words stay borrowed.** "राइडर", "अर्डर", "डेलिभरी", "लोकेसन" are
 *    what riders say; a translation tool's Sanskrit is not.
 *  - **Money is रु and the digits stay Western.**
 *  - **Verbs are polite-plain** — "गर्नुहोस्".
 *  - **This app is read at a junction, one-handed.** Where the customer app can
 *    afford a sentence, this one gets a word.
 */
export const core: Dictionary = {
  "net.offline.title": { en: "No internet", np: "इन्टरनेट छैन" },
  "net.offline.detail": { en: "New jobs won't reach you until you're back online.", np: "इन्टरनेट नआएसम्म नयाँ काम आउँदैन।" },
  "net.unreachable.title": { en: "GoPasal isn't responding", np: "गोपसल जवाफ दिइरहेको छैन" },
  "net.unreachable.detail": { en: "Your connection looks fine — we're retrying.", np: "तपाईंको इन्टरनेट ठीक छ — हामी फेरि प्रयास गर्दैछौं।" },
  "net.slow.title": { en: "Slow connection", np: "इन्टरनेट सुस्त छ" },
  "net.slow.detail": { en: "Things may take a little longer than usual.", np: "सामान्यभन्दा अलि ढिलो हुन सक्छ।" },
  "net.retry": { en: "Retry", np: "फेरि" },
  "net.a11y.retry": { en: "Retry connection", np: "जडान फेरि प्रयास गर्नुहोस्" },
  "ui.loading": { en: "Loading", np: "लोड हुँदै" },
  "ui.yourRider": { en: "Your rider", np: "तपाईंको राइडर" },
  "auth.title": { en: "Ride with GoPasal", np: "गोपसलसँग डेलिभरी गर्नुहोस्" },
  "auth.detail": { en: "Sign in with the number your shop added you under.", np: "पसलले तपाईंलाई थपेको नम्बरबाट साइन इन गर्नुहोस्।" },
  "auth.phone.title": { en: "Ride with GoPasal", np: "गोपसलसँग डेलिभरी गर्नुहोस्" },
  "auth.phone.detail": { en: "Sign in with the number your shop added you under.", np: "पसलले तपाईंलाई थपेको नम्बरबाट साइन इन गर्नुहोस्।" },
  "auth.phone.placeholder": { en: "98XXXXXXXX" },
  "auth.phone.a11yInput": { en: "Your phone number", np: "तपाईंको फोन नम्बर" },
  "auth.phone.hint": { en: "We'll text you a six-digit code.", np: "हामी छ अंकको कोड म्यासेजमा पठाउँछौं।" },
  "auth.phone.waiting": { en: "Waiting for a connection…", np: "इन्टरनेट पर्खँदै…" },
  "auth.phone.sendFailed": { en: "Couldn't send the code. Try again in a moment.", np: "कोड पठाउन सकिएन। एकैछिनमा फेरि प्रयास गर्नुहोस्।" },
  "auth.phone.terms": { en: "By continuing you agree to GoPasal's terms and privacy policy.", np: "अगाडि बढ्नुभयो भने गोपसलका सर्त र गोपनीयता नीति मान्नुभएको हुन्छ।" },
  "auth.code.verify": { en: "Verify", np: "पुष्टि गर्नुहोस्" },
  "auth.code.changeNumber": { en: "Use a different number", np: "अर्को नम्बर प्रयोग गर्नुहोस्" },
  "auth.code.resendFailed": { en: "Couldn't send another code just yet.", np: "अहिले अर्को कोड पठाउन सकिएन।" },
  "auth.code.a11yBoxes": { en: "Verification code, {entered} of {total} digits entered", np: "पुष्टि कोड, {total} मध्ये {entered} अंक हालियो" },
  "auth.phone.label": { en: "Phone number", np: "फोन नम्बर" },
  "auth.phone.send": { en: "Send code", np: "कोड पठाउनुहोस्" },
  "auth.phone.sending": { en: "Sending…", np: "पठाउँदै…" },
  "auth.phone.invalid": { en: "That doesn't look like a Nepali mobile number.", np: "यो नेपाली मोबाइल नम्बर जस्तो देखिएन।" },
  "auth.code.title": { en: "Enter the code", np: "कोड हाल्नुहोस्" },
  "auth.code.sentTo": { en: "Sent to {phone}", np: "{phone} मा पठाइयो" },
  "auth.code.resend": { en: "Send it again", np: "फेरि पठाउनुहोस्" },
  "auth.code.resendIn": { en: "Send again in {seconds}s", np: "{seconds} सेकेन्डमा फेरि पठाउन सकिन्छ" },
  "auth.code.wrong": { en: "That code isn't right.", np: "कोड मिलेन।" },
  "language.title": { en: "Language", np: "भाषा" },
  "language.detail": { en: "English or Nepali", np: "अंग्रेजी वा नेपाली" },
  "language.a11y.use": { en: "Use {language}", np: "{language} प्रयोग गर्नुहोस्" },
  "common.continue": { en: "Continue", np: "अगाडि बढ्नुहोस्" },
  "common.cancel": { en: "Cancel", np: "रद्द" },
  "common.back": { en: "Go back", np: "फर्कनुहोस्" },
  "common.retry": { en: "Try again", np: "फेरि प्रयास" },
  "common.close": { en: "Close", np: "बन्द गर्नुहोस्" },
  "common.save": { en: "Save", np: "सुरक्षित गर्नुहोस्" },
  "common.saving": { en: "Saving…", np: "सुरक्षित गर्दै…" },
  "common.done": { en: "Done", np: "भयो" },
  "common.working": { en: "Working…", np: "पर्खनुहोस्…" },
  "common.notNow": { en: "Not now", np: "अहिले होइन" },
  "common.somethingWrong": { en: "That didn't work. Try again.", np: "काम भएन। फेरि प्रयास गर्नुहोस्।" },
};

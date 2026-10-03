import type { Dictionary } from "@gopasal/native-ui";

/** Joining a shop you were invited to. House rules are at the top of ./core.ts. */
export const joinStrings: Dictionary = {
  "join.title": { en: "Join a shop", np: "पसलमा जोडिनुहोस्" },
  "join.intro": {
    en: "The shop's owner sent you a six-digit code by text. Type it here to start working at that shop.",
    np: "पसलको मालिकले म्यासेजमा छ अंकको कोड पठाउनुभएको छ। त्यो पसलमा काम सुरु गर्न यहाँ हाल्नुहोस्।",
  },
  "join.waiting.one": { en: "Waiting for you", np: "तपाईंलाई पर्खिरहेको" },
  "join.waiting.many": { en: "{count} invitations waiting", np: "{count} निम्ता पर्खिरहेका" },
  "join.aShop": { en: "A shop on GoPasal", np: "गोपसलको एउटा पसल" },
  "join.asRole": { en: "As {role}", np: "{role} को रूपमा" },
  "join.until": { en: "Works until {date}", np: "{date} सम्म चल्छ" },
  "join.code": { en: "Invite code", np: "निम्तो कोड" },
  "join.codeHint": {
    en: "It only works on the number it was sent to — you're signed in as {phone}.",
    np: "पठाइएको नम्बरमा मात्र चल्छ — तपाईं {phone} बाट साइन इन हुनुहुन्छ।",
  },
  "join.codeShort": { en: "The code is six digits.", np: "कोड छ अंकको हुन्छ।" },
  "join.submit": { en: "Join the shop", np: "पसलमा जोडिनुहोस्" },
  "join.ownShop": {
    en: "No code? Register your own shop",
    np: "कोड छैन? आफ्नै पसल दर्ता गर्नुहोस्",
  },
  "join.invited": {
    en: "Invited to a shop? Enter your code",
    np: "पसलबाट निम्तो आएको छ? कोड हाल्नुहोस्",
  },
  "join.haveCode": { en: "Have an invite code?", np: "निम्तो कोड छ?" },
  "join.another": { en: "Join another shop", np: "अर्को पसलमा जोडिनुहोस्" },
  "join.anotherDetail": {
    en: "With a code the shop's owner sent you",
    np: "पसलको मालिकले पठाएको कोडबाट",
  },

  "join.link.bad": { en: "This link doesn't work", np: "यो लिंक चल्दैन" },
  "join.link.badDetail": {
    en: "It may have been copied incompletely. Ask the shop's owner for the six-digit code instead.",
    np: "पूरा कपी नभएको हुन सक्छ। बरु पसलको मालिकसँग छ अंकको कोड माग्नुहोस्।",
  },
  "join.link.from": { en: "Invited by {name}", np: "{name} ले निम्तो दिनुभयो" },
  "join.link.sentTo": { en: "Sent to {phone}", np: "{phone} मा पठाइएको" },
  "join.link.accept": { en: "Join this shop", np: "यो पसलमा जोडिनुहोस्" },
  "join.link.signedInAs": { en: "Signed in as {phone}", np: "{phone} बाट साइन इन" },
  "join.link.signIn": { en: "Sign in to join", np: "जोडिन साइन इन गर्नुहोस्" },
  "join.link.signInHint": {
    en: "Use the number the invite was sent to, {phone}.",
    np: "निम्तो पठाइएको नम्बर, {phone}, प्रयोग गर्नुहोस्।",
  },
  "join.link.used": { en: "This invite has already been used", np: "यो निम्तो प्रयोग भइसक्यो" },
  "join.link.revoked": { en: "This invite was cancelled", np: "यो निम्तो रद्द भयो" },
  "join.link.expired": { en: "This invite has run out", np: "यो निम्तोको म्याद सकियो" },
  "join.link.askAgain": {
    en: "Ask the shop's owner to send you a new one.",
    np: "पसलको मालिकलाई नयाँ पठाउन भन्नुहोस्।",
  },
  "join.link.platform": {
    en: "This invite is for GoPasal's staff console",
    np: "यो निम्तो गोपसलका कर्मचारीको कन्सोलका लागि हो",
  },
  "join.link.platformDetail": {
    en: "Open it on a computer, in the admin console.",
    np: "कम्प्युटरमा, एडमिन कन्सोलमा खोल्नुहोस्।",
  },
};

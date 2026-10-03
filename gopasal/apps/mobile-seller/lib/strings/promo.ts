import type { Dictionary } from "@gopasal/native-ui";

/** Strings for the promo screens. House rules for the Nepali are at the top of ./core.ts. */
export const promoStrings: Dictionary = {
  /* ── general ─────────────────────────────────────────────────────────── */
  "promo.a11yOff": { en: "Turn off {code}", np: "{code} बन्द गर्नुहोस्" },
  "promo.a11yOn": { en: "Turn {code} back on", np: "{code} फेरि खोल्नुहोस्" },
  "promo.codeTaken": {
    en: "{code} is already taken. Codes are shared across all of GoPasal, so pick another word.",
    np: "{code} पहिल्यै लिइसकिएको छ। कोड गोपसलभरि एउटै हुन्छ, त्यसैले अर्को शब्द छान्नुहोस्।",
  },
  "promo.new": { en: "New coupon", np: "नयाँ कुपन" },
  "promo.off": { en: "Turn off", np: "बन्द गर्नुहोस्" },
  "promo.on": { en: "Turn back on", np: "फेरि खोल्नुहोस्" },
  "promo.platformNote": {
    en: "Only your shop's own codes are here. GoPasal's own offers can also apply to your orders.",
    np: "यहाँ तपाईंको पसलका कोड मात्र छन्। गोपसलका आफ्नै अफर पनि तपाईंका अर्डरमा लाग्न सक्छन्।",
  },
  "promo.readOnly": {
    en: "Your role can see the coupons but not change them.",
    np: "तपाईंको भूमिकाले कुपन हेर्न दिन्छ, बदल्न दिँदैन।",
  },
  "promo.summary": {
    en: "{running} working now · used {used} times in all",
    np: "{running} अहिले चलिरहेका · जम्मा {used} पटक प्रयोग",
  },
  "promo.title": { en: "Coupons", np: "कुपन" },

  /* ── confirm ─────────────────────────────────────────────────────────── */
  "promo.confirm.back": { en: "Go back and change", np: "फर्केर बदल्नुहोस्" },
  "promo.confirm.example": {
    en: "On a {order} order it takes off {off}.",
    np: "{order} को अर्डरमा यसले {off} घटाउँछ।",
  },
  "promo.confirm.fixed": {
    en: "The code, the kind of discount and the amount can't be changed once it's made.",
    np: "बनाएपछि कोड, छुटको किसिम र रकम बदल्न मिल्दैन।",
  },
  "promo.confirm.noEnd": { en: "No end date.", np: "अन्तिम मिति छैन।" },
  "promo.confirm.title": { en: "Create {code}?", np: "{code} बनाउने?" },
  "promo.confirm.until": { en: "Works until {date}.", np: "{date} सम्म चल्छ।" },
  "promo.confirm.yes": { en: "Create it", np: "बनाउनुहोस्" },

  /* ── confirmOff ──────────────────────────────────────────────────────── */
  "promo.confirmOff.detail": {
    en: "Customers can't use it from now on. Orders that already used it keep their discount, and you can turn it back on whenever you like.",
    np: "अबदेखि ग्राहकले प्रयोग गर्न सक्दैनन्। पहिले प्रयोग भएका अर्डरको छुट रहन्छ, र जहिले पनि फेरि खोल्न सकिन्छ।",
  },
  "promo.confirmOff.keep": { en: "Keep it on", np: "खुलै राख्नुहोस्" },
  "promo.confirmOff.title": { en: "Turn off {code}?", np: "{code} बन्द गर्ने?" },

  /* ── confirmSave ─────────────────────────────────────────────────────── */
  "promo.confirmSave.title": { en: "Save changes to {code}?", np: "{code} का परिवर्तन सेभ गर्ने?" },
  "promo.confirmSave.yes": { en: "Save anyway", np: "तैपनि सेभ गर्नुहोस्" },

  /* ── create ──────────────────────────────────────────────────────────── */
  "promo.create.review": { en: "Check and create", np: "जाँचेर बनाउनुहोस्" },
  "promo.create.title": { en: "New coupon", np: "नयाँ कुपन" },

  /* ── date ────────────────────────────────────────────────────────────── */
  "promo.date.bad": {
    en: "Type the date as year-month-day, like 2026-10-24.",
    np: "मिति साल-महिना-दिन गरी लेख्नुहोस्, जस्तै 2026-10-24।",
  },
  "promo.date.hint": {
    en: "Year, month, day — like 2026-10-24.",
    np: "साल, महिना, दिन — जस्तै 2026-10-24।",
  },
  "promo.date.placeholder": { en: "YYYY-MM-DD" },

  /* ── describe ────────────────────────────────────────────────────────── */
  "promo.describe.flat": { en: "{amount} off", np: "{amount} छुट" },
  "promo.describe.percent": { en: "{value}% off", np: "{value}% छुट" },
  "promo.describe.percentCapped": {
    en: "{value}% off, up to {cap}",
    np: "{value}% छुट, बढीमा {cap}",
  },

  /* ── edit ────────────────────────────────────────────────────────────── */
  "promo.edit.gone": { en: "Can't find that coupon", np: "त्यो कुपन भेटिएन" },
  "promo.edit.goneDetail": {
    en: "Go back to the list to see your coupons as they are now.",
    np: "अहिलेका कुपन हेर्न सूचीमा फर्कनुहोस्।",
  },
  "promo.edit.title": { en: "Coupon", np: "कुपन" },

  /* ── empty ───────────────────────────────────────────────────────────── */
  "promo.empty.detail": {
    en: "A coupon is a word customers type at checkout to get money off — for a festival, a slow afternoon, or to bring regulars back. You choose how much, for how long, and how many times it can be used.",
    np: "कुपन भनेको ग्राहकले चेकआउटमा टाइप गरेर छुट पाउने शब्द हो — चाडपर्व, सुस्त दिउँसो, वा पुराना ग्राहक फर्काउन। कति छुट, कहिलेसम्म, कति पटक — तपाईं आफैं छान्नुहुन्छ।",
  },
  "promo.empty.idle": { en: "Every code is working", np: "सबै कोड चलिरहेका छन्" },
  "promo.empty.idleDetail": {
    en: "Nothing is switched off, waiting to start, ended or used up.",
    np: "बन्द गरिएको, सुरु हुन पर्खिरहेको, सकिएको वा पूरै प्रयोग भएको केही छैन।",
  },
  "promo.empty.make": { en: "Make the first one", np: "पहिलो बनाउनुहोस्" },
  "promo.empty.running": { en: "No code is working right now", np: "अहिले कुनै कोड चलिरहेको छैन" },
  "promo.empty.runningDetail": {
    en: "Customers have nothing to type at checkout. Turn one back on, or make a new one.",
    np: "ग्राहकले चेकआउटमा टाइप गर्ने केही छैन। एउटा फेरि खोल्नुहोस्, वा नयाँ बनाउनुहोस्।",
  },
  "promo.empty.title": { en: "No coupons yet", np: "अहिलेसम्म कुपन छैन" },

  /* ── end ─────────────────────────────────────────────────────────────── */
  "promo.end.cantRemove": {
    en: "An end date can be moved, but once a coupon has one it can't be taken away.",
    np: "अन्तिम मिति सार्न सकिन्छ, तर एक पटक राखेपछि हटाउन मिल्दैन।",
  },
  "promo.end.hint": {
    en: "It works until the end of that day.",
    np: "त्यो दिनको अन्त्यसम्म चल्छ।",
  },
  "promo.end.keep": { en: "Keep {date}", np: "{date} नै राख्नुहोस्" },
  "promo.end.label": { en: "When it stops working", np: "कहिले बन्द हुन्छ" },
  "promo.end.month": { en: "In 30 days", np: "30 दिनमा" },
  "promo.end.none": { en: "No end", np: "अन्त्य छैन" },
  "promo.end.today": { en: "Tonight", np: "आज राति" },
  "promo.end.typed": { en: "Pick a date", np: "मिति छान्नुहोस्" },
  "promo.end.typedLabel": { en: "Last day it works", np: "चल्ने अन्तिम दिन" },
  "promo.end.week": { en: "In 7 days", np: "7 दिनमा" },

  /* ── example ─────────────────────────────────────────────────────────── */
  "promo.example.capped": {
    en: "On a {order} order it stops at {cap}, the most you allowed.",
    np: "{order} को अर्डरमा यो तपाईंले दिएको बढीमा {cap} मै रोकिन्छ।",
  },
  "promo.example.floor": {
    en: "Orders under {min} can't use it.",
    np: "{min} भन्दा कमका अर्डरमा चल्दैन।",
  },
  "promo.example.free": {
    en: "On a {order} order this takes off the whole {order} — the customer pays nothing.",
    np: "{order} को अर्डरमा यसले पूरै {order} घटाउँछ — ग्राहकले केही तिर्नुपर्दैन।",
  },
  "promo.example.line": {
    en: "On a {order} order this takes off {off}. The customer pays {pays}.",
    np: "{order} को अर्डरमा यसले {off} घटाउँछ। ग्राहकले {pays} तिर्छन्।",
  },
  "promo.example.waiting": {
    en: "Fill in the amount to see what it takes off an order.",
    np: "अर्डरमा कति घट्छ हेर्न रकम भर्नुहोस्।",
  },

  /* ── failed ──────────────────────────────────────────────────────────── */
  "promo.failed.title": { en: "Couldn't load your coupons", np: "कुपन देखाउन सकिएन" },

  /* ── field ───────────────────────────────────────────────────────────── */
  "promo.field.cap": { en: "The most it can take off (optional)", np: "बढीमा कति घटाउने (ऐच्छिक)" },
  "promo.field.capHint": {
    en: "Stops a percentage getting expensive on a big order. Empty means no limit.",
    np: "ठूलो अर्डरमा प्रतिशत महँगो पर्न दिँदैन। खाली भए सीमा छैन।",
  },
  "promo.field.code": { en: "The code customers type", np: "ग्राहकले टाइप गर्ने कोड" },
  "promo.field.codeAs": {
    en: "Customers type it as {code}. Capitals or not, it's the same code.",
    np: "ग्राहकले {code} टाइप गर्छन्। ठूलो-सानो अक्षर जे भए पनि एउटै कोड।",
  },
  "promo.field.codeHint": {
    en: "At least {min} letters or numbers. Every code on GoPasal is different, so a common word may be taken.",
    np: "कम्तीमा {min} अक्षर वा अंक। गोपसलमा हरेक कोड फरक हुन्छ, त्यसैले चलेको शब्द लिइसकिएको हुन सक्छ।",
  },
  "promo.field.codePlaceholder": { en: "e.g. DASHAIN10", np: "जस्तै DASHAIN10" },
  "promo.field.endShort": { en: "Ends", np: "सकिन्छ" },
  "promo.field.flat": { en: "How many rupees off", np: "कति रुपैयाँ छुट" },
  "promo.field.flatPlaceholder": { en: "50" },
  "promo.field.minOrder": {
    en: "Smallest order it works on (optional)",
    np: "चल्ने सबैभन्दा सानो अर्डर (ऐच्छिक)",
  },
  "promo.field.minOrderEditHint": {
    en: "Empty or 0 means any order.",
    np: "खाली वा 0 भए जुनसुकै अर्डर।",
  },
  "promo.field.minOrderHint": { en: "Empty means any order.", np: "खाली भए जुनसुकै अर्डर।" },
  "promo.field.minOrderShort": { en: "Smallest order", np: "सबैभन्दा सानो अर्डर" },
  "promo.field.perUser": {
    en: "Times each customer can use it",
    np: "एक ग्राहकले कति पटक प्रयोग गर्न सक्छ",
  },
  "promo.field.perUserHint": { en: "Can't be changed later.", np: "पछि बदल्न मिल्दैन।" },
  "promo.field.percent": { en: "How many percent off", np: "कति प्रतिशत छुट" },
  "promo.field.percentPlaceholder": { en: "10" },
  "promo.field.usage": { en: "How many times in total (optional)", np: "जम्मा कति पटक (ऐच्छिक)" },
  "promo.field.usageCantRemove": {
    en: "A limit can be changed but not removed. It's {limit} now — type a new number.",
    np: "सीमा बदल्न सकिन्छ, हटाउन मिल्दैन। अहिले {limit} छ — नयाँ संख्या लेख्नुहोस्।",
  },
  "promo.field.usageEdit": { en: "How many times in total", np: "जम्मा कति पटक" },
  "promo.field.usageHint": {
    en: "Across all customers. Empty means no limit. You can raise or lower it later.",
    np: "सबै ग्राहक मिलाएर। खाली भए सीमा छैन। पछि बढाउन वा घटाउन सकिन्छ।",
  },
  "promo.field.usageNone": {
    en: "No limit now. Once you set one it can be changed but not removed.",
    np: "अहिले सीमा छैन। एक पटक राखेपछि बदल्न सकिन्छ, हटाउन मिल्दैन।",
  },
  "promo.field.usageUsed": {
    en: "Used {used} times so far.",
    np: "अहिलेसम्म {used} पटक प्रयोग भयो।",
  },

  /* ── filter ──────────────────────────────────────────────────────────── */
  "promo.filter.a11y": { en: "{label}, {count}", np: "{label}, {count}" },
  "promo.filter.all": { en: "All", np: "सबै" },
  "promo.filter.idle": { en: "Not working", np: "नचलेका" },
  "promo.filter.running": { en: "Working", np: "चलिरहेका" },

  /* ── fixed ───────────────────────────────────────────────────────────── */
  "promo.fixed.amount": { en: "Amount", np: "रकम" },
  "promo.fixed.anyOrder": { en: "Any", np: "जुनसुकै" },
  "promo.fixed.cap": { en: "Most it takes off", np: "बढीमा कति घटाउँछ" },
  "promo.fixed.heading": { en: "FIXED WHEN IT WAS MADE", np: "बनाउँदा तय भएको" },
  "promo.fixed.kind": { en: "Kind", np: "किसिम" },
  "promo.fixed.noCap": { en: "No limit", np: "सीमा छैन" },
  "promo.fixed.once": { en: "Once", np: "एक पटक" },
  "promo.fixed.perUser": { en: "Each customer", np: "हरेक ग्राहक" },
  "promo.fixed.percentValue": { en: "{value}%" },
  "promo.fixed.started": { en: "Started", np: "सुरु भयो" },
  "promo.fixed.starts": { en: "Starts", np: "सुरु हुन्छ" },
  "promo.fixed.times": { en: "{count} times", np: "{count} पटक" },
  "promo.fixed.why": {
    en: "The code, the kind of discount and the amount can't be changed once a coupon is made. If one is wrong, turn this coupon off and make a new one with a different code — this code stays taken.",
    np: "कुपन बनाएपछि कोड, छुटको किसिम र रकम बदल्न मिल्दैन। कुनै गलत भए यो कुपन बन्द गरेर अर्कै कोडसहित नयाँ बनाउनुहोस् — यो कोड लिइएकै रहन्छ।",
  },

  /* ── issue ───────────────────────────────────────────────────────────── */
  "promo.issue.capMin": {
    en: "The most it takes off has to be at least रु 1 — or leave it empty.",
    np: "बढीमा घटाउने रकम कम्तीमा रु 1 हुनुपर्छ — नत्र खाली छोड्नुहोस्।",
  },
  "promo.issue.capOnFlat": {
    en: "A limit only makes sense on a percentage. On a fixed amount it just lowers the amount.",
    np: "सीमा प्रतिशतमा मात्र काम लाग्छ। तोकिएको रकममा यसले रकम मात्र घटाउँछ।",
  },
  "promo.issue.codeLong": {
    en: "That's long for something a customer has to type at checkout.",
    np: "चेकआउटमा ग्राहकले टाइप गर्ने कुराका लागि यो लामो भयो।",
  },
  "promo.issue.codeShort": {
    en: "A code needs at least {min} letters or numbers.",
    np: "कोडमा कम्तीमा {min} अक्षर वा अंक चाहिन्छ।",
  },
  "promo.issue.endBad": {
    en: "That end date isn't a real date.",
    np: "त्यो अन्तिम मिति साँचो मिति होइन।",
  },
  "promo.issue.endBeforeStart": {
    en: "The end has to be after the start.",
    np: "अन्त्य सुरुपछि हुनुपर्छ।",
  },
  "promo.issue.endPassed": {
    en: "That end date has already passed.",
    np: "त्यो अन्तिम मिति बितिसक्यो।",
  },
  "promo.issue.endPastEdit": {
    en: "That date has passed, so the code stops working as soon as you save.",
    np: "त्यो मिति बितिसक्यो, त्यसैले सेभ गर्नासाथ कोड बन्द हुन्छ।",
  },
  "promo.issue.flatMin": {
    en: "A fixed amount has to be at least रु 1.",
    np: "तोकिएको रकम कम्तीमा रु 1 हुनुपर्छ।",
  },
  "promo.issue.minOrder": {
    en: "The smallest order is a whole number of rupees — or leave it empty.",
    np: "सबैभन्दा सानो अर्डर पूरा रुपैयाँमा हुनुपर्छ — नत्र खाली छोड्नुहोस्।",
  },
  "promo.issue.minOrderEdit": {
    en: "The smallest order is a whole number of rupees.",
    np: "सबैभन्दा सानो अर्डर पूरा रुपैयाँमा हुनुपर्छ।",
  },
  "promo.issue.perUser": {
    en: "Between {min} and {max} times for each customer.",
    np: "हरेक ग्राहकका लागि {min} देखि {max} पटक।",
  },
  "promo.issue.percentAll": {
    en: "100% off makes the whole order free. Is that really what you mean?",
    np: "100% छुटले पूरै अर्डर निःशुल्क बनाउँछ। साँच्चै त्यही हो?",
  },
  "promo.issue.percentRange": {
    en: "A percentage is between {min} and {max}.",
    np: "प्रतिशत {min} देखि {max} बीच हुन्छ।",
  },
  "promo.issue.startBad": {
    en: "That start date isn't a real date.",
    np: "त्यो सुरु मिति साँचो मिति होइन।",
  },
  "promo.issue.type": {
    en: "Choose a percentage off or a fixed amount off.",
    np: "प्रतिशत छुट वा तोकिएको रकम छुट छान्नुहोस्।",
  },
  "promo.issue.usageBelowUsed": {
    en: "It's already been used {count} times, so this limit stops it working straight away.",
    np: "यो {count} पटक प्रयोग भइसक्यो, त्यसैले यो सीमाले तुरुन्तै बन्द गर्छ।",
  },
  "promo.issue.usageMin": {
    en: "At least 1 — or leave it empty for no limit.",
    np: "कम्तीमा 1 — वा सीमा नचाहिए खाली छोड्नुहोस्।",
  },
  "promo.issue.usageMinEdit": { en: "At least 1.", np: "कम्तीमा 1।" },
  "promo.issue.whole": { en: "Enter a whole number.", np: "पूरा संख्या हाल्नुहोस्।" },

  /* ── noAccess ────────────────────────────────────────────────────────── */
  "promo.noAccess.detail": {
    en: "Your role here doesn't include {what}. The shop's owner can change that.",
    np: "यहाँ तपाईंको भूमिकामा {what} पर्दैन। पसलको मालिकले बदल्न सक्नुहुन्छ।",
  },
  "promo.noAccess.restrictedDetail": {
    en: "{what} opens up again once GoPasal clears the shop.",
    np: "गोपसलले पसल खुला गरेपछि {what} फेरि खुल्छ।",
  },
  "promo.noAccess.restrictedTitle": {
    en: "Not while the shop is in this state",
    np: "पसल यो अवस्थामा हुँदा होइन",
  },
  "promo.noAccess.title": { en: "You don't have access to this", np: "तपाईंलाई यसको पहुँच छैन" },

  /* ── on ──────────────────────────────────────────────────────────────── */
  "promo.on.expired": {
    en: "That alone won't make it work — it ended on {date}. Move the end date below as well.",
    np: "यति मात्रले चल्दैन — यो {date} मा सकियो। तल अन्तिम मिति पनि सार्नुहोस्।",
  },
  "promo.on.usedUp": {
    en: "That alone won't make it work — it has been used as many times as its limit allows. Raise the limit below as well.",
    np: "यति मात्रले चल्दैन — सीमाले दिएजति पटक प्रयोग भइसक्यो। तल सीमा पनि बढाउनुहोस्।",
  },

  /* ── row ─────────────────────────────────────────────────────────────── */
  "promo.row.a11y": {
    en: "{code}, {what}, {status}, {usage}",
    np: "{code}, {what}, {status}, {usage}",
  },
  "promo.row.ended": { en: "Ended {date}", np: "{date} मा सकियो" },
  "promo.row.ends": { en: "Until {date}", np: "{date} सम्म" },
  "promo.row.floor": { en: "orders from {min}", np: "{min} देखिका अर्डर" },
  "promo.row.noEnd": { en: "No end date", np: "अन्तिम मिति छैन" },
  "promo.row.used": { en: "Used {used} times · no limit", np: "{used} पटक प्रयोग · सीमा छैन" },
  "promo.row.usedOf": { en: "Used {used} of {limit}", np: "{limit} मध्ये {used} प्रयोग" },
  "promo.row.usedOnce": { en: "Used once · no limit", np: "एक पटक प्रयोग · सीमा छैन" },

  /* ── start ───────────────────────────────────────────────────────────── */
  "promo.start.label": { en: "When it starts", np: "कहिले सुरु हुन्छ" },
  "promo.start.later": { en: "On a later date", np: "पछिको मितिमा" },
  "promo.start.now": { en: "Straight away", np: "तुरुन्तै" },
  "promo.start.typedLabel": { en: "First day it works", np: "चल्ने पहिलो दिन" },

  /* ── state ───────────────────────────────────────────────────────────── */
  "promo.state.expired": { en: "Ended", np: "सकियो" },
  "promo.state.off": { en: "Turned off", np: "बन्द गरिएको" },
  "promo.state.running": { en: "Working now", np: "अहिले चलिरहेको" },
  "promo.state.scheduled": { en: "Starts {date}", np: "{date} मा सुरु हुन्छ" },
  "promo.state.usedUp": { en: "Used up", np: "पूरै प्रयोग भयो" },

  /* ── summary ─────────────────────────────────────────────────────────── */
  "promo.summary.one": {
    en: "{running} working now · used once in all",
    np: "{running} अहिले चलिरहेका · जम्मा एक पटक प्रयोग",
  },

  /* ── type ────────────────────────────────────────────────────────────── */
  "promo.type.flat": { en: "Fixed amount off", np: "तोकिएको रकम छुट" },
  "promo.type.flatExample": {
    en: "Takes the same rupees off every order. रु 50 off is रु 50 whether the order is रु 300 or रु 3,000.",
    np: "हरेक अर्डरमा उति नै रुपैयाँ घट्छ। रु 50 छुट भनेको अर्डर रु 300 होस् वा रु 3,000, रु 50 नै।",
  },
  "promo.type.label": { en: "What kind of discount", np: "कस्तो छुट" },
  "promo.type.percent": { en: "Percentage off", np: "प्रतिशत छुट" },
  "promo.type.percentExample": {
    en: "Takes a share of the order. 10% off takes रु 80 off रु 800, and रु 300 off रु 3,000.",
    np: "अर्डरको भाग घट्छ। 10% छुटले रु 800 मा रु 80, रु 3,000 मा रु 300 घटाउँछ।",
  },

  /* ── what ────────────────────────────────────────────────────────────── */
  "promo.what.create": { en: "making coupons", np: "कुपन बनाउने काम" },
  "promo.what.list": { en: "the shop's coupons", np: "पसलका कुपन" },
};

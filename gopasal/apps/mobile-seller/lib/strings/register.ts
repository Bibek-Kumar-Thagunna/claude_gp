import type { Dictionary } from "@gopasal/native-ui";

/** Strings for the register screens. House rules for the Nepali are at the top of ./core.ts. */
export const registerStrings: Dictionary = {
  /* ── a11y ────────────────────────────────────────────────────────────── */
  "register.a11y.stepAsked": {
    en: "{step} — GoPasal asked about this",
    np: "{step} — गोपसलले यसबारे सोधेको छ",
  },
  "register.a11y.stepDone": { en: "{step}, done", np: "{step}, सकियो" },
  "register.a11y.stepLeft": { en: "{step}, {count} left", np: "{step}, {count} बाँकी" },

  /* ── general ─────────────────────────────────────────────────────────── */
  "register.area": { en: "Area", np: "टोल / क्षेत्र" },
  "register.bankAccountName": { en: "Name on the account", np: "खातावालाको नाम" },
  "register.bankAccountNo": { en: "Account number", np: "खाता नम्बर" },
  "register.bankBranch": { en: "Branch", np: "शाखा" },
  "register.bankName": { en: "Bank", np: "बैंक" },
  "register.category": { en: "What kind of shop?", np: "कस्तो पसल हो?" },
  "register.citizenshipNo": { en: "Citizenship number", np: "नागरिकता नम्बर" },
  "register.contactEmail": { en: "Email", np: "इमेल" },
  "register.contactPhone": { en: "Shop phone", np: "पसलको फोन" },
  "register.description": { en: "What do you sell?", np: "के-के बेच्नुहुन्छ?" },
  "register.fullAddress": { en: "Full address", np: "पूरा ठेगाना" },
  "register.hours": { en: "Opening hours", np: "खुल्ने समय" },
  "register.optional": { en: "Optional", np: "ऐच्छिक" },
  "register.ownerName": { en: "Your full name", np: "तपाईंको पूरा नाम" },
  "register.ownerNameNp": { en: "Your name in Nepali", np: "नेपालीमा तपाईंको नाम" },
  "register.panNo": { en: "PAN number", np: "प्यान नम्बर" },
  "register.pending": { en: "…" },
  "register.radius": { en: "How far do you deliver?", np: "कति टाढासम्म डेलिभरी गर्नुहुन्छ?" },
  "register.readOnly": {
    en: "GoPasal has this application, so it can't be edited right now.",
    np: "यो आवेदन गोपसलसँग छ, त्यसैले अहिले बदल्न मिल्दैन।",
  },
  "register.registrationNo": { en: "Business registration number", np: "व्यवसाय दर्ता नम्बर" },
  "register.resubmit": { en: "Send it back", np: "फेरि पठाउनुहोस्" },
  "register.saveFailed": {
    en: "That didn't save. What you typed is still here — it'll go when the connection is back.",
    np: "सेभ भएन। तपाईंले लेखेको यहीँ छ — इन्टरनेट आएपछि जान्छ।",
  },
  "register.saved": { en: "Saved", np: "सेभ भयो" },
  "register.saving": { en: "Saving…", np: "सेभ हुँदै…" },
  "register.shopName": { en: "Shop name", np: "पसलको नाम" },
  "register.shopNameNp": { en: "Shop name in Nepali", np: "नेपालीमा पसलको नाम" },
  "register.solo": { en: "I deliver the orders myself", np: "अर्डर म आफैं डेलिभरी गर्छु" },
  "register.start": { en: "Start", np: "सुरु गर्नुहोस्" },
  "register.startAgain": { en: "Start a new application", np: "नयाँ आवेदन सुरु गर्नुहोस्" },
  "register.submit": { en: "Send to GoPasal", np: "गोपसललाई पठाउनुहोस्" },
  "register.title": { en: "Sell on GoPasal", np: "गोपसलमा बेच्नुहोस्" },
  "register.vatNo": { en: "VAT number", np: "भ्याट नम्बर" },
  "register.withdraw": { en: "Withdraw this application", np: "यो आवेदन फिर्ता लिनुहोस्" },

  /* ── bankAccountName ─────────────────────────────────────────────────── */
  "register.bankAccountName.hint": {
    en: "Exactly as the bank has it — a mismatch bounces the transfer",
    np: "बैंकमा जस्तो छ ठ्याक्कै त्यस्तै — नमिलेमा पैसा फर्किन्छ",
  },

  /* ── citizenshipNo ───────────────────────────────────────────────────── */
  "register.citizenshipNo.hint": {
    en: "As written on your citizenship certificate",
    np: "नागरिकताको प्रमाणपत्रमा लेखिए जस्तै",
  },

  /* ── contactEmail ────────────────────────────────────────────────────── */
  "register.contactEmail.hint": {
    en: "Optional — for anything we need to send",
    np: "ऐच्छिक — केही पठाउनुपरे",
  },

  /* ── description ─────────────────────────────────────────────────────── */
  "register.description.placeholder": {
    en: "Daily groceries, vegetables, household things…",
    np: "दैनिक किराना, तरकारी, घरायसी सामान…",
  },

  /* ── doc ─────────────────────────────────────────────────────────────── */
  "register.doc.BANK_PROOF": { en: "Bank proof", np: "बैंकको प्रमाण" },
  "register.doc.BUSINESS_LICENCE": { en: "Business licence", np: "व्यवसाय दर्ता प्रमाणपत्र" },
  "register.doc.CITIZENSHIP_BACK": { en: "Citizenship — back", np: "नागरिकता — पछाडि" },
  "register.doc.CITIZENSHIP_FRONT": { en: "Citizenship — front", np: "नागरिकता — अगाडि" },
  "register.doc.OWNER_PHOTO": { en: "Your photograph", np: "तपाईंको फोटो" },
  "register.doc.PAN_CERTIFICATE": { en: "PAN certificate", np: "प्यान प्रमाणपत्र" },
  "register.doc.REGULATORY_LICENCE": { en: "Regulatory licence", np: "अनुमतिपत्र (लाइसेन्स)" },
  "register.doc.SHOP_PHOTO": { en: "Your shopfront", np: "पसलको अगाडिको फोटो" },
  "register.doc.VAT_CERTIFICATE": { en: "VAT certificate", np: "भ्याट प्रमाणपत्र" },
  "register.doc.a11yRemove": { en: "Remove {label}", np: "{label} हटाउनुहोस्" },
  "register.doc.bank.hint": {
    en: "A passbook page or a cheque, showing the account number",
    np: "खाता नम्बर देखिने पासबुकको पाना वा चेक",
  },
  "register.doc.cameraDenied": {
    en: "GoPasal needs camera permission to photograph your papers.",
    np: "कागज खिच्न गोपसललाई क्यामेरा अनुमति चाहिन्छ।",
  },
  "register.doc.choose": { en: "Choose", np: "छान्नुहोस्" },
  "register.doc.citizenship.hint": {
    en: "The side with your photograph",
    np: "तपाईंको फोटो भएको पाटो",
  },
  "register.doc.citizenshipBack.hint": { en: "The reverse side", np: "पछाडिको पाटो" },
  "register.doc.intro": {
    en: "Photograph each one in good light, with all four corners in the frame. JPEG, PNG or PDF, up to {megabytes} MB each.",
    np: "हरेक कागज उज्यालोमा, चारै कुना देखिने गरी खिच्नुहोस्। JPEG, PNG वा PDF, एउटामा बढीमा {megabytes} MB।",
  },
  "register.doc.libraryDenied": {
    en: "GoPasal needs permission to open your photos.",
    np: "फोटो खोल्न गोपसललाई अनुमति चाहिन्छ।",
  },
  "register.doc.licence.hint": {
    en: "Your registration certificate",
    np: "तपाईंको दर्ता प्रमाणपत्र",
  },
  "register.doc.needed": { en: "NEEDED", np: "चाहिन्छ" },
  "register.doc.owner.hint": { en: "A clear photo of your face", np: "अनुहार प्रस्ट देखिने फोटो" },
  "register.doc.pan.hint": { en: "Your business PAN document", np: "व्यवसायको प्यान कागज" },
  "register.doc.regulatory.hint": {
    en: "If you sell medicines or anything licensed",
    np: "औषधि वा अनुमति चाहिने सामान बेच्नुहुन्छ भने",
  },
  "register.doc.remove.detail": {
    en: "You can photograph it again afterwards.",
    np: "पछि फेरि खिच्न सकिन्छ।",
  },
  "register.doc.remove.title": { en: "Remove this paper?", np: "यो कागज हटाउने?" },
  "register.doc.remove.yes": { en: "Remove it", np: "हटाउनुहोस्" },
  "register.doc.retake": { en: "Take again", np: "फेरि खिच्नुहोस्" },
  "register.doc.sent": { en: "Sent", np: "पठाइयो" },
  "register.doc.shop.hint": {
    en: "Stand across the road so the whole front and the sign are in it",
    np: "सडकपारि उभिएर पसलको पूरै अगाडि र साइनबोर्ड आउने गरी",
  },
  "register.doc.take": { en: "Photograph", np: "फोटो खिच्नुहोस्" },
  "register.doc.vat.hint": {
    en: "Only if you are VAT registered",
    np: "भ्याट दर्ता भएको छ भने मात्र",
  },

  /* ── field ───────────────────────────────────────────────────────────── */
  "register.field.asked": { en: "CHECK THIS", np: "यो हेर्नुहोस्" },

  /* ── headline ────────────────────────────────────────────────────────── */
  "register.headline.APPROVED": { en: "Approved", np: "स्वीकृत भयो" },
  "register.headline.CHANGES_REQUESTED": {
    en: "GoPasal asked for changes",
    np: "गोपसलले केही सच्याउन भनेको छ",
  },
  "register.headline.DRAFT": { en: "Not sent yet", np: "अझै पठाइएको छैन" },
  "register.headline.REJECTED": { en: "Not approved", np: "स्वीकृत भएन" },
  "register.headline.SUBMITTED": {
    en: "Sent — waiting for a reviewer",
    np: "पठाइयो — जाँचकर्ता पर्खँदै",
  },
  "register.headline.UNDER_REVIEW": { en: "Being reviewed", np: "जाँच हुँदै" },
  "register.headline.WITHDRAWN": { en: "Withdrawn", np: "फिर्ता लिइयो" },

  /* ── noShop ──────────────────────────────────────────────────────────── */
  "register.noShop.detail": {
    en: "There's no shop on this number yet. Telling us about yours takes a few minutes, and you can do it standing at your counter.",
    np: "यो नम्बरमा अहिलेसम्म कुनै पसल छैन। आफ्नो पसलबारे बताउन केही मिनेट मात्र लाग्छ, काउन्टरमै उभिएर गर्न सकिन्छ।",
  },
  "register.noShop.title": { en: "Let's get your shop on GoPasal", np: "आफ्नो पसल गोपसलमा राखौं" },

  /* ── owner ───────────────────────────────────────────────────────────── */
  "register.owner.privacy": {
    en: "Only the GoPasal reviewer sees these. Customers never do, and they are not shown anywhere in the app.",
    np: "यी कुरा गोपसलको जाँचकर्ताले मात्र हेर्छन्। ग्राहकले कहिल्यै देख्दैनन्, एपमा कतै देखाइँदैन।",
  },

  /* ── payout ──────────────────────────────────────────────────────────── */
  "register.payout.bank": { en: "Bank account", np: "बैंक खाता" },
  "register.payout.esewa": { en: "eSewa" },
  "register.payout.how": { en: "How should we pay you?", np: "पैसा कसरी पाउनुहुन्छ?" },
  "register.payout.khalti": { en: "Khalti" },
  "register.payout.warning": {
    en: "Check every digit. Once GoPasal approves you, changing where your money goes means contacting us — you can't edit it from the app.",
    np: "हरेक अंक जाँच्नुहोस्। गोपसलले स्वीकृत गरेपछि पैसा जाने ठाउँ बदल्न हामीलाई सम्पर्क गर्नुपर्छ — एपबाट बदल्न सकिँदैन।",
  },

  /* ── pin ─────────────────────────────────────────────────────────────── */
  "register.pin.accuracy": { en: "Accurate to about {metres} m", np: "करिब {metres} मिटरसम्म सही" },
  "register.pin.denied": {
    en: "GoPasal needs location permission to pin your shop. You can turn it on in your phone's settings.",
    np: "पसलको ठाउँ राख्न गोपसललाई लोकेसन अनुमति चाहिन्छ। फोनको सेटिङमा गएर खोल्न सकिन्छ।",
  },
  "register.pin.good": { en: "Pin taken", np: "ठाउँ लियो" },
  "register.pin.label": { en: "Where your shop is", np: "पसल कहाँ छ" },
  "register.pin.retake": { en: "Take it again", np: "फेरि लिनुहोस्" },
  "register.pin.retakeHint": {
    en: " — step outside and take it again for a better one",
    np: " — बाहिर निस्केर फेरि लिनुभयो भने अझ ठीक आउँछ",
  },
  "register.pin.rough": { en: "Pin taken, but not exact", np: "ठाउँ लियो, तर ठ्याक्कै होइन" },
  "register.pin.take": { en: "Take the pin", np: "ठाउँ लिनुहोस्" },
  "register.pin.tooRough": {
    en: "The reading was too rough to use. Step outside, away from the roof, and try again.",
    np: "ठाउँ धेरै अन्दाजी आयो। छानोबाट पर, बाहिर निस्केर फेरि प्रयास गर्नुहोस्।",
  },
  "register.pin.unavailable": {
    en: "Couldn't get a location just now. Try again in a moment.",
    np: "अहिले लोकेसन पाइएन। एकैछिनमा फेरि प्रयास गर्नुहोस्।",
  },
  "register.pin.why": {
    en: "Stand at your shop door and take this. Without it customers can't find you, even after GoPasal approves you.",
    np: "पसलको ढोकामा उभिएर यो लिनुहोस्। यो नभए गोपसलले स्वीकृत गरेपछि पनि ग्राहकले तपाईंलाई भेट्दैनन्।",
  },

  /* ── pitch ───────────────────────────────────────────────────────────── */
  "register.pitch.asPhone": { en: "Applying as {phone}", np: "{phone} बाट आवेदन" },
  "register.pitch.delivery": {
    en: "Deliver yourself, or let a GoPasal rider",
    np: "आफैं डेलिभरी गर्नुहोस्, वा गोपसलको राइडरलाई दिनुहोस्",
  },
  "register.pitch.detail": {
    en: "Tell us about your shop and GoPasal reviews it. Most of it you can answer standing behind your counter.",
    np: "आफ्नो पसलबारे बताउनुहोस्, गोपसलले जाँच्छ। धेरैजसो कुरा काउन्टरमै उभिएर भर्न सकिन्छ।",
  },
  "register.pitch.money": {
    en: "Get paid into your bank or wallet",
    np: "पैसा बैंक वा वालेटमा पाउनुहोस्",
  },
  "register.pitch.orders": {
    en: "Take orders from your own neighbourhood",
    np: "आफ्नै छिमेकबाट अर्डर लिनुहोस्",
  },

  /* ── problem ─────────────────────────────────────────────────────────── */
  "register.problem.asked": {
    en: "GoPasal asked you to check this",
    np: "गोपसलले यो जाँच्न भनेको छ",
  },
  "register.problem.email": {
    en: "That doesn't look like an email address",
    np: "यो इमेल ठेगाना जस्तो देखिएन",
  },
  "register.problem.needed": { en: "Needed before you can send this", np: "पठाउनुअघि यो चाहिन्छ" },
  "register.problem.range": {
    en: "That's outside what we can accept",
    np: "यो हामीले लिन मिल्ने सीमाभन्दा बाहिर छ",
  },
  "register.problem.tooLong": { en: "That's too long", np: "यो धेरै लामो भयो" },
  "register.problem.tooLongBy": { en: "{limit} characters at most", np: "बढीमा {limit} अक्षर" },
  "register.problem.tooShort": { en: "That's too short", np: "यो धेरै छोटो भयो" },
  "register.problem.tooShortBy": { en: "At least {limit} characters", np: "कम्तीमा {limit} अक्षर" },

  /* ── radius ──────────────────────────────────────────────────────────── */
  "register.radius.a11y": { en: "{km} kilometres", np: "{km} किलोमिटर" },
  "register.radius.hint": {
    en: "Between {min} and {max} km. You can change this later.",
    np: "{min} देखि {max} km सम्म। पछि बदल्न सकिन्छ।",
  },
  "register.radius.km": { en: "{km} km", np: "{km} km" },

  /* ── remaining ───────────────────────────────────────────────────────── */
  "register.remaining.detail": {
    en: "Fill those in and the Send button appears here.",
    np: "ती भर्नुभयो भने पठाउने बटन यहीँ आउँछ।",
  },
  "register.remaining.many": { en: "{count} things left", np: "{count} कुरा बाँकी" },
  "register.remaining.one": { en: "One thing left", np: "एउटा कुरा बाँकी" },

  /* ── resubmit ────────────────────────────────────────────────────────── */
  "register.resubmit.title": { en: "Send it back to GoPasal?", np: "गोपसललाई फेरि पठाउने?" },

  /* ── shopNameNp ──────────────────────────────────────────────────────── */
  "register.shopNameNp.hint": {
    en: "Optional — how customers see it in Nepali",
    np: "ऐच्छिक — ग्राहकले नेपालीमा यही देख्छन्",
  },

  /* ── solo ────────────────────────────────────────────────────────────── */
  "register.solo.detail": {
    en: "Rather than handing them to a GoPasal rider. You can change this later.",
    np: "गोपसलको राइडरलाई दिनुको सट्टा। पछि बदल्न सकिन्छ।",
  },

  /* ── status ──────────────────────────────────────────────────────────── */
  "register.status.closed": {
    en: "This application is closed. You can start a new one — what you typed before is still here to copy from.",
    np: "यो आवेदन बन्द भयो। नयाँ सुरु गर्न सकिन्छ — पहिले लेखेको कुरा हेरेर सार्न यहीँ छ।",
  },
  "register.status.fromGopasal": { en: "From GoPasal", np: "गोपसलबाट" },
  "register.status.papersBack": { en: "Papers to send again", np: "फेरि पठाउनुपर्ने कागज" },
  "register.status.sentTimes": { en: "Sent {count} times", np: "{count} पटक पठाइयो" },
  "register.status.waiting": {
    en: "It's with a reviewer. We'll tell you the moment there's an answer — there's nothing you need to do.",
    np: "जाँचकर्तासँग छ। जवाफ आउनासाथ हामी खबर गर्छौं — तपाईंले केही गर्नुपर्दैन।",
  },

  /* ── step ────────────────────────────────────────────────────────────── */
  "register.step.asked": { en: "GoPasal asked about this", np: "गोपसलले यसबारे सोधेको छ" },
  "register.step.documents": { en: "Your papers", np: "तपाईंका कागज" },
  "register.step.documents.detail": {
    en: "Photograph them — citizenship, PAN, your shopfront",
    np: "फोटो खिच्नुहोस् — नागरिकता, प्यान, पसलको अगाडि",
  },
  "register.step.left.many": { en: "{count} still needed", np: "{count} अझै चाहिन्छ" },
  "register.step.left.one": { en: "1 still needed", np: "1 अझै चाहिन्छ" },
  "register.step.owner": { en: "About you", np: "तपाईंबारे" },
  "register.step.owner.detail": {
    en: "Your name, citizenship, registration",
    np: "नाम, नागरिकता, दर्ता",
  },
  "register.step.payout": { en: "Getting paid", np: "पैसा पाउने" },
  "register.step.payout.detail": {
    en: "Where GoPasal sends your money",
    np: "गोपसलले पैसा कहाँ पठाउने",
  },
  "register.step.shop": { en: "Your shop", np: "तपाईंको पसल" },
  "register.step.shop.detail": {
    en: "Name, what you sell, where you are",
    np: "नाम, के बेच्नुहुन्छ, कहाँ छ",
  },

  /* ── submit ──────────────────────────────────────────────────────────── */
  "register.submit.detail": {
    en: "Sending it accepts GoPasal's seller terms. A reviewer reads it and comes back to you — you can't edit it while they have it, but you can withdraw it.",
    np: "पठाएपछि गोपसलका विक्रेता सर्त मान्नुभएको हुन्छ। जाँचकर्ताले पढेर जवाफ दिन्छन् — उनीहरूसँग हुँदा बदल्न मिल्दैन, तर फिर्ता लिन सकिन्छ।",
  },
  "register.submit.title": { en: "Send this to GoPasal?", np: "यो गोपसललाई पठाउने?" },
  "register.submit.yes": { en: "Send it", np: "पठाउनुहोस्" },

  /* ── vatNo ───────────────────────────────────────────────────────────── */
  "register.vatNo.hint": {
    en: "Only if your business is VAT registered",
    np: "व्यवसाय भ्याटमा दर्ता छ भने मात्र",
  },

  /* ── walletNumber ────────────────────────────────────────────────────── */
  "register.walletNumber.esewa": { en: "eSewa number", np: "eSewa नम्बर" },
  "register.walletNumber.hint": {
    en: "The number the wallet is registered to",
    np: "वालेट दर्ता भएको नम्बर",
  },
  "register.walletNumber.khalti": { en: "Khalti number", np: "Khalti नम्बर" },

  /* ── withdraw ────────────────────────────────────────────────────────── */
  "register.withdraw.detail": {
    en: "It stops being reviewed. Everything you typed stays, and you can send it again.",
    np: "जाँच रोकिन्छ। तपाईंले लेखेको सबै रहन्छ, फेरि पठाउन सकिन्छ।",
  },
  "register.withdraw.title": { en: "Withdraw this application?", np: "यो आवेदन फिर्ता लिने?" },
  "register.withdraw.yes": { en: "Withdraw it", np: "फिर्ता लिनुहोस्" },
};

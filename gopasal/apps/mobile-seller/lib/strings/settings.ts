import type { Dictionary } from "@gopasal/native-ui";

/** Strings for the settings screens. House rules for the Nepali are at the top of ./core.ts. */
export const settingsStrings: Dictionary = {
  /* ── general ─────────────────────────────────────────────────────────── */
  "settings.address": { en: "Full address", np: "पूरा ठेगाना" },
  "settings.addressHint": {
    en: "For people. Deliveries are measured from the recorded location below, not from this text.",
    np: "मान्छेले पढ्नका लागि। डेलिभरीको दूरी यो लेखाइबाट होइन, तल राखिएको ठाउँबाट नापिन्छ।",
  },
  "settings.area": { en: "Area", np: "टोल / क्षेत्र" },
  "settings.areaHint": {
    en: "The tole or neighbourhood, as customers know it.",
    np: "ग्राहकले चिन्ने टोल वा छिमेकको नाम।",
  },
  "settings.category": { en: "Category", np: "किसिम" },
  "settings.categoryA11y": {
    en: "Category, {category}. Change it",
    np: "किसिम, {category}। बदल्नुहोस्",
  },
  "settings.changes": { en: "{count} change(s) to save", np: "सेभ गर्न {count} परिवर्तन" },
  "settings.collided": {
    en: "Someone else changed a field you're editing. Saving will replace their value with yours.",
    np: "तपाईंले बदल्दै गरेको कुरा अरू कसैले बदल्यो। सेभ गर्नुभयो भने उहाँको सट्टा तपाईंको राखिन्छ।",
  },
  "settings.description": { en: "Description", np: "विवरण" },
  "settings.descriptionHint": {
    en: "{count} characters. Customers see this on your shop page.",
    np: "{count} अक्षर। ग्राहकले यो तपाईंको पसलको पानामा देख्छन्।",
  },
  "settings.discard": { en: "Leave", np: "छोड्नुहोस्" },
  "settings.discardDetail": {
    en: "{count} change(s) on this screen haven't been saved and will be lost.",
    np: "यो स्क्रिनका {count} परिवर्तन सेभ भएका छैनन्, हराउँछन्।",
  },
  "settings.discardTitle": { en: "Leave without saving?", np: "सेभ नगरी छोड्ने?" },
  "settings.emoji": { en: "Shop emoji", np: "पसलको इमोजी" },
  "settings.emojiHint": {
    en: "Shown beside your name when there's no logo.",
    np: "लोगो नभएमा नामको छेउमा देखिन्छ।",
  },
  "settings.empty": { en: "Not set", np: "राखिएको छैन" },
  "settings.fixFirst": {
    en: "Fix {count} thing(s) above to save",
    np: "सेभ गर्न माथिका {count} कुरा मिलाउनुहोस्",
  },
  "settings.hours": { en: "Opening hours", np: "खुल्ने समय" },
  "settings.hoursHint": {
    en: "Written for customers to read. It doesn't open or close the shop — the switch on the Shop tab does.",
    np: "ग्राहकले पढ्नका लागि लेखिएको। यसले पसल खोल्दैन, बन्द गर्दैन — त्यो पसल ट्याबको स्विचले गर्छ।",
  },
  "settings.hoursPlaceholder": {
    en: "7am – 9pm, closed Saturday",
    np: "बिहान 7 – राति 9, शनिबार बन्द",
  },
  "settings.location": { en: "Shop location", np: "पसलको ठाउँ" },
  "settings.minOrderHint": {
    en: "In rupees. Below this, a customer can't check out. 0 for no minimum.",
    np: "रुपैयाँमा। योभन्दा कममा ग्राहकले अर्डर गर्न सक्दैनन्। न्यूनतम नचाहिए 0।",
  },
  "settings.name": { en: "Shop name", np: "पसलको नाम" },
  "settings.nameNp": { en: "Name in Nepali", np: "नेपालीमा नाम" },
  "settings.nameSlug": {
    en: "Your shop's web address stays /{slug} — it doesn't change with the name.",
    np: "पसलको वेब ठेगाना /{slug} नै रहन्छ — नाम बदलेर बदलिँदैन।",
  },
  "settings.noChanges": { en: "No changes", np: "केही बदलिएको छैन" },
  "settings.optional": {
    en: "Optional. Leave empty to remove it.",
    np: "ऐच्छिक। हटाउन खाली छोड्नुहोस्।",
  },
  "settings.payout": { en: "Where payouts go", np: "पैसा कहाँ जान्छ" },
  "settings.phone": { en: "Shop phone", np: "पसलको फोन" },
  "settings.phoneHint": {
    en: "The number customers and riders are given. It isn't the number you sign in with.",
    np: "ग्राहक र राइडरलाई दिइने नम्बर। साइन इन गर्ने नम्बर होइन।",
  },
  "settings.radius": { en: "Delivery radius", np: "डेलिभरी दूरी" },
  "settings.readOnly": {
    en: "You can see these details but not change them. Only someone who can manage shop settings can.",
    np: "तपाईं यी विवरण हेर्न सक्नुहुन्छ, बदल्न सक्नुहुन्न। पसलको सेटिङ चलाउन पाउनेले मात्र बदल्न सक्छन्।",
  },
  "settings.saved": {
    en: "Saved {count} change(s). The form now shows what GoPasal stored.",
    np: "{count} परिवर्तन सेभ भयो। अब फारममा गोपसलले राखेको देखिन्छ।",
  },
  "settings.solo": { en: "Who delivers", np: "डेलिभरी कसले गर्छ" },
  "settings.stay": { en: "Keep editing", np: "बदल्दै गर्नुहोस्" },
  "settings.title": { en: "Shop settings", np: "पसलको सेटिङ" },
  "settings.unsaved": { en: "Not saved", np: "सेभ भएको छैन" },
  "settings.visible": {
    en: "Customers can find your shop in GoPasal.",
    np: "ग्राहकले गोपसलमा तपाईंको पसल भेट्न सक्छन्।",
  },

  /* ── blocker ─────────────────────────────────────────────────────────── */
  "settings.blocker.location": {
    en: "Your shop's location isn't recorded. Record it below — until then the shop stays hidden.",
    np: "पसलको ठाउँ राखिएको छैन। तल राख्नुहोस् — नराखेसम्म पसल लुकेको रहन्छ।",
  },

  /* ── category ────────────────────────────────────────────────────────── */
  "settings.category.choose": { en: "Choose a category", np: "किसिम छान्नुहोस्" },

  /* ── distance ────────────────────────────────────────────────────────── */
  "settings.distance.km": { en: "{km} km", np: "{km} km" },
  "settings.distance.m": { en: "{metres} m", np: "{metres} मिटर" },

  /* ── elsewhere ───────────────────────────────────────────────────────── */
  "settings.elsewhere.address": {
    en: "Web address: /{slug}. It was set when GoPasal approved the shop and stays the same if you rename it.",
    np: "वेब ठेगाना: /{slug}। गोपसलले पसल स्वीकृत गर्दा राखिएको हो, नाम बदले पनि यही रहन्छ।",
  },
  "settings.elsewhere.photos": {
    en: "Logo and cover photo: GoPasal doesn't have a way to upload these yet, on the phone or the console.",
    np: "लोगो र कभर फोटो: गोपसलमा अहिले यी अपलोड गर्ने उपाय छैन, फोनमा पनि, कन्सोलमा पनि।",
  },

  /* ── gps ─────────────────────────────────────────────────────────────── */
  "settings.gps.accuracy": {
    en: "GPS accurate to about {metres} m",
    np: "GPS करिब {metres} मिटरसम्म सही",
  },
  "settings.gps.age": { en: "Last update {seconds} s ago", np: "{seconds} सेकेन्ड अघि अपडेट भयो" },
  "settings.gps.denied": {
    en: "GoPasal needs location permission for this. You can turn it on in your phone's settings.",
    np: "यसका लागि गोपसललाई लोकेसन अनुमति चाहिन्छ। फोनको सेटिङमा गएर खोल्न सकिन्छ।",
  },
  "settings.gps.fresh": { en: "Updating live", np: "लाइभ अपडेट हुँदै" },
  "settings.gps.noAccuracy": { en: "GPS gave no accuracy figure", np: "GPS ले कति सही हो भनेन" },
  "settings.gps.unavailable": {
    en: "Couldn't get a location from this phone just now.",
    np: "अहिले यो फोनबाट लोकेसन पाइएन।",
  },
  "settings.gps.waiting": {
    en: "Waiting for GPS… stand in the open if you can.",
    np: "GPS पर्खँदै… सके खुला ठाउँमा उभिनुहोस्।",
  },

  /* ── issue ───────────────────────────────────────────────────────────── */
  "settings.issue.category": {
    en: "Choose a category. It can be changed but not left empty.",
    np: "किसिम छान्नुहोस्। बदल्न सकिन्छ, खाली छोड्न मिल्दैन।",
  },
  "settings.issue.minOrder": {
    en: "The minimum order is a whole number of rupees — 0 for no minimum.",
    np: "न्यूनतम अर्डर पूरा रुपैयाँमा हुनुपर्छ — न्यूनतम नचाहिए 0।",
  },
  "settings.issue.nameLong": {
    en: "The shop name can be at most {max} characters.",
    np: "पसलको नाम बढीमा {max} अक्षरको हुन सक्छ।",
  },
  "settings.issue.nameShort": {
    en: "The shop name needs at least {min} characters.",
    np: "पसलको नाम कम्तीमा {min} अक्षरको चाहिन्छ।",
  },
  "settings.issue.radius": {
    en: "The delivery radius must be between {min} and {max} km.",
    np: "डेलिभरी दूरी {min} देखि {max} km बीच हुनुपर्छ।",
  },
  "settings.issue.tooLong": { en: "{max} characters at most.", np: "बढीमा {max} अक्षर।" },

  /* ── location ────────────────────────────────────────────────────────── */
  "settings.location.accuracy": {
    en: "Accurate to about {metres} m",
    np: "करिब {metres} मिटरसम्म सही",
  },
  "settings.location.accuracyUnknown": {
    en: "Accuracy not recorded",
    np: "कति सही हो राखिएको छैन",
  },
  "settings.location.confirmAction": { en: "Record", np: "राख्नुहोस्" },
  "settings.location.confirmFirst": { en: "Record the shop here?", np: "पसल यहीँ राख्ने?" },
  "settings.location.confirmFirstDetail": {
    en: "Accurate to about {metres} m. Deliveries and your {km} km radius will be measured from here.",
    np: "करिब {metres} मिटरसम्म सही। डेलिभरी र तपाईंको {km} km दूरी यहीँबाट नापिन्छ।",
  },
  "settings.location.confirmMove": {
    en: "Move the shop's pin here?",
    np: "पसलको पिन यहाँ सार्ने?",
  },
  "settings.location.confirmMoveDetail": {
    en: "This is {distance} from the current pin, accurate to about {metres} m. Deliveries and your {km} km radius will be measured from here.",
    np: "यो अहिलेको पिनबाट {distance} टाढा छ, करिब {metres} मिटरसम्म सही। डेलिभरी र तपाईंको {km} km दूरी यहीँबाट नापिन्छ।",
  },
  "settings.location.current": { en: "Where GoPasal has the shop", np: "गोपसलमा पसल यहाँ छ" },
  "settings.location.done": { en: "Location recorded", np: "ठाउँ राखियो" },
  "settings.location.doneDetail": {
    en: "GoPasal stored {coords}, accurate to about {metres} m.",
    np: "गोपसलले {coords} राख्यो, करिब {metres} मिटरसम्म सही।",
  },
  "settings.location.doneReceipt": {
    en: "GoPasal already had this reading.",
    np: "गोपसलसँग यो ठाउँ पहिल्यै थियो।",
  },
  "settings.location.fromPin": {
    en: "{distance} from where the pin is now",
    np: "अहिलेको पिनबाट {distance}",
  },
  "settings.location.how": {
    en: "Stand at the shop's door, outside if you can. Wait until the accuracy is as low as it goes — it must be under {max} m — then record.",
    np: "पसलको ढोकामा, सके बाहिर उभिनुहोस्। सही हुने अंक जतिसक्दो घटेसम्म पर्खनुहोस् — {max} मिटरभन्दा कम हुनुपर्छ — अनि राख्नुहोस्।",
  },
  "settings.location.issue.accuracy": {
    en: "The reading needs to be accurate to within {max} m. Step outside, away from the roof, and wait for the number to drop.",
    np: "ठाउँ {max} मिटरभित्र सही हुनुपर्छ। छानोबाट पर, बाहिर निस्केर अंक घट्दासम्म पर्खनुहोस्।",
  },
  "settings.location.issue.clock": {
    en: "This phone's clock is wrong, so GoPasal can't accept its location. Set the date and time to automatic, then try again.",
    np: "यो फोनको घडी मिलेको छैन, त्यसैले गोपसलले यसको लोकेसन लिन सक्दैन। मिति र समय अटोमेटिक बनाएर फेरि प्रयास गर्नुहोस्।",
  },
  "settings.location.issue.stale": {
    en: "That reading is more than two minutes old. Wait for GPS to update, then try again.",
    np: "यो ठाउँ दुई मिनेटभन्दा पुरानो भयो। GPS अपडेट हुन पर्खेर फेरि प्रयास गर्नुहोस्।",
  },
  "settings.location.method.direct": {
    en: "taken on a phone at the shop",
    np: "पसलमै फोनबाट लिइएको",
  },
  "settings.location.method.handoff": {
    en: "taken from a shared link",
    np: "पठाइएको लिंकबाट लिइएको",
  },
  "settings.location.noAccess": {
    en: "You can't record the shop's location",
    np: "तपाईं पसलको ठाउँ राख्न सक्नुहुन्न",
  },
  "settings.location.none": {
    en: "Not recorded — customers can't see the shop",
    np: "राखिएको छैन — ग्राहकले पसल देख्दैनन्",
  },
  "settings.location.record": { en: "Record the location", np: "ठाउँ राख्नुहोस्" },
  "settings.location.record.again": { en: "Move the pin to here", np: "पिन यहाँ सार्नुहोस्" },
  "settings.location.record.first": { en: "Record the shop here", np: "पसल यहीँ राख्नुहोस्" },
  "settings.location.recorded": { en: "Recorded", np: "राखिएको" },
  "settings.location.summary": {
    en: "Accurate to about {metres} m · recorded {date}",
    np: "करिब {metres} मिटरसम्म सही · {date} मा राखिएको",
  },
  "settings.location.take": { en: "Record it again, here", np: "यहीँबाट फेरि राख्नुहोस्" },
  "settings.location.when": { en: "Recorded {date}", np: "{date} मा राखिएको" },
  "settings.location.whenHow": {
    en: "Recorded {date}, {method}",
    np: "{date} मा राखिएको, {method}",
  },
  "settings.location.why": {
    en: "Customers can't see a shop without a recorded location, even once it's approved and stocked. Every delivery distance and your delivery radius are measured from this point.",
    np: "ठाउँ नराखेसम्म, स्वीकृत भई सामान राखे पनि ग्राहकले पसल देख्दैनन्। हरेक डेलिभरीको दूरी र तपाईंको डेलिभरी दूरी यही बिन्दुबाट नापिन्छ।",
  },

  /* ── noAccess ────────────────────────────────────────────────────────── */
  "settings.noAccess.detail": {
    en: "The shop's owner decides who can see and change the shop's details. Ask them if you need to.",
    np: "पसलको विवरण कसले हेर्ने र बदल्ने भन्ने कुरा पसलको मालिकले तय गर्छन्। चाहिए उहाँलाई सोध्नुहोस्।",
  },
  "settings.noAccess.title": {
    en: "Shop settings aren't part of your role",
    np: "पसलको सेटिङ तपाईंको भूमिकामा पर्दैन",
  },

  /* ── pay ─────────────────────────────────────────────────────────────── */
  "settings.pay.cod": { en: "Cash on delivery", np: "क्यास अन डेलिभरी" },
  "settings.pay.note": {
    en: "GoPasal sets which payments your shop takes. To change them, contact GoPasal.",
    np: "पसलले कुन भुक्तानी लिने भन्ने गोपसलले तय गर्छ। बदल्न गोपसललाई सम्पर्क गर्नुहोस्।",
  },
  "settings.pay.off": { en: "Not offered", np: "छैन" },
  "settings.pay.offA11y": { en: "{method}: not offered", np: "{method}: छैन" },
  "settings.pay.on": { en: "Offered", np: "छ" },
  "settings.pay.onA11y": { en: "{method}: offered", np: "{method}: छ" },
  "settings.pay.online": { en: "Online — eSewa and Khalti", np: "अनलाइन — eSewa र Khalti" },

  /* ── payout ──────────────────────────────────────────────────────────── */
  "settings.payout.account": { en: "Account", np: "खाता" },
  "settings.payout.bank": { en: "Bank account", np: "बैंक खाता" },
  "settings.payout.esewa": { en: "eSewa" },
  "settings.payout.khalti": { en: "Khalti" },
  "settings.payout.none": {
    en: "Shown here after your first payout.",
    np: "पहिलो भुक्तानीपछि यहाँ देखिन्छ।",
  },
  "settings.payout.note": {
    en: "The payout account is the one you gave when you registered. To change it, contact GoPasal — it can't be changed from the app.",
    np: "भुक्तानी खाता दर्ता हुँदा दिनुभएको नै हो। बदल्न गोपसललाई सम्पर्क गर्नुहोस् — एपबाट बदल्न मिल्दैन।",
  },

  /* ── problem ─────────────────────────────────────────────────────────── */
  "settings.problem.forbidden": {
    en: "Your role in this shop doesn't allow that any more. Ask the owner.",
    np: "पसलमा तपाईंको भूमिकाले अब यो गर्न दिँदैन। मालिकलाई सोध्नुहोस्।",
  },
  "settings.problem.offline": {
    en: "Couldn't reach GoPasal. Nothing was changed — try again when you're connected.",
    np: "गोपसलसम्म पुग्न सकिएन। केही बदलिएन — इन्टरनेट आएपछि फेरि प्रयास गर्नुहोस्।",
  },

  /* ── radius ──────────────────────────────────────────────────────────── */
  "settings.radius.a11y": { en: "Delivery radius, {km} km", np: "डेलिभरी दूरी, {km} km" },
  "settings.radius.hint": {
    en: "You deliver to anyone this close to the shop. Delivery zones reach further.",
    np: "पसलबाट यति नजिक जो भए पनि डेलिभरी गर्नुहुन्छ। डेलिभरी जोनले योभन्दा टाढा पुग्छ।",
  },
  "settings.radius.less": { en: "{km} km closer", np: "{km} km नजिक" },
  "settings.radius.more": { en: "{km} km further", np: "{km} km टाढा" },
  "settings.radius.narrower": {
    en: "Customers between {from} and {to} km away won't be able to order unless a delivery zone covers them.",
    np: "{from} देखि {to} km टाढाका ग्राहकले, डेलिभरी जोनमा नपरेसम्म, अर्डर गर्न सक्दैनन्।",
  },
  "settings.radius.value": { en: "{km} km", np: "{km} km" },
  "settings.radius.was": { en: "Was {km} km", np: "पहिले {km} km" },
  "settings.radius.wider": {
    en: "Customers between {from} and {to} km away will be able to order. Your zones only matter beyond {to} km.",
    np: "{from} देखि {to} km टाढाका ग्राहकले अर्डर गर्न सक्छन्। तपाईंका जोन {to} km भन्दा पर मात्र काम लाग्छन्।",
  },

  /* ── section ─────────────────────────────────────────────────────────── */
  "settings.section.contact": { en: "Contact and address", np: "सम्पर्क र ठेगाना" },
  "settings.section.delivery": { en: "Delivery", np: "डेलिभरी" },
  "settings.section.elsewhere": { en: "Not changed here", np: "यहाँबाट नबदलिने" },
  "settings.section.payments": { en: "Payments", np: "भुक्तानी" },
  "settings.section.profile": { en: "About the shop", np: "पसलबारे" },

  /* ── solo ────────────────────────────────────────────────────────────── */
  "settings.solo.hint": {
    en: "This only records how the shop works. Every order still needs a rider assigned before it goes out — if you deliver yourself, add yourself as a rider.",
    np: "यसले पसल कसरी चल्छ भन्ने मात्र राख्छ। हरेक अर्डर निस्कनुअघि राइडर तोक्नैपर्छ — आफैं डेलिभरी गर्नुहुन्छ भने आफूलाई राइडरमा थप्नुहोस्।",
  },
  "settings.solo.off": { en: "Our riders", np: "हाम्रा राइडर" },
  "settings.solo.on": { en: "I deliver myself", np: "म आफैं डेलिभरी गर्छु" },
};

import type { Dictionary } from "@gopasal/native-ui";

/** Strings for the delivery screens. House rules for the Nepali are at the top of ./core.ts. */
export const deliveryStrings: Dictionary = {
  /* ── check ───────────────────────────────────────────────────────────── */
  "delivery.check.action": { en: "Check this spot", np: "यो ठाउँ जाँच्नुहोस्" },
  "delivery.check.detail": {
    en: "Go to an address you want covered and check it against the outline on screen, including corners you haven't saved yet.",
    np: "डेलिभरी चाहिने ठेगानामा गएर स्क्रिनको रेखासँग जाँच्नुहोस्, सेभ नगरेका कुनासमेत।",
  },
  "delivery.check.inRadius": {
    en: "This spot is {distance} from the shop, inside your {km} km radius — you deliver here anyway, and the zone isn't used here.",
    np: "यो ठाउँ पसलबाट {distance} मा, तपाईंको {km} km भित्र छ — यहाँ जसरी पनि डेलिभरी हुन्छ, जोन लाग्दैन।",
  },
  "delivery.check.inside": { en: "Inside this zone", np: "यो जोनभित्र" },
  "delivery.check.insideDetail": {
    en: "Once saved, an order to here would be delivered at this zone's fee.",
    np: "सेभ गरेपछि यहाँको अर्डर यो जोनको शुल्कमा डेलिभर हुन्छ।",
  },
  "delivery.check.needCorners": {
    en: "Needs at least 3 corners first.",
    np: "पहिले कम्तीमा 3 कुना चाहिन्छ।",
  },
  "delivery.check.noFix": {
    en: "No fresh GPS reading yet. Wait a moment and check again.",
    np: "अहिलेसम्म नयाँ GPS आएको छैन। एकैछिन पर्खेर फेरि जाँच्नुहोस्।",
  },
  "delivery.check.olderWins": {
    en: "An older zone, {zone}, also covers this spot, so its fee would be charged here instead.",
    np: "पुरानो जोन {zone} ले पनि यो ठाउँ समेट्छ, त्यसैले यहाँ त्यसको शुल्क लाग्छ।",
  },
  "delivery.check.otherZone": {
    en: "It's covered by another zone, {zone}, so it's still deliverable.",
    np: "अर्को जोन {zone} ले समेटेको छ, त्यसैले डेलिभरी हुन्छ।",
  },
  "delivery.check.outside": { en: "Outside this zone", np: "यो जोनबाहिर" },
  "delivery.check.outsideDetail": {
    en: "It's also outside your radius, so an order to here couldn't be delivered unless another zone covers it.",
    np: "तपाईंको दूरीभन्दा पनि बाहिर छ, अर्को जोनले नसमेटेसम्म यहाँको अर्डर डेलिभर हुँदैन।",
  },
  "delivery.check.outsideNoPin": {
    en: "This outline doesn't reach here.",
    np: "यो रेखा यहाँसम्म पुग्दैन।",
  },
  "delivery.check.rough": {
    en: "GPS was only accurate to {metres} m, so near an edge this could go either way.",
    np: "GPS {metres} मिटरसम्म मात्र सही थियो, त्यसैले किनारनेर जे पनि हुन सक्छ।",
  },
  "delivery.check.start": { en: "Turn on GPS to check", np: "जाँच्न GPS खोल्नुहोस्" },
  "delivery.check.title": { en: "Check where you're standing", np: "उभिएको ठाउँ जाँच्नुहोस्" },

  /* ── corner ──────────────────────────────────────────────────────────── */
  "delivery.corner.a11y": { en: "Corner {n}, {detail}", np: "कुना {n}, {detail}" },
  "delivery.corner.accuracy": { en: "±{metres} m", np: "±{metres} मिटर" },
  "delivery.corner.add": { en: "Add corner {n} here", np: "कुना {n} यहाँ थप्नुहोस्" },
  "delivery.corner.closed": {
    en: "You're back at corner 1. The outline already joins up by itself — you can save.",
    np: "तपाईं कुना 1 मै फर्कनुभयो। रेखा आफैं जोडिन्छ — सेभ गर्न सकिन्छ।",
  },
  "delivery.corner.full": {
    en: "A zone can have at most {max} corners.",
    np: "एउटा जोनमा बढीमा {max} कुना हुन्छ।",
  },
  "delivery.corner.gap": { en: "{distance} from corner {n}", np: "कुना {n} बाट {distance}" },
  "delivery.corner.noFix": {
    en: "No GPS reading yet. Wait for the accuracy to show, then add the corner.",
    np: "अहिलेसम्म GPS आएको छैन। सही हुने अंक देखिएपछि कुना थप्नुहोस्।",
  },
  "delivery.corner.restart": { en: "Start again", np: "फेरि सुरु गर्नुहोस्" },
  "delivery.corner.restartAction": { en: "Clear corners", np: "कुना हटाउनुहोस्" },
  "delivery.corner.restartDetail": {
    en: "The outline on this screen is cleared so you can walk it again. The saved zone doesn't change until you save.",
    np: "फेरि हिँड्न सकियोस् भनेर यो स्क्रिनको रेखा हटाइन्छ। सेभ नगरेसम्म सेभ भएको जोन बदलिँदैन।",
  },
  "delivery.corner.restartTitle": { en: "Clear all corners?", np: "सबै कुना हटाउने?" },
  "delivery.corner.rough": {
    en: "The reading is rougher than {max} m. Step into the open and wait for the number to drop.",
    np: "ठाउँ {max} मिटरभन्दा बढी अन्दाजी छ। खुला ठाउँमा गएर अंक घट्दासम्म पर्खनुहोस्।",
  },
  "delivery.corner.roughTag": { en: "rough", np: "अन्दाजी" },
  "delivery.corner.same": {
    en: "That's the same spot as corner {n}. Move to the next corner first.",
    np: "यो कुना {n} कै ठाउँ हो। पहिले अर्को कुनामा जानुहोस्।",
  },
  "delivery.corner.saved": { en: "saved earlier", np: "पहिले सेभ गरेको" },
  "delivery.corner.stale": {
    en: "GPS hasn't updated for a while, so this wouldn't be where you are. Wait for it to update.",
    np: "GPS धेरैबेरदेखि अपडेट भएको छैन, त्यसैले यो तपाईं उभिएको ठाउँ हुँदैन। अपडेट हुन पर्खनुहोस्।",
  },
  "delivery.corner.startGps": { en: "Walk new corners", np: "नयाँ कुना हिँड्नुहोस्" },
  "delivery.corner.undo": { en: "Undo corner {n}", np: "कुना {n} फर्काउनुहोस्" },

  /* ── noAccess ────────────────────────────────────────────────────────── */
  "delivery.noAccess.detail": {
    en: "The shop's owner decides who can see riders and delivery zones. Ask them if you need it.",
    np: "राइडर र डेलिभरी जोन कसले हेर्ने भन्ने पसलको मालिकले तय गर्छन्। चाहिए उहाँलाई सोध्नुहोस्।",
  },
  "delivery.noAccess.title": {
    en: "Delivery isn't part of your role",
    np: "डेलिभरी तपाईंको भूमिकामा पर्दैन",
  },

  /* ── outline ─────────────────────────────────────────────────────────── */
  "delivery.outline.a11y": {
    en: "Outline of the zone, {count} corners",
    np: "जोनको रेखा, {count} कुना",
  },
  "delivery.outline.empty": {
    en: "The outline appears here as you add corners.",
    np: "कुना थप्दै जाँदा रेखा यहाँ देखिन्छ।",
  },

  /* ── rider ───────────────────────────────────────────────────────────── */
  "delivery.rider.a11y": { en: "{name}, {vehicle}. {state}", np: "{name}, {vehicle}। {state}" },
  "delivery.rider.add": { en: "Add a rider", np: "राइडर थप्नुहोस्" },
  "delivery.rider.added": { en: "{name} is on your riders", np: "{name} तपाईंको राइडरमा थपिनुभयो" },
  "delivery.rider.addedNext": {
    en: "They sign in to the GoPasal rider app with this number and go online there. Until then they show as not online and can't be given orders.",
    np: "उहाँ यही नम्बरबाट गोपसल राइडर एपमा साइन इन गरेर त्यहीँ अनलाइन हुनुहुन्छ। तबसम्म अनलाइन नदेखिने र अर्डर दिन नमिल्ने हुन्छ।",
  },
  "delivery.rider.alreadyHere": {
    en: "This number is already your rider {name}. Going on will rename them and change their vehicle — it won't add a second rider.",
    np: "यो नम्बर पहिल्यै तपाईंको राइडर {name} को हो। अगाडि बढे नाम र सवारी बदलिन्छ — दोस्रो राइडर थपिँदैन।",
  },
  "delivery.rider.cantRemove": {
    en: "Can be removed once their deliveries are finished or handed to someone else.",
    np: "उहाँका डेलिभरी सकिएपछि वा अरूलाई दिएपछि हटाउन सकिन्छ।",
  },
  "delivery.rider.confirmAction": { en: "Yes, the number is right", np: "हो, नम्बर ठीक छ" },
  "delivery.rider.confirmCancel": { en: "Let me check", np: "एकपटक हेर्छु" },
  "delivery.rider.confirmDetail": {
    en: "Number: {phone}\nRead it back against the rider's phone.\n\nIf this number has no GoPasal account, one is created. If it already has one, its name becomes “{name}”. This can't be undone from your shop.",
    np: "नम्बर: {phone}\nराइडरको फोनसँग मिलाएर पढ्नुहोस्।\n\nयो नम्बरमा गोपसल खाता छैन भने बनाइन्छ। छ भने त्यसको नाम “{name}” हुन्छ। पसलबाट यो फर्काउन मिल्दैन।",
  },
  "delivery.rider.confirmRename": {
    en: "Rename this rider to {name}?",
    np: "यो राइडरको नाम {name} बनाउने?",
  },
  "delivery.rider.confirmTitle": { en: "Add {name} as a rider?", np: "{name} लाई राइडर थप्ने?" },
  "delivery.rider.continue": { en: "Check and add", np: "जाँचेर थप्नुहोस्" },
  "delivery.rider.issue.name": {
    en: "Enter the rider's name — at least 2 letters.",
    np: "राइडरको नाम हाल्नुहोस् — कम्तीमा 2 अक्षर।",
  },
  "delivery.rider.issue.phone": {
    en: "That isn't a ten-digit Nepali mobile number (98…, 97… or 96…).",
    np: "यो दस अंकको नेपाली मोबाइल नम्बर होइन (98…, 97… वा 96…)।",
  },
  "delivery.rider.issue.phoneMissing": {
    en: "Enter the rider's mobile number.",
    np: "राइडरको मोबाइल नम्बर हाल्नुहोस्।",
  },
  "delivery.rider.keep": { en: "Keep them", np: "राख्नुहोस्" },
  "delivery.rider.name": { en: "Rider's name", np: "राइडरको नाम" },
  "delivery.rider.nameHint": {
    en: "As they'd like customers to see it. This replaces any name already on their account.",
    np: "ग्राहकले जस्तो देखून् भन्ने उहाँ चाहनुहुन्छ। खातामा पहिलेको नाम भए यसले बदल्छ।",
  },
  "delivery.rider.noAccess.detail": {
    en: "Adding and removing riders is for people whose role can assign deliveries. Ask the shop's owner.",
    np: "राइडर थप्ने र हटाउने काम डेलिभरी तोक्न पाउने भूमिकाको हो। पसलको मालिकलाई सोध्नुहोस्।",
  },
  "delivery.rider.noAccess.title": {
    en: "You can't add riders",
    np: "तपाईं राइडर थप्न सक्नुहुन्न",
  },
  "delivery.rider.onDelivery": { en: "On a delivery", np: "डेलिभरीमा" },
  "delivery.rider.otherShop": {
    en: "This number already rides for another GoPasal shop. A rider can only be on one shop's roster — they'd have to be removed there first.",
    np: "यो नम्बर पहिल्यै अर्को गोपसल पसलको राइडर हो। एउटा राइडर एउटै पसलमा मात्र हुन्छ — पहिले त्यहाँबाट हटाउनुपर्छ।",
  },
  "delivery.rider.phone": { en: "Rider's mobile number", np: "राइडरको मोबाइल नम्बर" },
  "delivery.rider.phoneHint": {
    en: "The number they'll sign in to the rider app with.",
    np: "राइडर एपमा साइन इन गर्ने नम्बर।",
  },
  "delivery.rider.phonePlaceholder": { en: "98XXXXXXXX" },
  "delivery.rider.phoneWillBe": {
    en: "Will be saved as {phone}",
    np: "{phone} को रूपमा सेभ हुन्छ",
  },
  "delivery.rider.removeA11y": {
    en: "Remove {name} from your riders",
    np: "{name} लाई राइडरबाट हटाउनुहोस्",
  },
  "delivery.rider.removeAction": { en: "Remove", np: "हटाउनुहोस्" },
  "delivery.rider.removeBusy": {
    en: "{name} has a delivery on the road now. Finish or hand it over first, then remove them.",
    np: "{name} अहिले डेलिभरीमा हुनुहुन्छ। पहिले सक्नुहोस् वा अरूलाई दिनुहोस्, अनि हटाउनुहोस्।",
  },
  "delivery.rider.removeDetail": {
    en: "They won't be offered your deliveries any more. Their GoPasal account and past deliveries stay as they are. To bring them back, add them again.",
    np: "अबदेखि उहाँलाई तपाईंका डेलिभरी दिइँदैन। गोपसल खाता र पुराना डेलिभरी जस्ताको तस्तै रहन्छन्। फेरि ल्याउन फेरि थप्नुहोस्।",
  },
  "delivery.rider.removeTitle": {
    en: "Remove {name} from your riders?",
    np: "{name} लाई राइडरबाट हटाउने?",
  },
  "delivery.rider.removed": {
    en: "{name} is off your riders. Their GoPasal account is still there.",
    np: "{name} अब तपाईंको राइडरमा हुनुहुन्न। उहाँको गोपसल खाता रहन्छ।",
  },
  "delivery.rider.update": { en: "Update this rider", np: "यो राइडर अपडेट गर्नुहोस्" },
  "delivery.rider.vehicle": { en: "How they ride", np: "केमा चढ्नुहुन्छ" },
  "delivery.rider.warn": {
    en: "If the number has no GoPasal account, one is made for it. If it already has one — even a customer's — its name is changed to the name you type here. Neither can be undone from the shop, so check the number with the rider.",
    np: "नम्बरमा गोपसल खाता छैन भने बनाइन्छ। छ भने — ग्राहकको भए पनि — त्यसको नाम यहाँ लेखेको नाममा बदलिन्छ। पसलबाट कुनै पनि फर्काउन मिल्दैन, त्यसैले राइडरसँग नम्बर जाँच्नुहोस्।",
  },
  "delivery.rider.warnTitle": {
    en: "This creates or changes a GoPasal account",
    np: "यसले गोपसल खाता बनाउँछ वा बदल्छ",
  },

  /* ── riders ──────────────────────────────────────────────────────────── */
  "delivery.riders.counts": {
    en: "{free} free · {busy} on the road · {offline} not online",
    np: "{free} खाली · {busy} बाटोमा · {offline} अनलाइन छैनन्",
  },
  "delivery.riders.empty": {
    en: "No riders yet. Add the people who carry your orders so you can give them deliveries.",
    np: "अहिलेसम्म राइडर छैन। अर्डर बोक्नेहरूलाई थप्नुहोस्, अनि डेलिभरी दिन सकिन्छ।",
  },
  "delivery.riders.onlineNote": {
    en: "Riders go online from their own GoPasal rider app — you can't switch them on from here. An order can only be given to a rider who is online and free.",
    np: "राइडर आफ्नै गोपसल राइडर एपबाट अनलाइन हुन्छन् — यहाँबाट खोल्न मिल्दैन। अनलाइन र खाली राइडरलाई मात्र अर्डर दिन सकिन्छ।",
  },

  /* ── general ─────────────────────────────────────────────────────────── */
  "delivery.title": { en: "Delivery", np: "डेलिभरी" },

  /* ── vehicle ─────────────────────────────────────────────────────────── */
  "delivery.vehicle.bicycle": { en: "Bicycle", np: "साइकल" },
  "delivery.vehicle.motorbike": { en: "Motorbike", np: "मोटरसाइकल" },
  "delivery.vehicle.scooter": { en: "Scooter", np: "स्कुटर" },
  "delivery.vehicle.van": { en: "Van", np: "भ्यान" },
  "delivery.vehicle.walk": { en: "On foot", np: "हिँडेर" },

  /* ── zone ────────────────────────────────────────────────────────────── */
  "delivery.zone.area": { en: "about {area} km²", np: "करिब {area} km²" },
  "delivery.zone.boundary": { en: "Boundary", np: "सीमा" },
  "delivery.zone.cantMove": {
    en: "Corners can't be dragged on the phone. New corners go after the last one; to reshape the middle, start again and walk it.",
    np: "फोनमा कुना तान्न मिल्दैन। नयाँ कुना अन्तिमपछि थपिन्छ; बीचको आकार बदल्न फेरि सुरु गरेर हिँड्नुहोस्।",
  },
  "delivery.zone.cornerCount": { en: "{count} of {max} corners", np: "{max} मध्ये {count} कुना" },
  "delivery.zone.crosses": {
    en: "The outline crosses itself, so the corners were probably taken out of order. Where the edges overlap, addresses count as outside. Undo back past the crossing, or start again.",
    np: "रेखा आफैंलाई काट्छ, सायद कुना क्रम मिलाएर लिइएनन्। किनारा खप्टिने ठाउँका ठेगाना बाहिर गनिन्छन्। काटिएको ठाउँभन्दा अघिसम्म फर्काउनुहोस्, वा फेरि सुरु गर्नुहोस्।",
  },
  "delivery.zone.delete": { en: "Delete this zone", np: "यो जोन मेटाउनुहोस्" },
  "delivery.zone.deleteAction": { en: "Delete zone", np: "जोन मेटाउनुहोस्" },
  "delivery.zone.deleteDetail": {
    en: "Addresses outside your {km} km radius that only this zone covers will stop being able to order. The outline can't be brought back — it would have to be walked again. Orders already placed aren't affected.",
    np: "तपाईंको {km} km बाहिर यो जोनले मात्र समेटेका ठेगानाबाट अर्डर गर्न मिल्दैन। रेखा फर्काउन मिल्दैन — फेरि हिँड्नुपर्छ। भइसकेका अर्डरमा असर पर्दैन।",
  },
  "delivery.zone.deleteTitle": { en: "Delete {name}?", np: "{name} मेटाउने?" },
  "delivery.zone.discard": { en: "Leave", np: "छोड्नुहोस्" },
  "delivery.zone.discardDetail": {
    en: "The corners and changes on this screen haven't been saved and will be lost.",
    np: "यो स्क्रिनका कुना र परिवर्तन सेभ भएका छैनन्, हराउँछन्।",
  },
  "delivery.zone.discardTitle": { en: "Leave without saving?", np: "सेभ नगरी छोड्ने?" },
  "delivery.zone.fee": { en: "Delivery fee in this zone", np: "यो जोनमा डेलिभरी शुल्क" },
  "delivery.zone.feeAmount": {
    en: "Fee in rupees (0 for free delivery)",
    np: "शुल्क रुपैयाँमा (निःशुल्क डेलिभरीका लागि 0)",
  },
  "delivery.zone.feeFixed": { en: "रु {amount} delivery", np: "रु {amount} डेलिभरी" },
  "delivery.zone.feeFixedChoice": { en: "Fixed fee", np: "तोकिएको शुल्क" },
  "delivery.zone.feeFormula": { en: "Usual distance fee", np: "सधैंको दूरी शुल्क" },
  "delivery.zone.feeFormulaHint": {
    en: "The same distance-based fee GoPasal charges everywhere else.",
    np: "गोपसलले अरू ठाउँमा लिने दूरी अनुसारकै शुल्क।",
  },
  "delivery.zone.feeFree": { en: "Free delivery", np: "निःशुल्क डेलिभरी" },
  "delivery.zone.gone": { en: "This zone isn't there any more", np: "यो जोन अब छैन" },
  "delivery.zone.goneDetail": {
    en: "Someone may have deleted it from another phone or the console.",
    np: "कसैले अर्को फोन वा कन्सोलबाट मेटाएको हुन सक्छ।",
  },
  "delivery.zone.howTo": {
    en: "Stand at one corner of the area and tap Add corner. Walk or ride along the edge to the next corner and tap again. Go all the way round — the last corner joins back to the first by itself.",
    np: "क्षेत्रको एउटा कुनामा उभिएर कुना थप्नुहोस् थिच्नुहोस्। किनारै-किनार अर्को कुनासम्म हिँडेर वा चढेर फेरि थिच्नुहोस्। पूरै घुम्नुहोस् — अन्तिम कुना आफैं पहिलोसँग जोडिन्छ।",
  },
  "delivery.zone.issue.badPoint": {
    en: "One of those corners isn't a real place. Undo it and take it again.",
    np: "ती कुनामध्ये एउटा साँचो ठाउँ होइन। फर्काएर फेरि लिनुहोस्।",
  },
  "delivery.zone.issue.fee": {
    en: "The zone fee is a whole number of rupees, up to {max}.",
    np: "जोनको शुल्क पूरा रुपैयाँमा, बढीमा {max} हुनुपर्छ।",
  },
  "delivery.zone.issue.fewPoints": {
    en: "A zone needs at least {min} corners. You have {count}.",
    np: "जोनमा कम्तीमा {min} कुना चाहिन्छ। तपाईंसँग {count} छ।",
  },
  "delivery.zone.issue.manyPoints": {
    en: "A zone can have at most {max} corners. Undo some.",
    np: "जोनमा बढीमा {max} कुना हुन्छ। केही फर्काउनुहोस्।",
  },
  "delivery.zone.issue.nameLong": {
    en: "A zone name can be at most {max} characters.",
    np: "जोनको नाम बढीमा {max} अक्षरको हुन सक्छ।",
  },
  "delivery.zone.issue.nameShort": {
    en: "Give the zone a name of at least {min} letters.",
    np: "जोनलाई कम्तीमा {min} अक्षरको नाम दिनुहोस्।",
  },
  "delivery.zone.issue.samePlace": {
    en: "Those corners are all in the same place, so the zone covers nothing. Walk to each corner before adding it.",
    np: "ती सबै कुना एउटै ठाउँमा छन्, त्यसैले जोनले केही समेट्दैन। हरेक कुनामा पुगेर मात्र थप्नुहोस्।",
  },
  "delivery.zone.keep": { en: "Keep it", np: "राख्नुहोस्" },
  "delivery.zone.legend": {
    en: "Blue: your shop and its {km} km radius",
    np: "निलो: तपाईंको पसल र {km} km दूरी",
  },
  "delivery.zone.limitOrders": {
    en: "Orders already placed keep the fee they were placed with.",
    np: "भइसकेका अर्डरमा त्यतिबेलाकै शुल्क रहन्छ।",
  },
  "delivery.zone.limitOverlap": {
    en: "If zones overlap, the oldest zone's fee is used. The order of zones can't be changed.",
    np: "जोन खप्टिए सबैभन्दा पुरानो जोनको शुल्क लाग्छ। जोनको क्रम बदल्न मिल्दैन।",
  },
  "delivery.zone.limitRadius": {
    en: "A zone only counts outside your {km} km radius. Inside it you deliver anyway, at the usual fee, and the zone's fee isn't used.",
    np: "जोन तपाईंको {km} km बाहिर मात्र गनिन्छ। भित्र जसरी पनि सधैंको शुल्कमा डेलिभरी हुन्छ, जोनको शुल्क लाग्दैन।",
  },
  "delivery.zone.limitsTitle": { en: "Good to know", np: "जान्नुपर्ने कुरा" },
  "delivery.zone.name": { en: "Zone name", np: "जोनको नाम" },
  "delivery.zone.namePlaceholder": { en: "e.g. Across the bridge", np: "जस्तै पुलपारि" },
  "delivery.zone.new": { en: "Walk a new zone", np: "नयाँ जोन हिँड्नुहोस्" },
  "delivery.zone.newTitle": { en: "New delivery zone", np: "नयाँ डेलिभरी जोन" },
  "delivery.zone.noEdit": { en: "You can't draw zones", np: "तपाईं जोन बनाउन सक्नुहुन्न" },
  "delivery.zone.rowA11y": { en: "{name}, {fee}. Open", np: "{name}, {fee}। खोल्नुहोस्" },
  "delivery.zone.shape": {
    en: "{count} corners · about {area} km²",
    np: "{count} कुना · करिब {area} km²",
  },
  "delivery.zone.stay": { en: "Stay", np: "बस्नुहोस्" },
  "delivery.zone.title": { en: "Delivery zone", np: "डेलिभरी जोन" },
  "delivery.zone.unreadable": {
    en: "Its outline can't be read on the phone. Open it to walk a new one.",
    np: "यसको रेखा फोनमा पढ्न सकिँदैन। नयाँ हिँड्न खोल्नुहोस्।",
  },
  "delivery.zone.unreadableDetail": {
    en: "This zone's saved outline can't be read on the phone, so it starts empty here. The server may still be using it. Walking a new outline and saving will replace it.",
    np: "यो जोनको सेभ भएको रेखा फोनमा पढ्न सकिँदैन, त्यसैले यहाँ खाली सुरु हुन्छ। सर्भरले अझै प्रयोग गरिरहेको हुन सक्छ। नयाँ रेखा हिँडेर सेभ गरे त्यसको सट्टा राखिन्छ।",
  },
  "delivery.zone.unsaved": { en: "Not saved", np: "सेभ भएको छैन" },

  /* ── zones ───────────────────────────────────────────────────────────── */
  "delivery.zones.empty": {
    en: "No zones. You deliver inside your radius only.",
    np: "जोन छैन। तपाईं आफ्नो दूरीभित्र मात्र डेलिभरी गर्नुहुन्छ।",
  },
  "delivery.zones.failed": {
    en: "Couldn't load your zones just now.",
    np: "अहिले जोन देखाउन सकिएन।",
  },
  "delivery.zones.noPin": {
    en: "Your shop has no recorded location, so the radius can't be measured and customers can't see the shop. Record it from Shop settings.",
    np: "पसलको ठाउँ राखिएको छैन, त्यसैले दूरी नाप्न मिल्दैन र ग्राहकले पसल देख्दैनन्। पसलको सेटिङबाट राख्नुहोस्।",
  },
  "delivery.zones.overlap": {
    en: "Where zones overlap, the oldest one's fee is used. Oldest is listed first.",
    np: "जोन खप्टिए सबैभन्दा पुरानोको शुल्क लाग्छ। सबैभन्दा पुरानो माथि छ।",
  },
  "delivery.zones.radius": {
    en: "You deliver anywhere within {km} km of the shop, whatever the zones say. A zone reaches further: an address outside that circle is delivered only if a zone covers it, at the zone's fee.",
    np: "जोनले जे भने पनि पसलबाट {km} km भित्र जहाँ पनि डेलिभरी गर्नुहुन्छ। जोन योभन्दा पर पुग्छ: त्यो घेराबाहिरको ठेगाना कुनै जोनले समेटे मात्र, जोनकै शुल्कमा डेलिभर हुन्छ।",
  },
  "delivery.zones.readOnly": {
    en: "Only someone who can manage shop settings can draw or change zones.",
    np: "पसलको सेटिङ चलाउन पाउनेले मात्र जोन बनाउन वा बदल्न सक्छन्।",
  },
  "delivery.zones.title": { en: "Delivery zones", np: "डेलिभरी जोन" },
};

import type { Dictionary } from "@gopasal/native-ui";

/**
 * The delivery leg after an order leaves the counter: walking it, the handover,
 * a failed delivery, and a parcel coming back. House rules are at the top of
 * ./core.ts.
 *
 * The chips are sentences, not codes, because they are stored as the note and
 * read later — by the customer on their timeline, or by GoPasal settling a
 * dispute. "Handed to the customer" has to be true when it is tapped.
 */
export const legStrings: Dictionary = {
  "leg.title": { en: "Delivery", np: "डेलिभरी" },
  "leg.a11y.done": { en: "done", np: "भयो" },

  "leg.status.unassigned": { en: "No rider yet", np: "राइडर छैन" },
  "leg.status.assigned": { en: "Rider assigned", np: "राइडर तोकियो" },
  "leg.status.pickedUp": { en: "Picked up", np: "उठाइयो" },
  "leg.status.enRoute": { en: "On the way", np: "बाटोमा" },
  "leg.status.delivered": { en: "Delivered", np: "डेलिभरी भयो" },
  "leg.status.failed": { en: "Couldn't be delivered", np: "डेलिभरी हुन सकेन" },
  "leg.status.returning": { en: "Coming back to the shop", np: "पसलमा फर्किंदै" },
  "leg.status.returned": { en: "Back at the shop", np: "पसलमा फर्कियो" },

  "leg.do.pickUp": { en: "Picked up", np: "उठाइयो" },
  "leg.do.enRoute": { en: "On the way", np: "बाटोमा निस्कियो" },
  "leg.do.deliver": { en: "Delivered", np: "डेलिभरी भयो" },
  "leg.do.returning": { en: "Bringing it back", np: "फिर्ता ल्याउँदै" },
  "leg.do.returned": { en: "Parcel is back", np: "सामान फर्कियो" },
  "leg.do.fail": { en: "Couldn't deliver", np: "पुर्‍याउन सकिएन" },

  "leg.failReason": { en: "Why: {reason}", np: "कारण: {reason}" },
  "leg.returnNote": { en: "Came back: {note}", np: "फर्किँदा: {note}" },
  "leg.podNote": { en: "Handover: {note}", np: "बुझाइ: {note}" },
  "leg.cash.taken": { en: "Cash was collected", np: "नगद लिइयो" },
  "leg.cash.notTaken": { en: "Cash was not collected", np: "नगद लिइएन" },

  "leg.next.bringBack": {
    en: "The parcel had already left, so it has to come back to the shop first.",
    np: "सामान निस्किसकेको थियो, त्यसैले पहिले पसलमा फर्किनुपर्छ।",
  },
  "leg.next.reassign": {
    en: "It never left the shop. Give it to another rider, or try the same one again.",
    np: "सामान पसलबाट निस्केकै थिएन। अर्को राइडरलाई दिनुहोस्, वा उही राइडरलाई फेरि।",
  },
  "leg.next.receive": {
    en: "When it arrives, check it and record what came back.",
    np: "आइपुगेपछि जाँचेर के फर्कियो लेख्नुहोस्।",
  },
  "leg.next.redeliverOrCancel": {
    en: "Send it again with a rider, or cancel the order and tell the customer why.",
    np: "राइडरसँग फेरि पठाउनुहोस्, वा अर्डर रद्द गरेर ग्राहकलाई कारण भन्नुहोस्।",
  },
  "leg.hint.returned": {
    en: "Choose a rider above to send it again, or cancel it.",
    np: "फेरि पठाउन माथि राइडर छान्नुहोस्, वा रद्द गर्नुहोस्।",
  },
  "leg.hint.reassign": {
    en: "Choose a rider above to try again.",
    np: "फेरि प्रयास गर्न माथि राइडर छान्नुहोस्।",
  },
  "leg.rider.again": { en: "Send it again with", np: "फेरि कोसँग पठाउने" },

  "leg.photo.show": { en: "See the delivery photo", np: "डेलिभरीको फोटो हेर्नुहोस्" },
  "leg.photo.alt": { en: "Photo taken at the handover", np: "बुझाउँदा खिचिएको फोटो" },
  "leg.photo.missing": { en: "The photo couldn't be loaded.", np: "फोटो खुल्न सकेन।" },

  "leg.sheet.placeholder": { en: "In a few words…", np: "छोटकरीमा…" },
  "leg.sheet.required": { en: "A few words, please.", np: "केही शब्द लेख्नुहोस्।" },
  "leg.sheet.deliver.title": { en: "Who took the parcel?", np: "सामान कसले बुझ्नुभयो?" },
  "leg.sheet.deliver.detail": {
    en: "This closes the order. The note is kept in case the customer says it never came.",
    np: "यसले अर्डर बन्द गर्छ। ग्राहकले पाइनँ भने यही नोट हेरिन्छ।",
  },
  "leg.sheet.deliver.yes": { en: "Mark delivered", np: "डेलिभरी भयो" },
  "leg.sheet.cash": { en: "रु {amount} cash collected", np: "रु {amount} नगद लिइयो" },
  "leg.sheet.cashOn": {
    en: "Turn off if the customer didn't pay.",
    np: "ग्राहकले नतिरेको भए बन्द गर्नुहोस्।",
  },
  "leg.sheet.cashOff": {
    en: "Recorded as not paid. GoPasal will follow it up.",
    np: "नतिरेको भनी राखिन्छ। गोपसलले पछि हेर्छ।",
  },
  "leg.sheet.fail.title": { en: "Why couldn't it be delivered?", np: "किन पुर्‍याउन सकिएन?" },
  "leg.sheet.fail.detail": {
    en: "The customer sees this. If the parcel had left the shop, it comes back before anything else.",
    np: "ग्राहकले यो देख्नुहुन्छ। सामान पसलबाट निस्किसकेको भए पहिले फर्किन्छ।",
  },
  "leg.sheet.fail.yes": { en: "Record it", np: "राख्नुहोस्" },
  "leg.sheet.return.title": { en: "What came back?", np: "के फर्कियो?" },
  "leg.sheet.return.detail": {
    en: "Check the parcel before you confirm. This frees the rider, and the order can be sent again or cancelled.",
    np: "पुष्टि गर्नुअघि सामान जाँच्नुहोस्। यसले राइडरलाई छुटाउँछ, अनि अर्डर फेरि पठाउन वा रद्द गर्न सकिन्छ।",
  },
  "leg.sheet.return.yes": { en: "It's back", np: "फर्कियो" },

  "leg.chip.toCustomer": { en: "Handed to the customer", np: "ग्राहकलाई नै दिइयो" },
  "leg.chip.toFamily": { en: "Handed to family at the door", np: "ढोकामा परिवारलाई दिइयो" },
  "leg.chip.toGuard": { en: "Left with the guard", np: "गार्डलाई छोडियो" },
  "leg.chip.noAnswer": { en: "Customer didn't answer", np: "ग्राहकले फोन उठाउनुभएन" },
  "leg.chip.wrongAddress": { en: "Address couldn't be found", np: "ठेगाना भेटिएन" },
  "leg.chip.refused": { en: "Customer refused it", np: "ग्राहकले लिन मान्नुभएन" },
  "leg.chip.cantReach": { en: "Road or area not reachable", np: "बाटो वा ठाउँमा पुग्न सकिएन" },
  "leg.chip.intact": { en: "Parcel intact, nothing missing", np: "सामान ठीक छ, केही हराएको छैन" },
  "leg.chip.damaged": { en: "Parcel damaged", np: "सामान बिग्रिएको" },
  "leg.chip.missing": { en: "Items missing", np: "केही सामान छैन" },

  "queue.troubled": { en: "Didn't arrive", np: "पुगेन" },
};

import type { Dictionary } from "@gopasal/native-ui";

/**
 * Everything the rider app says about the work itself: availability, jobs,
 * the handover, problems, returns, history, the profile and the location
 * disclosure.
 *
 * Words a rider hears from the shop stay the shop's words — "पिकअप",
 * "डेलिभरी", "क्यास" — and every sentence that involves money names the amount,
 * because "collect the cash" without a number is the start of an argument.
 */
export const riderStrings: Dictionary = {
  "intro.tagline": { en: "Every parcel, right to the door", np: "हरेक पार्सल, सिधै ढोकासम्म" },
  "intro.badge": { en: "Rider", np: "राइडर" },

  /* ── tabs ─────────────────────────────────────────────────────────────── */
  "tab.jobs": { en: "Jobs", np: "काम" },
  "tab.history": { en: "History", np: "इतिहास" },
  "tab.profile": { en: "Me", np: "म" },

  /* ── not a rider ──────────────────────────────────────────────────────── */
  "notRider.title": { en: "This number isn't a rider yet", np: "यो नम्बर अझै राइडर होइन" },
  "notRider.detail": {
    en: "You're signed in as {phone}, but no shop has added this number as a rider.",
    np: "तपाईं {phone} बाट साइन इन हुनुहुन्छ, तर कुनै पसलले यो नम्बर राइडरको रूपमा थपेको छैन।",
  },
  "notRider.step1": { en: "Ask the shop you ride for to open GoPasal Seller.", np: "तपाईं काम गर्ने पसललाई गोपसल सेलर खोल्न भन्नुहोस्।" },
  "notRider.step2": {
    en: "Under Shop → Delivery → Riders, they add {phone}.",
    np: "पसल → डेलिभरी → राइडरमा गएर {phone} थप्नुहुन्छ।",
  },
  "notRider.step3": { en: "Then come back here and check again.", np: "त्यसपछि यहाँ फर्केर फेरि हेर्नुहोस्।" },
  "notRider.check": { en: "Check again", np: "फेरि हेर्नुहोस्" },
  "notRider.other": { en: "Use a different number", np: "अर्को नम्बर प्रयोग गर्नुहोस्" },

  /* ── jobs (home) ──────────────────────────────────────────────────────── */
  "jobs.title": { en: "Jobs", np: "काम" },
  "jobs.hello": { en: "Namaste, {name}", np: "नमस्ते, {name}" },
  "jobs.ridingFor": { en: "Riding for {shop}", np: "{shop} का लागि" },
  "jobs.freelance": { en: "GoPasal rider", np: "गोपसल राइडर" },
  "jobs.status.online": { en: "You're online", np: "तपाईं अनलाइन हुनुहुन्छ" },
  "jobs.status.offline": { en: "You're offline", np: "तपाईं अफलाइन हुनुहुन्छ" },
  "jobs.status.onDelivery": { en: "On a delivery", np: "डेलिभरीमा हुनुहुन्छ" },
  "jobs.status.onlineDetail": { en: "The shop can give you jobs.", np: "पसलले तपाईंलाई काम दिन सक्छ।" },
  "jobs.status.offlineDetail": { en: "Switch on when you're ready to ride.", np: "डेलिभरी गर्न तयार हुँदा खोल्नुहोस्।" },
  "jobs.status.busyDetail": { en: "Finish the jobs in hand before going offline.", np: "अफलाइन हुनुअघि हातको काम सक्नुहोस्।" },
  "jobs.status.a11y": { en: "Available for jobs", np: "कामका लागि उपलब्ध" },
  "jobs.today.delivered": { en: "Delivered today", np: "आज डेलिभर" },
  "jobs.today.cash": { en: "Cash collected today", np: "आज उठेको क्यास" },
  "jobs.inHand": { en: "In hand · {count}", np: "हातमा · {count}" },
  "jobs.empty.online": { en: "Waiting for a job", np: "कामको पर्खाइमा" },
  "jobs.empty.onlineDetail": {
    en: "When the shop gives you an order it appears here, and your phone buzzes.",
    np: "पसलले अर्डर दिएपछि यहाँ देखिन्छ, र फोन बज्छ।",
  },
  "jobs.empty.offline": { en: "You're off for now", np: "अहिले बिदामा हुनुहुन्छ" },
  "jobs.empty.offlineDetail": {
    en: "Go online above and the shop can start giving you jobs.",
    np: "माथि अनलाइन गर्नुहोस्, अनि पसलले काम दिन थाल्छ।",
  },

  /* ── location line ────────────────────────────────────────────────────── */
  "tracking.live": { en: "Sharing your location · ±{metres} m", np: "लोकेसन सेयर हुँदैछ · ±{metres} मि." },
  "tracking.liveNoAccuracy": { en: "Sharing your location", np: "लोकेसन सेयर हुँदैछ" },
  "tracking.waiting": { en: "Finding your location…", np: "लोकेसन खोज्दै…" },
  "tracking.denied": { en: "Location is off — tap to fix", np: "लोकेसन बन्द छ — मिलाउन थिच्नुहोस्" },
  "tracking.needsConsent": { en: "Location not shared yet — tap to set up", np: "लोकेसन सेयर भएको छैन — थिच्नुहोस्" },
  "tracking.off": { en: "Location sharing is off", np: "लोकेसन सेयर बन्द छ" },
  "tracking.service.title": { en: "GoPasal Rider is sharing your location", np: "गोपसल राइडरले लोकेसन सेयर गर्दैछ" },
  "tracking.service.body": {
    en: "Only while you have a delivery in hand.",
    np: "हातमा डेलिभरी हुँदा मात्र।",
  },

  /* ── stages ───────────────────────────────────────────────────────────── */
  "stage.toShop": { en: "Pick up", np: "पिकअप" },
  "stage.toCustomer": { en: "Deliver", np: "डेलिभर" },
  "stage.mustReturn": { en: "Bring back", np: "फिर्ता ल्याउनुहोस्" },
  "stage.returning": { en: "Returning", np: "फिर्ता हुँदै" },
  "stage.done": { en: "Finished", np: "सकियो" },

  /* ── a job ────────────────────────────────────────────────────────────── */
  "job.title": { en: "Order {code}", np: "अर्डर {code}" },
  "job.loading": { en: "Loading the job…", np: "काम लोड हुँदै…" },
  "job.collect": { en: "Collect", np: "उठाउनुहोस्" },
  "job.prepaid": { en: "Paid online", np: "अनलाइन तिरिसकेको" },
  "job.nextStop.shop": { en: "Next stop · shop", np: "अर्को ठाउँ · पसल" },
  "job.nextStop.customer": { en: "Next stop · customer", np: "अर्को ठाउँ · ग्राहक" },
  "job.landmark": { en: "Near {landmark}", np: "{landmark} नजिक" },
  "job.navigate": { en: "Navigate", np: "बाटो हेर्नुहोस्" },
  "job.call": { en: "Call", np: "फोन" },
  "job.callShop": { en: "Call the shop", np: "पसललाई फोन गर्नुहोस्" },
  "job.callCustomer": { en: "Call the customer", np: "ग्राहकलाई फोन गर्नुहोस्" },
  "job.cash.collect": { en: "Collect in cash", np: "क्यास उठाउनुहोस्" },
  "job.cash.prepaid": { en: "Paid online", np: "अनलाइन तिरिसकेको" },
  "job.cash.nothing": { en: "Collect nothing at the door", np: "ढोकामा केही उठाउनु पर्दैन" },
  "job.pickedUpAt": { en: "Picked up at {time}", np: "{time} मा पिकअप" },
  "job.customerNote": { en: "Note from the customer", np: "ग्राहकको नोट" },
  "job.items": { en: "Items · {count}", np: "सामान · {count}" },
  "job.items.check": {
    en: "Check these against the bag before you leave the counter.",
    np: "पसलबाट निस्कनुअघि झोलामा यी सबै छन् कि हेर्नुहोस्।",
  },
  "job.gone.title": { en: "This job isn't in your hands any more", np: "यो काम अब तपाईंको हातमा छैन" },
  "job.gone.detail": {
    en: "It was finished, or the shop gave it to someone else.",
    np: "सकियो, वा पसलले अरूलाई दियो।",
  },
  "job.backToJobs": { en: "Back to jobs", np: "कामको सूचीमा फर्कनुहोस्" },

  /* ── the big button ───────────────────────────────────────────────────── */
  "action.pickUp": { en: "Picked up from the shop", np: "पसलबाट पिकअप गरें" },
  "action.start": { en: "Start the ride", np: "डेलिभरी सुरु गर्नुहोस्" },
  "action.handover": { en: "Hand over", np: "ग्राहकलाई दिनुहोस्" },
  "action.startReturn": { en: "Take it back to the shop", np: "पसलमा फिर्ता लैजानुहोस्" },
  "action.working": { en: "Working…", np: "पर्खनुहोस्…" },

  /* ── handover ─────────────────────────────────────────────────────────── */
  "handover.title": { en: "Hand over the parcel", np: "पार्सल हस्तान्तरण" },
  "handover.detail": {
    en: "The shop sees who took it — it's what they check if the customer says nothing came.",
    np: "कसले लियो पसलले हेर्छ — ग्राहकले पाइनँ भने यही हेरिन्छ।",
  },
  "handover.who": { en: "Who took it?", np: "कसले लियो?" },
  "handover.who.customer": { en: "Handed to the customer", np: "ग्राहकलाई नै दिएँ" },
  "handover.who.family": { en: "Handed to family", np: "परिवारलाई दिएँ" },
  "handover.who.guard": { en: "Left with the guard", np: "गार्डलाई छोडें" },
  "handover.who.neighbour": { en: "Left with a neighbour", np: "छिमेकीलाई छोडें" },
  "handover.who.other": { en: "Something else…", np: "अरू…" },
  "handover.placeholder": { en: "Who took it, and where", np: "कसले लियो, कहाँ" },
  "handover.noteRequired": { en: "Say who took it — a few words is enough.", np: "कसले लियो लेख्नुहोस् — केही शब्द पुग्छ।" },
  "handover.cash.label": { en: "I collected the cash", np: "मैले क्यास उठाएँ" },
  "handover.cash.a11y": { en: "I collected रु {amount} in cash", np: "मैले रु {amount} क्यास उठाएँ" },
  "handover.cash.required": {
    en: "Switch this on once the cash is in your hand.",
    np: "क्यास हातमा आएपछि यो खोल्नुहोस्।",
  },
  "handover.prepaid": { en: "Paid online — nothing to collect.", np: "अनलाइन तिरिसकेको — केही उठाउनु पर्दैन।" },
  "handover.confirm": { en: "Mark delivered", np: "डेलिभर भयो" },

  /* ── problems ─────────────────────────────────────────────────────────── */
  "problem.open": { en: "Report a problem", np: "समस्या जनाउनुहोस्" },
  "problem.title": { en: "What's the problem?", np: "के समस्या भयो?" },
  "problem.detailBefore": {
    en: "The shop is told straight away and can give the order to another rider.",
    np: "पसललाई तुरुन्त थाहा हुन्छ, र अर्को राइडरलाई दिन सक्छ।",
  },
  "problem.detailCarrying": {
    en: "The shop is told straight away. You'll bring the parcel back to them.",
    np: "पसललाई तुरुन्त थाहा हुन्छ। पार्सल पसलमा फिर्ता लैजानुहोस्।",
  },
  "problem.noAnswer": { en: "Customer isn't answering", np: "ग्राहकले फोन उठाएनन्" },
  "problem.wrongAddress": { en: "Can't find the address", np: "ठेगाना भेटिएन" },
  "problem.refused": { en: "Customer refused the order", np: "ग्राहकले अर्डर लिएनन्" },
  "problem.vehicle": { en: "Problem with my vehicle", np: "गाडीमा समस्या" },
  "problem.shopNotReady": { en: "Shop isn't ready", np: "पसल तयार छैन" },
  "problem.tooFar": { en: "Too far for me", np: "मलाई धेरै टाढा भयो" },
  "problem.other": { en: "Something else…", np: "अरू…" },
  "problem.placeholder": { en: "What happened", np: "के भयो" },
  "problem.required": { en: "Say what happened — a few words is enough.", np: "के भयो लेख्नुहोस् — केही शब्द पुग्छ।" },
  "problem.confirm.title": { en: "Stop this delivery?", np: "यो डेलिभरी रोक्ने?" },
  "problem.confirm.before": {
    en: "The job leaves your list and the shop decides what happens next.",
    np: "यो काम तपाईंको सूचीबाट हट्छ, अब के गर्ने पसलले निर्णय गर्छ।",
  },
  "problem.confirm.carrying": {
    en: "The customer is told it won't arrive. You'll take the parcel back to the shop.",
    np: "ग्राहकलाई आउँदैन भनेर भनिन्छ। पार्सल पसलमा फिर्ता लैजानुहोस्।",
  },
  "problem.confirm.go": { en: "Stop delivery", np: "डेलिभरी रोक्नुहोस्" },

  /* ── returns ──────────────────────────────────────────────────────────── */
  "return.must.title": { en: "This parcel goes back to the shop", np: "यो पार्सल पसलमा फिर्ता जान्छ" },
  "return.must.detail": {
    en: "Start the return when you set off, and hand everything back at {shop}.",
    np: "हिँड्दा फिर्ता सुरु गर्नुहोस्, र {shop} मा सबै फिर्ता दिनुहोस्।",
  },
  "return.onWay.title": { en: "Taking it back", np: "फिर्ता लैजाँदै" },
  "return.onWay.detail": {
    en: "Hand the parcel to {shop}. They confirm it's back, and the job closes.",
    np: "पार्सल {shop} लाई दिनुहोस्। उहाँहरूले पुष्टि गरेपछि काम सकिन्छ।",
  },
  "return.reason": { en: "Reason: {reason}", np: "कारण: {reason}" },
  "return.waitShop": {
    en: "Waiting for the shop to confirm the parcel is back.",
    np: "पार्सल फिर्ता आयो भनी पसलले पुष्टि गर्न बाँकी।",
  },
  "return.confirm.title": { en: "Head back to the shop?", np: "पसलतिर फर्कने?" },
  "return.confirm.detail": {
    en: "{shop} is told you're bringing it back.",
    np: "तपाईं फिर्ता ल्याउँदै हुनुहुन्छ भनेर {shop} लाई थाहा हुन्छ।",
  },
  "return.confirm.go": { en: "Start the return", np: "फिर्ता सुरु गर्नुहोस्" },

  /* ── finished ─────────────────────────────────────────────────────────── */
  "done.delivered.title": { en: "Delivered", np: "डेलिभर भयो" },
  "done.delivered.cash": { en: "Hand this cash to the shop at the end of your shift.", np: "सिफ्ट सकिएपछि यो क्यास पसललाई बुझाउनुहोस्।" },
  "done.delivered.prepaid": { en: "Paid online — nothing to hand back.", np: "अनलाइन तिरिसकेको — बुझाउनु केही छैन।" },
  "done.ended.title": { en: "Delivery stopped", np: "डेलिभरी रोकियो" },
  "done.ended.detail": { en: "The shop has been told.", np: "पसललाई जानकारी दिइयो।" },

  /* ── doorstep photo ───────────────────────────────────────────────────── */
  "proof.title": { en: "Doorstep photo", np: "ढोकाको फोटो" },
  "proof.attached": { en: "Photo attached", np: "फोटो राखियो" },
  "proof.detail": {
    en: "Optional. Only the shop can see it.",
    np: "चाहे मात्र। पसलले मात्र हेर्न सक्छ।",
  },
  "proof.take": { en: "Take a photo", np: "फोटो खिच्नुहोस्" },
  "proof.retake": { en: "Take another", np: "अर्को खिच्नुहोस्" },
  "proof.cameraDenied": {
    en: "The camera is off for GoPasal Rider. Turn it on in Settings.",
    np: "गोपसल राइडरका लागि क्यामेरा बन्द छ। सेटिङमा खोल्नुहोस्।",
  },

  /* ── history ──────────────────────────────────────────────────────────── */
  "history.title": { en: "History", np: "इतिहास" },
  "history.today.cash": { en: "Cash collected today", np: "आज उठेको क्यास" },
  "history.today.jobs": { en: "Delivered", np: "डेलिभर" },
  "history.today.settle": {
    en: "Hand this to the shop at the end of your shift.",
    np: "सिफ्ट सकिएपछि यो पसललाई बुझाउनुहोस्।",
  },
  "history.day.today": { en: "Today", np: "आज" },
  "history.day.yesterday": { en: "Yesterday", np: "हिजो" },
  "history.cash": { en: "cash", np: "क्यास" },
  "history.prepaid": { en: "Prepaid", np: "अनलाइन" },
  "history.returned": { en: "Returned to shop", np: "पसलमा फिर्ता" },
  "history.failed": { en: "Not delivered", np: "डेलिभर भएन" },
  "history.empty": { en: "Nothing here yet", np: "अझै केही छैन" },
  "history.emptyDetail": { en: "Finished jobs show up here.", np: "सकिएका काम यहाँ देखिन्छन्।" },
  "history.error": { en: "Couldn't load your history.", np: "इतिहास लोड भएन।" },

  /* ── me ───────────────────────────────────────────────────────────────── */
  "profile.title": { en: "Me", np: "म" },
  "profile.noName": { en: "Rider", np: "राइडर" },
  "profile.shop": { en: "Riding for", np: "काम गर्ने पसल" },
  "profile.vehicle": { en: "Vehicle", np: "सवारी" },
  "profile.vehicleNote": {
    en: "Your shop sets these. Ask them if something's wrong.",
    np: "यी पसलले मिलाउँछ। केही गलत भए पसललाई भन्नुहोस्।",
  },
  "profile.location": { en: "Location sharing", np: "लोकेसन सेयर" },
  "profile.location.live": { en: "On — the shop can see you", np: "खुला — पसलले देख्छ" },
  "profile.location.denied": { en: "Off in phone settings — tap to open", np: "फोन सेटिङमा बन्द — खोल्न थिच्नुहोस्" },
  "profile.location.needsConsent": { en: "Not set up — tap to set up", np: "मिलाइएको छैन — थिच्नुहोस्" },
  "profile.location.off": { en: "Only while you're online", np: "अनलाइन हुँदा मात्र" },
  "profile.signOut": { en: "Sign out", np: "साइन आउट" },
  "profile.signOut.busy": {
    en: "Finish the jobs in hand before signing out.",
    np: "साइन आउट गर्नुअघि हातको काम सक्नुहोस्।",
  },
  "profile.signOut.confirm": { en: "Sign out of GoPasal Rider?", np: "गोपसल राइडरबाट साइन आउट गर्ने?" },
  "profile.signOut.detail": {
    en: "You'll go offline, and the shop can't give you jobs until you sign back in.",
    np: "तपाईं अफलाइन हुनुहुन्छ, फेरि साइन इन नगरेसम्म पसलले काम दिन सक्दैन।",
  },
  "profile.version": { en: "GoPasal Rider {version}", np: "गोपसल राइडर {version}" },

  "vehicle.BICYCLE": { en: "Bicycle", np: "साइकल" },
  "vehicle.MOTORBIKE": { en: "Motorbike", np: "मोटरसाइकल" },
  "vehicle.SCOOTER": { en: "Scooter", np: "स्कुटर" },
  "vehicle.WALK": { en: "On foot", np: "पैदल" },
  "vehicle.VAN": { en: "Van", np: "भ्यान" },

  /* ── location disclosure ──────────────────────────────────────────────── */
  "consent.title": { en: "Share your location while you ride", np: "डेलिभरी गर्दा लोकेसन सेयर गर्नुहोस्" },
  "consent.lead": {
    en: "So the shop knows who's nearest, and the customer can see you coming.",
    np: "नजिक को छ भनेर पसलले थाहा पाओस्, र ग्राहकले तपाईं आउँदै गरेको देखून्।",
  },
  "consent.what.title": { en: "What's shared", np: "के सेयर हुन्छ" },
  "consent.what.body": {
    en: "Your phone's GPS position, direction and speed — nothing else from your phone.",
    np: "फोनको GPS लोकेसन, दिशा र गति — फोनको अरू केही होइन।",
  },
  "consent.who.title": { en: "Who sees it", np: "कसले देख्छ" },
  "consent.who.body": {
    en: "Your shop. A customer sees it only while you're carrying their order.",
    np: "तपाईंको पसल। ग्राहकले आफ्नो अर्डर बोक्दा मात्र देख्छन्।",
  },
  "consent.when.title": { en: "When", np: "कहिले" },
  "consent.when.body": {
    en: "While you're online, and — with the app closed or the screen off — only while a delivery is in hand. A notification shows whenever it's on.",
    np: "अनलाइन हुँदा, र — एप बन्द वा स्क्रिन बन्द हुँदा — हातमा डेलिभरी हुँदा मात्र। खुला हुँदा सधैं सूचना देखिन्छ।",
  },
  "consent.stop.title": { en: "How to stop it", np: "कसरी रोक्ने" },
  "consent.stop.body": {
    en: "Go offline. Sharing stops at once, and you can turn location off in your phone's settings at any time.",
    np: "अफलाइन गर्नुहोस्। सेयर तुरुन्त रोकिन्छ, र फोनको सेटिङबाट जुनसुकै बेला लोकेसन बन्द गर्न सकिन्छ।",
  },
  "consent.android": {
    en: "Your phone will ask twice. Choose \"While using the app\", then \"Allow all the time\" so deliveries keep updating with the screen off.",
    np: "फोनले दुई पटक सोध्छ। पहिले \"While using the app\", अनि \"Allow all the time\" छान्नुहोस्, ताकि स्क्रिन बन्द हुँदा पनि डेलिभरी अपडेट भइरहोस्।",
  },
  "consent.ios": {
    en: "Your phone will ask twice. Choose \"Allow While Using App\", then \"Change to Always Allow\".",
    np: "फोनले दुई पटक सोध्छ। \"Allow While Using App\", अनि \"Change to Always Allow\" छान्नुहोस्।",
  },
  "consent.agree": { en: "Turn on location", np: "लोकेसन खोल्नुहोस्" },
  "consent.recheck": { en: "Check location again", np: "लोकेसन फेरि जाँच्नुहोस्" },
  "consent.notNow": { en: "Not now", np: "अहिले होइन" },
  "consent.denied.title": { en: "Location is turned off", np: "लोकेसन बन्द छ" },
  "consent.denied.body": {
    en: "Without it the shop can't give you jobs. Allow location for GoPasal Rider in Settings, then come back.",
    np: "यो बिना पसलले काम दिन सक्दैन। सेटिङमा गोपसल राइडरलाई लोकेसन दिनुहोस्, अनि फर्कनुहोस्।",
  },
  "consent.openSettings": { en: "Open Settings", np: "सेटिङ खोल्नुहोस्" },
};

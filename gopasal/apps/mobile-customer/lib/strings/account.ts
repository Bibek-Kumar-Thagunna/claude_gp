import type { Dictionary } from "@gopasal/native-ui";

/** Strings for the account screens. See ./core.ts for the house rules. */
export const account: Dictionary = {
  /* ── address book ────────────────────────────────────────────────────── */
  "address.title": { en: "Your addresses", np: "तपाईंका ठेगानाहरू" },
  "address.add": { en: "Add an address", np: "ठेगाना थप्नुहोस्" },
  "address.untitled": { en: "Address", np: "ठेगाना" },
  "address.default": { en: "DEFAULT", np: "मुख्य" },
  "address.makeDefault": { en: "Make default", np: "मुख्य बनाउनुहोस्" },
  "address.delete": { en: "Delete", np: "मेट्नुहोस्" },
  "address.keep": { en: "Keep", np: "राख्ने" },
  "address.myAddress": { en: "My address", np: "मेरो ठेगाना" },
  "address.signInTitle": { en: "Sign in to save an address", np: "ठेगाना राख्न साइन इन गर्नुहोस्" },
  "address.noPin": {
    en: "No pin yet — orders can't be delivered here until you add one.",
    np: "म्यापमा पिन छैन — पिन नराखेसम्म यहाँ अर्डर पुर्‍याउन मिल्दैन।",
  },
  "address.deleteConfirm.title": { en: "Delete this address?", np: "यो ठेगाना मेट्ने?" },

  "address.empty.title": { en: "No addresses yet", np: "अहिलेसम्म ठेगाना छैन" },
  "address.empty.detail": {
    en: "Add one and we'll show the shops that actually deliver there — and the rider will know where to knock.",
    np: "एउटा थप्नुहोस् — त्यहाँ साँच्चै पुर्‍याउने पसलहरू देखाउँछौं, र राइडरले कहाँ ढोका ढक्ढक्याउने थाहा पाउँछ।",
  },

  /* ── the form ────────────────────────────────────────────────────────── */
  "address.form.new": { en: "New address", np: "नयाँ ठेगाना" },
  "address.form.edit": { en: "Edit address", np: "ठेगाना सम्पादन" },
  "address.saveNew": { en: "Save address", np: "ठेगाना सुरक्षित गर्नुहोस्" },
  "address.saveChanges": { en: "Save changes", np: "परिवर्तन सुरक्षित गर्नुहोस्" },

  "address.useLocation": { en: "Use my current location", np: "अहिलेको लोकेसन प्रयोग गर्नुहोस्" },
  "address.locating": { en: "Getting your location…", np: "लोकेसन खोज्दै…" },
  "address.pinned": { en: "Location pinned", np: "पिन राखियो" },
  "address.required": { en: "REQUIRED", np: "अनिवार्य" },
  "address.pinHint": {
    en: "Stand at the gate and tap — this is what the rider follows.",
    np: "गेटमा उभिएर थिच्नुहोस् — राइडरले यही पछ्याउँछ।",
  },

  "address.searchInstead": {
    en: "Somewhere else? Search for a place",
    np: "अर्कै ठाउँ? ठाउँ खोज्नुहोस्",
  },
  "address.search.placeholder": {
    en: "Area, landmark or building",
    np: "क्षेत्र, चिनारी ठाउँ वा भवन",
  },
  "address.search.keepTyping": {
    en: "Keep typing — three letters at least.",
    np: "अझै लेख्नुहोस् — कम्तीमा तीन अक्षर।",
  },
  "address.search.unavailable": {
    en: "Search is unavailable right now — the GPS pin still works.",
    np: "खोजी अहिले उपलब्ध छैन — जीपीएस पिन भने चल्छ।",
  },
  "address.search.none": {
    en: "Nothing found. Stand at the door and use the GPS pin instead — it is what the rider follows anyway.",
    np: "केही भेटिएन। ढोकामा उभिएर जीपीएस पिन प्रयोग गर्नुहोस् — राइडरले जे भए पनि त्यही पछ्याउँछ।",
  },

  "address.field.label": { en: "Label", np: "लेबल" },
  "address.label.home": { en: "Home", np: "घर" },
  "address.label.work": { en: "Work", np: "अफिस" },
  "address.label.other": { en: "Other", np: "अन्य" },
  "address.field.recipient": { en: "Who receives it", np: "कसले बुझ्ने" },
  "address.field.recipient.placeholder": {
    en: "Name the rider should ask for",
    np: "राइडरले सोध्ने नाम",
  },
  "address.field.phone": { en: "Contact number", np: "सम्पर्क नम्बर" },
  "address.field.area": { en: "Area", np: "क्षेत्र" },
  "address.field.area.placeholder": { en: "Baneshwor, Kathmandu", np: "बानेश्वर, काठमाडौं" },
  "address.field.full": { en: "Full address", np: "पूरा ठेगाना" },
  "address.field.full.placeholder": {
    en: "House number, street, floor",
    np: "घर नम्बर, बाटो, तल्ला",
  },
  "address.field.full.hint": {
    en: "Write it the way you would tell a friend — that is what the rider reads.",
    np: "साथीलाई भनेजसरी लेख्नुहोस् — राइडरले त्यही पढ्छ।",
  },
  "address.field.landmark": { en: "Landmark (optional)", np: "चिनारी ठाउँ (वैकल्पिक)" },
  "address.field.landmark.placeholder": {
    en: "Behind the Himalayan bakery",
    np: "हिमालयन बेकरीको पछाडि",
  },

  /* ── what goes wrong ─────────────────────────────────────────────────── */
  "address.error.pinPlace": {
    en: "Couldn't pin that place. Try the GPS button, or type the address yourself.",
    np: "त्यो ठाउँ पिन गर्न सकिएन। जीपीएस बटन प्रयोग गर्नुहोस्, वा ठेगाना आफैँ लेख्नुहोस्।",
  },
  "address.error.permission": {
    en: "Location permission is off, and an order can't be delivered without a pin. Turn it on for GoPasal in your phone's settings, then tap this again.",
    np: "लोकेसनको अनुमति बन्द छ, र पिन बिना अर्डर पुर्‍याउन मिल्दैन। फोनको सेटिङमा गोपसललाई अनुमति दिएर फेरि यहाँ थिच्नुहोस्।",
  },
  "address.error.fix": {
    en: "Couldn't get a location fix. Try again outdoors, or type the address instead.",
    np: "लोकेसन भेटिएन। बाहिर निस्केर फेरि प्रयास गर्नुहोस्, वा ठेगाना लेख्नुहोस्।",
  },
  "address.error.name": { en: "Who should the rider ask for?", np: "राइडरले कसलाई सोध्ने?" },
  "address.error.phone": { en: "A contact number is needed.", np: "सम्पर्क नम्बर चाहिन्छ।" },
  "address.error.area": { en: "Which area is this in?", np: "यो कुन क्षेत्रमा पर्छ?" },
  "address.error.full": {
    en: "Add the full address, in your own words.",
    np: "पूरा ठेगाना आफ्नै शब्दमा लेख्नुहोस्।",
  },
  "address.error.pinRequired": {
    en: "A location pin is needed before this address can be ordered to. Tap 'Use my current location' above — it takes a second and it is what the rider follows.",
    np: "यो ठेगानामा अर्डर पुर्‍याउन म्यापमा पिन चाहिन्छ। माथिको 'अहिलेको लोकेसन प्रयोग गर्नुहोस्' थिच्नुहोस् — एक छिन लाग्छ, र राइडरले त्यही पछ्याउँछ।",
  },
  "address.error.save": {
    en: "Couldn't save that address.",
    np: "त्यो ठेगाना सुरक्षित गर्न सकिएन।",
  },

  /* ── spoken aloud ────────────────────────────────────────────────────── */
  "address.a11y.edit": { en: "Edit {label}", np: "{label} सम्पादन गर्नुहोस्" },
  "address.a11y.makeDefault": {
    en: "Make {label} the default address",
    np: "{label} लाई मुख्य ठेगाना बनाउनुहोस्",
  },
  "address.a11y.delete": { en: "Delete {label}", np: "{label} मेट्नुहोस्" },
  "address.a11y.deliverTo": {
    en: "Deliver to {label}, {address}",
    np: "{label} मा पुर्‍याउनुहोस्, {address}",
  },
  "address.a11y.searchInstead": { en: "Search for a place instead", np: "बरु ठाउँ खोज्नुहोस्" },
  "address.a11y.search": { en: "Search for a place", np: "ठाउँ खोज्नुहोस्" },
  "address.a11y.stopSearch": { en: "Stop searching", np: "खोजी बन्द गर्नुहोस्" },
  "address.a11y.usePlace": { en: "Use {name}", np: "{name} छान्नुहोस्" },
  "address.a11y.chooseLabel": {
    en: "Label this address {label}",
    np: "यो ठेगानालाई {label} लेबल दिनुहोस्",
  },

  /* ── profile ─────────────────────────────────────────────────────────── */
  "profile.title": { en: "Your profile", np: "तपाईंको प्रोफाइल" },
  "profile.name": { en: "Name", np: "नाम" },
  "profile.name.placeholder": { en: "Your name", np: "तपाईंको नाम" },
  "profile.email": { en: "Email (optional)", np: "इमेल (वैकल्पिक)" },
  "profile.emailShort": { en: "Email", np: "इमेल" },
  "profile.phone": { en: "Phone", np: "फोन" },
  "profile.verified": { en: "VERIFIED", np: "प्रमाणित" },
  "profile.phone.note": {
    en: "Your number is your account — orders, coins and messages all hang off it, so it can't be swapped here.",
    np: "तपाईंको नम्बर नै तपाईंको खाता हो — अर्डर, कोइन र सन्देश सबै यसैमा जोडिएका छन्, त्यसैले यहाँबाट साट्न मिल्दैन।",
  },
  "profile.saved": { en: "Saved", np: "सुरक्षित भयो" },
  "profile.saveChanges": { en: "Save changes", np: "परिवर्तन सुरक्षित गर्नुहोस्" },
  "profile.error.name": {
    en: "A name helps the rider find you.",
    np: "नाम भए राइडरले तपाईंलाई सजिलै भेट्छ।",
  },
  "profile.error.save": { en: "Couldn't save that.", np: "सुरक्षित गर्न सकिएन।" },

  /* ── your data, and the end of the account ───────────────────────────────
     Every warning below is load-bearing. The Nepali says "cannot be brought
     back" where the English says "cannot be undone", and names the same things
     as going, because a confirmation that is gentler in one language than the
     other is not a translation, it is a trap.                               */
  "privacy.yourNumber": { en: "your number", np: "तपाईंको नम्बर" },

  "privacy.export.title": { en: "Take a copy", np: "प्रतिलिपि लिनुहोस्" },
  "privacy.export.detail": {
    en: "Everything GoPasal holds on {phone} — your profile, addresses, orders, reviews and messages — as one file you can keep.",
    np: "{phone} मा गोपसलसँग भएको सबै — तपाईंको प्रोफाइल, ठेगाना, अर्डर, समीक्षा र सन्देश — एउटै फाइलमा, तपाईंले राख्न सक्ने गरी।",
  },
  "privacy.export.download": { en: "Download my data", np: "मेरो डाटा डाउनलोड गर्नुहोस्" },
  "privacy.export.preparing": { en: "Preparing…", np: "तयार पार्दै…" },
  "privacy.export.shareTitle": { en: "My GoPasal data", np: "मेरो गोपसल डाटा" },

  "privacy.delete.title": { en: "Close this account", np: "यो खाता बन्द गर्नुहोस्" },
  "privacy.delete.detail": {
    en: "Your profile, addresses and saved lists go. Records the law requires us to keep — completed orders, payments, resolved disputes — are held for their retention period and then deleted.",
    np: "तपाईंको प्रोफाइल, ठेगाना र सुरक्षित सूचीहरू मेटिन्छन्। कानूनले राख्नै पर्ने अभिलेख — सम्पन्न भएका अर्डर, भुक्तानी, टुंगिएका उजुरी — तोकिएको अवधिसम्म राखिन्छ, त्यसपछि मेटिन्छ।",
  },
  "privacy.delete.start": {
    en: "Start account deletion",
    np: "खाता मेट्ने प्रक्रिया सुरु गर्नुहोस्",
  },
  "privacy.delete.blocked": {
    en: "Not yet — a few things are still open",
    np: "अहिले होइन — केही कुरा अझै बाँकी छन्",
  },
  "privacy.delete.retained": { en: "Kept after deletion:", np: "मेटिएपछि पनि राखिने:" },
  "privacy.delete.action": { en: "Delete my account", np: "मेरो खाता मेट्नुहोस्" },
  "privacy.delete.deleting": { en: "Deleting…", np: "मेटिँदै…" },

  "privacy.code.send": { en: "Send me a code", np: "मलाई कोड पठाउनुहोस्" },
  "privacy.code.sending": { en: "Sending…", np: "पठाउँदै…" },
  "privacy.code.sentTo": { en: "Code sent to {phone}", np: "{phone} मा कोड पठाइयो" },
  "privacy.code.label": { en: "The 6-digit code", np: "6 अंकको कोड" },

  "privacy.confirm.label": { en: "Type {phrase}", np: "{phrase} लेख्नुहोस्" },
  "privacy.reason.label": {
    en: "Why are you leaving? (optional)",
    np: "किन जाँदै हुनुहुन्छ? (वैकल्पिक)",
  },
  "privacy.reason.placeholder": {
    en: "It helps us fix it",
    np: "यसले हामीलाई सुधार्न मद्दत गर्छ",
  },

  "privacy.confirm.title": { en: "Delete your account?", np: "तपाईंको खाता मेट्ने?" },
  "privacy.confirm.message": {
    en: "This cannot be undone.",
    np: "एकपटक मेटिएपछि फेरि फर्काउन मिल्दैन।",
  },
  "privacy.confirm.yes": { en: "Delete", np: "मेट्नुहोस्" },
  "privacy.confirm.no": { en: "Keep my account", np: "मेरो खाता राख्ने" },

  "privacy.error.export": {
    en: "Couldn't prepare your data just now.",
    np: "अहिले तपाईंको डाटा तयार पार्न सकिएन।",
  },
  "privacy.error.sendCode": {
    en: "Couldn't send the code. Check the blockers above.",
    np: "कोड पठाउन सकिएन। माथि बाँकी रहेका कुराहरू हेर्नुहोस्।",
  },
  "privacy.error.typeExactly": {
    en: "Type {phrase} exactly to confirm.",
    np: "पक्का गर्न {phrase} जस्ताको तस्तै लेख्नुहोस्।",
  },
  "privacy.error.confirm": {
    en: "That didn't work. Check the code.",
    np: "भएन। कोड फेरि हेर्नुहोस्।",
  },
};

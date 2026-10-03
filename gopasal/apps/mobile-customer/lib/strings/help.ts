import type { Dictionary } from "@gopasal/native-ui";

/** Strings for the help screens. See ./core.ts for the house rules. */
export const help: Dictionary = {
  /* ── GoCoins and referrals ───────────────────────────────────────────── */
  "rewards.title": { en: "GoCoins", np: "गोकोइन" },
  "rewards.signIn": {
    en: "Sign in to see your GoCoins",
    np: "आफ्नो गोकोइन हेर्न साइन इन गर्नुहोस्",
  },
  "rewards.balance": { en: "YOUR BALANCE", np: "तपाईंको ब्यालेन्स" },
  "rewards.worth": {
    en: "Worth रु {amount} off your next order",
    np: "अर्को अर्डरमा रु {amount} छुट बराबर",
  },
  "rewards.earnRate": {
    en: "Earn coins on every delivered order — {rate} coins = रु 1",
    np: "हरेक पुगेको अर्डरमा कोइन कमाउनुहोस् — {rate} कोइन = रु 1",
  },
  "rewards.nextTier": { en: "{points} to {name}", np: "{name} पुग्न {points}" },
  "rewards.redeemNote": {
    en: "Coins are redeemed at checkout, where the discount is calculated and confirmed by the server. There is a cap per order, so a large balance is spent across several.",
    np: "कोइन चेकआउटमा प्रयोग हुन्छ, जहाँ छुट गणना भई पक्का हुन्छ। एउटा अर्डरमा प्रयोग गर्न सकिने सीमा हुन्छ, त्यसैले ठूलो ब्यालेन्स धेरै अर्डरमा बाँडिएर खर्च हुन्छ।",
  },

  "rewards.invite.title": { en: "Invite a friend", np: "साथीलाई निम्तो दिनुहोस्" },
  "rewards.invite.qualification": {
    en: "Rewarded after the invited customer receives their first order",
    np: "निम्तो पाउने ग्राहकले पहिलो अर्डर पाएपछि इनाम मिल्छ",
  },
  "tier.Bronze": { en: "Bronze", np: "कांस्य" },
  "tier.Silver": { en: "Silver", np: "रजत" },
  "tier.Gold": { en: "Gold", np: "स्वर्ण" },
  "tier.Platinum": { en: "Platinum", np: "प्लाटिनम" },
  "legal.title.terms": { en: "Terms of Service", np: "सेवाका सर्तहरू" },
  "legal.title.privacy": { en: "Privacy Policy", np: "गोपनीयता नीति" },
  "legal.title.refund": { en: "Refund & Returns Policy", np: "पैसा फिर्ता र सामान फिर्ता नीति" },
  "legal.title.delivery": { en: "Delivery Policy", np: "डेलिभरी नीति" },
  "legal.title.cookies": { en: "Cookie Policy", np: "कुकी नीति" },
  "rewards.friend.title": { en: "Got a code from a friend?", np: "साथीबाट कोड पाउनुभयो?" },
  "rewards.friend.detail": {
    en: "Enter it before your first order. Your coins unlock when that order is delivered.",
    np: "पहिलो अर्डरअघि हाल्नुहोस्। त्यो अर्डर डेलिभरी भएपछि कोइन खुल्छ।",
  },
  "rewards.friend.placeholder": { en: "Friend's code", np: "साथीको कोड" },
  "rewards.friend.submit": { en: "Use this code", np: "यो कोड प्रयोग गर्नुहोस्" },
  "rewards.friend.done": {
    en: "Code added. {coins} coins are waiting for you — they unlock when your first order is delivered.",
    np: "कोड थपियो। {coins} कोइन पर्खिरहेका छन् — पहिलो अर्डर डेलिभरी भएपछि खुल्छन्।",
  },
  "rewards.invite.reward": {
    en: "You both get {coins} coins — about रु {rupees}.",
    np: "दुवैजनाले {coins} कोइन पाउनुहुन्छ — करिब रु {rupees}।",
  },
  "rewards.invite.fallback": {
    en: "Share your code and you both earn coins.",
    np: "आफ्नो कोड सेयर गर्नुहोस्, दुवैजनाले कोइन पाउनुहुन्छ।",
  },
  "rewards.invite.copy.a11y": {
    en: "Copy referral code {code}",
    np: "रेफरल कोड {code} कपी गर्नुहोस्",
  },
  "rewards.copied": { en: "COPIED", np: "कपी भयो" },
  "rewards.copy": { en: "COPY", np: "कपी" },
  "rewards.share": { en: "Share code", np: "कोड सेयर गर्नुहोस्" },
  "rewards.share.message": {
    en: "Order from your neighbourhood shops on GoPasal. Use my code {code} and we both get GoCoins. https://gopasal.com/?ref={code}",
    np: "गोपसलबाट आफ्नै छिमेकका पसलहरूमा अर्डर गर्नुहोस्। मेरो कोड {code} प्रयोग गर्नुहोस्, दुवैले गोकोइन पाउँछौं। https://gopasal.com/?ref={code}",
  },
  "rewards.stats.rewarded": { en: "Rewards unlocked", np: "पाइएका इनाम" },
  "rewards.stats.pending": { en: "Waiting on first delivery", np: "पहिलो डेलिभरी पर्खाइमा" },

  "rewards.activity": { en: "Coin activity", np: "कोइनको हिसाब" },
  "rewards.activity.empty": {
    en: "Nothing yet. Coins land when an order is delivered, not when it is placed — so a cancelled order never leaves coins behind.",
    np: "अहिलेसम्म केही छैन। अर्डर पुगेपछि मात्र कोइन आउँछ, अर्डर गर्दा होइन — त्यसैले रद्द भएको अर्डरले कोइन छाड्दैन।",
  },

  /* ── your reviews ────────────────────────────────────────────────────── */
  "reviews.order": { en: "Order", np: "अर्डर" },
  "reviews.ratingOnly": {
    en: "Rating only — no words.",
    np: "रेटिङ मात्र — केही लेख्नुभएको छैन।",
  },
  "reviews.empty.title": { en: "No reviews yet.", np: "अहिलेसम्म कुनै रिभ्यु छैन।" },
  "reviews.empty.detail": {
    en: "After a delivery you can rate the shop — it is the main thing other customers in your area go on.",
    np: "डेलिभरी भएपछि पसललाई रेटिङ दिन सक्नुहुन्छ — तपाईंको क्षेत्रका अरू ग्राहकले सबैभन्दा बढी यसैलाई हेर्छन्।",
  },

  /* ── notifications ───────────────────────────────────────────────────── */
  "notif.markAll": { en: "Mark all read", np: "सबै पढियो" },
  "notif.markAll.a11y": {
    en: "Mark all as read",
    np: "सबै सूचना पढियो भनी चिन्ह लगाउनुहोस्",
  },
  "notif.signIn": {
    en: "Sign in to see your notifications",
    np: "आफ्ना सूचनाहरू हेर्न साइन इन गर्नुहोस्",
  },
  "notif.empty.title": { en: "Nothing yet", np: "अहिलेसम्म केही छैन" },
  "notif.empty.detail": {
    en: "When a shop accepts an order or a rider picks it up, you'll hear about it here.",
    np: "पसलले अर्डर स्वीकार गर्दा वा राइडरले लिएर जाँदा यहाँ थाहा पाउनुहुनेछ।",
  },
  "notif.time.now": { en: "now", np: "अहिले" },
  "notif.time.minutes": { en: "{count}m ago", np: "{count} मिनेट अघि" },
  "notif.time.hours": { en: "{count}h ago", np: "{count} घण्टा अघि" },
  "notif.time.days": { en: "{count}d ago", np: "{count} दिन अघि" },

  /* ── terms and policies (chrome only — the documents are server text) ── */
  "legal.read.a11y": { en: "Read {title}", np: "{title} पढ्नुहोस्" },
  "legal.version": {
    en: "Version {version} · in force since {date}",
    np: "संस्करण {version} · {date} देखि लागू",
  },
  "legal.operator": {
    en: "GoPasal is operated by Velayon Dynamics Pvt. Ltd., Kathmandu, Nepal.",
    np: "गोपसल Velayon Dynamics Pvt. Ltd., काठमाडौं, नेपालद्वारा सञ्चालित छ।",
  },
  "legal.fallbackTitle": { en: "Policy", np: "नीति" },
  "legal.error": {
    en: "This policy couldn't be loaded. It is also published at gopasal.com/legal.",
    np: "यो नीति लोड हुन सकेन। यो gopasal.com/legal मा पनि प्रकाशित छ।",
  },

  /* ── help and tickets ────────────────────────────────────────────────── */
  "support.title": { en: "Help", np: "सहयोग" },
  "support.error.subject": {
    en: "A short subject helps us route it.",
    np: "छोटो विषय लेख्नुभयो भने सही ठाउँमा पुर्‍याउन सजिलो हुन्छ।",
  },
  "support.error.message": { en: "Tell us what happened.", np: "के भयो भन्नुहोस्।" },
  "support.error.create": { en: "Couldn't open the ticket.", np: "टिकट खोल्न सकिएन।" },

  "support.order.title": { en: "Problem with an order?", np: "अर्डरमा समस्या छ?" },
  "support.order.detail": {
    en: "Message the shop — they are packing it and answer fastest.",
    np: "पसललाई सन्देश पठाउनुहोस् — उहाँहरूले नै प्याक गर्दै हुनुहुन्छ र सबैभन्दा छिटो जवाफ दिनुहुन्छ।",
  },
  "support.order.cta": { en: "Open my orders", np: "मेरा अर्डरहरू खोल्नुहोस्" },

  "support.signIn": { en: "Sign in to open a ticket", np: "टिकट खोल्न साइन इन गर्नुहोस्" },
  "support.form.title": { en: "Tell us what happened", np: "के भयो भन्नुहोस्" },
  "support.form.subject": { en: "Subject", np: "विषय" },
  "support.form.subject.placeholder": { en: "Refund not received", np: "पैसा फिर्ता आएन" },
  "support.form.message": { en: "What happened", np: "के भयो" },
  "support.form.message.placeholder": {
    en: "Order code, what went wrong, and what you'd like us to do.",
    np: "अर्डर कोड, के बिग्रियो, र हामीले के गरिदिनुपर्‍यो।",
  },
  "support.form.submit": { en: "Send to support", np: "सहयोग टोलीलाई पठाउनुहोस्" },
  "support.openTicket": { en: "Open a ticket", np: "टिकट खोल्नुहोस्" },

  "support.tickets": { en: "YOUR TICKETS", np: "तपाईंका टिकटहरू" },
  "support.tickets.empty": {
    en: "None open. If something goes wrong with an order, this is where it lands.",
    np: "कुनै टिकट खुला छैन। अर्डरमा केही बिग्रियो भने यहीँ आउँछ।",
  },
  "support.status.OPEN": { en: "OPEN", np: "खुला" },
  "support.status.CLOSED": { en: "CLOSED", np: "बन्द" },
  "support.status.PENDING": { en: "REPLIED", np: "जवाफ आयो" },
  "support.status.RESOLVED": { en: "RESOLVED", np: "समाधान भयो" },
  "ticket.title": { en: "Ticket", np: "टिकट" },
  "ticket.fromGopasal": { en: "GoPasal support", np: "गोपसल सहयोग" },
  "ticket.placeholder": { en: "Write a reply…", np: "जवाफ लेख्नुहोस्…" },
  "ticket.send": { en: "Send", np: "पठाउनुहोस्" },
  "ticket.takePhoto": { en: "Take a photo", np: "फोटो खिच्नुहोस्" },
  "ticket.choosePhoto": { en: "Attach a photo", np: "फोटो थप्नुहोस्" },
  "ticket.removeFile": { en: "Remove the photo", np: "फोटो हटाउनुहोस्" },
  "ticket.cameraDenied": {
    en: "GoPasal needs camera permission for this. You can turn it on in your phone's settings.",
    np: "यसका लागि गोपसललाई क्यामेरा अनुमति चाहिन्छ। फोनको सेटिङमा खोल्न सकिन्छ।",
  },
  "ticket.libraryDenied": {
    en: "GoPasal needs permission to open your photos.",
    np: "फोटो खोल्न गोपसललाई अनुमति चाहिन्छ।",
  },
  "ticket.showPhoto": { en: "Show the photo", np: "फोटो हेर्नुहोस्" },
  "ticket.loadingPhoto": { en: "Loading…", np: "खुल्दै…" },
  "ticket.photoFailed": { en: "Couldn't load it", np: "खुल्न सकेन" },
  "ticket.close": { en: "Close this ticket", np: "यो टिकट बन्द गर्नुहोस्" },
  "ticket.closeConfirm": { en: "Close this ticket?", np: "यो टिकट बन्द गर्ने?" },
  "ticket.closeDetail": {
    en: "Do this once it's sorted. A closed ticket can't be replied to — open a new one if something else comes up.",
    np: "समस्या मिलेपछि मात्र गर्नुहोस्। बन्द टिकटमा जवाफ दिन मिल्दैन — अरू केही भए नयाँ खोल्नुहोस्।",
  },
  "ticket.closed": { en: "This ticket is closed", np: "यो टिकट बन्द छ" },
  "ticket.closedDetail": {
    en: "Open a new one from Help if you need anything else.",
    np: "अरू केही चाहिए सहयोगबाट नयाँ खोल्नुहोस्।",
  },

  "support.email": {
    en: "Or email hello@gopasal.com",
    np: "वा hello@gopasal.com मा इमेल गर्नुहोस्",
  },
  "support.email.a11y": {
    en: "Email GoPasal support",
    np: "गोपसल सहयोगलाई इमेल गर्नुहोस्",
  },

  /* ── the assistant ───────────────────────────────────────────────────── */
  "support.ai.title": { en: "Ask GoPasal", np: "गोपसललाई सोध्नुहोस्" },
  "support.ai.detail": {
    en: "Answers come from our published policies, with sources.",
    np: "जवाफहरू हाम्रा प्रकाशित नीतिबाट आउँछन्, स्रोतसहित।",
  },
  "support.ai.q.order": { en: "Where is my order?", np: "मेरो अर्डर कहाँ छ?" },
  "support.ai.q.refund": { en: "How do refunds work?", np: "पैसा फिर्ता कसरी हुन्छ?" },
  "support.ai.q.address": { en: "Can I change my address?", np: "के म ठेगाना बदल्न सक्छु?" },
  "support.ai.thinking": { en: "Looking it up…", np: "खोज्दै छु…" },
  "support.ai.placeholder": { en: "Ask a question…", np: "प्रश्न सोध्नुहोस्…" },
  "support.ai.input.a11y": { en: "Ask the assistant", np: "सहायकलाई सोध्नुहोस्" },
  "support.ai.ask": { en: "Ask", np: "सोध्नुहोस्" },
  "support.ai.escalated": {
    en: "Passed to a person — ticket {code}. Your whole conversation went with it.",
    np: "मान्छेकहाँ पुर्‍याइयो — टिकट {code}। तपाईंको सम्पूर्ण कुराकानी पनि सँगै गयो।",
  },
  "support.ai.escalating": { en: "Passing it on…", np: "पुर्‍याउँदै…" },
  "support.ai.escalate": { en: "Talk to a person instead", np: "मान्छेसँग कुरा गर्नुहोस्" },
};

import type { Dictionary } from "@gopasal/native-ui";

/**
 * Every string the customer app says, in English and Nepali.
 *
 * Kept in one file rather than beside each screen, because the thing that
 * matters most about a translation is that it is *consistent*: "cart" must be
 * the same word on the tab, in the shop bar and on the checkout heading, and
 * that is only visible when they sit next to each other.
 *
 * House rules for the Nepali, agreed with the words a Kathmandu shopkeeper
 * actually uses rather than with a dictionary:
 *
 *  - **Borrowed words stay borrowed.** "अर्डर", "कार्ट" and "डेलिभरी" are what
 *    people say; "आदेश" and "गाडा" are what a translation tool says and nobody
 *    else does.
 *  - **Money is रु and the digits stay Western.** Devanagari numerals are
 *    correct and are not what a price tag in Baneshwor looks like.
 *  - **Verbs are polite-plain (मध्यम आदरार्थी)** — "गर्नुहोस्", not the
 *    familiar or the very formal. It is how a shop talks to a customer.
 *  - **Untranslated is better than badly translated.** A key with no `np` falls
 *    back to English, which is honest; an invented word is not.
 */
export const core: Dictionary = {
  "intro.tagline": { en: "Your neighbourhood shops, delivered", np: "छिमेकका पसल, सिधै घरमा" },
  /* ── tabs and chrome ─────────────────────────────────────────────────── */
  "tab.home": { en: "Home", np: "होम" },
  "tab.messages": { en: "Chats", np: "कुराकानी" },
  "tab.cart": { en: "Cart", np: "कार्ट" },
  "tab.orders": { en: "Orders", np: "अर्डरहरू" },
  "tab.account": { en: "Account", np: "खाता" },

  "net.offline.title": { en: "No internet", np: "इन्टरनेट छैन" },
  "net.offline.detail": {
    en: "You can still browse what's already loaded.",
    np: "लोड भइसकेको सामग्री हेर्न सक्नुहुन्छ।",
  },
  "net.unreachable.title": { en: "GoPasal isn't responding", np: "गोपसल जवाफ दिइरहेको छैन" },
  "net.unreachable.detail": {
    en: "Your connection looks fine — we're retrying.",
    np: "तपाईंको इन्टरनेट ठीक छ — हामी फेरि प्रयास गर्दैछौं।",
  },
  "net.slow.title": { en: "Slow connection", np: "इन्टरनेट सुस्त छ" },
  "net.slow.detail": {
    en: "Things may take a little longer than usual.",
    np: "सामान्यभन्दा अलि ढिलो हुन सक्छ।",
  },
  "net.retry": { en: "Retry", np: "फेरि" },
  "net.a11y.retry": { en: "Retry connection", np: "जडान फेरि प्रयास गर्नुहोस्" },

  /* ── design-system chrome ────────────────────────────────────────────── */
  "ui.loading": { en: "Loading", np: "लोड हुँदै" },
  "ui.yourRider": { en: "Your rider", np: "तपाईंको राइडर" },

  /* ── home ────────────────────────────────────────────────────────────── */
  "home.greeting": { en: "Namaste", np: "नमस्ते" },
  "home.deliverTo": { en: "Deliver to", np: "यहाँ पुर्‍याउने" },
  "home.search": { en: "Search shops and items", np: "पसल र सामान खोज्नुहोस्" },
  "home.categories": { en: "What do you need?", np: "के चाहियो?" },
  "home.nearby": { en: "Shops near you", np: "नजिकका पसलहरू" },
  "home.offers": { en: "Offers today", np: "आजका अफरहरू" },
  "home.browseShops": { en: "Browse shops", np: "पसलहरू हेर्नुहोस्" },
  "home.seeAll": { en: "See all", np: "सबै हेर्नुहोस्" },
  "home.coins": { en: "{count} GoCoins", np: "{count} गोकोइन" },

  /* ── shop and products ───────────────────────────────────────────────── */
  "shop.open": { en: "Open now", np: "अहिले खुला" },
  "shop.closed": { en: "Closed", np: "बन्द" },
  "shop.newShop": { en: "New shop", np: "नयाँ पसल" },
  "shop.minOrder": { en: "Min रु {amount}", np: "न्यूनतम रु {amount}" },
  "shop.cod": { en: "Cash on delivery", np: "सामान बुझेपछि नगद" },
  "shop.message": { en: "Message shop", np: "पसललाई सन्देश" },
  "shop.call": { en: "Call", np: "फोन" },
  "shop.groupOrder": { en: "Order together with others", np: "मिलेर अर्डर गर्नुहोस्" },
  "shop.shelf": { en: "On the shelf", np: "पसलमा उपलब्ध" },
  "shop.empty": { en: "Nothing on the shelf right now.", np: "अहिले केही पनि छैन।" },

  "product.add": { en: "ADD", np: "थप्नुहोस्" },
  "product.choose": { en: "CHOOSE", np: "छान्नुहोस्" },
  "product.addMore": { en: "ADD MORE", np: "थप थप्नुहोस्" },
  "product.soldOut": { en: "Sold out", np: "सकियो" },
  "product.save": { en: "Save रु {amount}", np: "रु {amount} बचत" },
  "product.sizes": { en: "{count} sizes", np: "{count} साइज" },
  "product.from": { en: "from", np: "देखि" },
  "product.onlyLeft": { en: "Only {count} left", np: "जम्मा {count} बाँकी" },
  "product.addToCart": { en: "Add to cart", np: "कार्टमा थप्नुहोस्" },
  "product.about": { en: "About this", np: "यसबारे" },
  "product.noPhoto": { en: "No photo from the shop yet", np: "पसलले फोटो राखेको छैन" },

  /* ── cart and checkout ───────────────────────────────────────────────── */
  "cart.title": { en: "Your cart", np: "तपाईंको कार्ट" },
  "cart.from": { en: "From {shop}", np: "{shop} बाट" },
  "cart.clear": { en: "Clear", np: "खाली गर्नुहोस्" },
  "cart.empty.title": { en: "Your cart is empty", np: "कार्ट खाली छ" },
  "cart.empty.detail": {
    en: "Add something from a shop near you.",
    np: "नजिकको पसलबाट केही थप्नुहोस्।",
  },
  "cart.items": { en: "Items ({count})", np: "सामान ({count})" },
  "cart.estimated": { en: "Estimated", np: "अनुमानित" },
  "cart.checkout": { en: "Choose address & pay", np: "ठेगाना छानेर भुक्तानी" },
  "cart.deliveryNote": {
    en: "Delivery and any discount are calculated at checkout, where the total is confirmed by the server.",
    np: "डेलिभरी शुल्क र छुट चेकआउटमा गणना हुन्छ, जहाँ कुल रकम पक्का हुन्छ।",
  },

  "checkout.title": { en: "Checkout", np: "चेकआउट" },
  "checkout.address": { en: "Delivery address", np: "डेलिभरी ठेगाना" },
  "checkout.payment": { en: "How you'll pay", np: "भुक्तानी कसरी" },
  "checkout.coupon": { en: "Coupon", np: "कुपन" },
  "checkout.apply": { en: "Apply", np: "लागू गर्नुहोस्" },
  "checkout.note": { en: "Note for the shop", np: "पसललाई सन्देश" },
  "checkout.useCoins": { en: "Use my GoCoins", np: "गोकोइन प्रयोग गर्ने" },
  "checkout.place": { en: "Place order", np: "अर्डर गर्नुहोस्" },
  "checkout.total": { en: "Total", np: "कुल" },
  "checkout.delivery": { en: "Delivery", np: "डेलिभरी" },
  "checkout.discount": { en: "Discount", np: "छुट" },

  /* ── orders and tracking ─────────────────────────────────────────────── */
  "orders.title": { en: "Orders", np: "अर्डरहरू" },
  "orders.empty.title": { en: "No orders yet", np: "अहिलेसम्म अर्डर छैन" },
  "orders.empty.detail": {
    en: "When you order, it shows up here with live tracking.",
    np: "अर्डर गरेपछि यहाँ देखिन्छ, र कहाँ पुग्यो पनि हेर्न सकिन्छ।",
  },

  "status.PLACED": { en: "Placed", np: "अर्डर भयो" },
  "status.ACCEPTED": { en: "Accepted", np: "स्वीकार भयो" },
  "status.PACKED": { en: "Packed", np: "प्याक भयो" },
  "status.OUT_FOR_DELIVERY": { en: "On the way", np: "बाटोमा" },
  "status.DELIVERED": { en: "Delivered", np: "पुग्यो" },
  "status.CANCELLED": { en: "Cancelled", np: "रद्द भयो" },
  "status.REJECTED": { en: "Rejected", np: "अस्वीकार भयो" },

  "track.progress": { en: "Progress", np: "प्रगति" },
  "track.waitingShop": { en: "Waiting for the shop to accept", np: "पसलले स्वीकार गर्न बाँकी" },
  "track.riderHasIt": { en: "A rider has it", np: "राइडरले लिएर गयो" },
  "track.movingLive": { en: "moving live", np: "अहिले हिँडिरहेको" },
  "track.updating": { en: "position updating", np: "स्थान अपडेट हुँदै" },
  "track.stale": { en: "Last position is a little old", np: "अन्तिम स्थान अलि पुरानो हो" },
  "track.toGo": { en: "{distance} to go", np: "{distance} बाँकी" },
  "track.deliveringTo": { en: "Delivering to", np: "यहाँ पुर्‍याउँदै" },
  "track.callRider": { en: "Call the rider", np: "राइडरलाई फोन" },
  "track.cancel": { en: "Cancel this order", np: "अर्डर रद्द गर्नुहोस्" },

  /* ── account ─────────────────────────────────────────────────────────── */
  "account.title": { en: "Account", np: "खाता" },
  "account.addName": { en: "Add your name", np: "आफ्नो नाम राख्नुहोस्" },
  "account.edit": { en: "Edit", np: "सम्पादन" },
  "account.addresses": { en: "Delivery addresses", np: "डेलिभरी ठेगानाहरू" },
  "account.addresses.detail": { en: "Where your orders go", np: "अर्डर कहाँ पुग्ने" },
  "account.saved": { en: "Saved", np: "सुरक्षित" },
  "account.saved.detail": { en: "Shops and products you kept", np: "तपाईंले राख्नुभएका पसल र सामान" },
  "account.messages": { en: "Messages", np: "सन्देशहरू" },
  "account.messages.detail": { en: "Your conversations with shops", np: "पसलसँगका कुराकानी" },
  "account.notifications": { en: "Notifications", np: "सूचनाहरू" },
  "account.group": { en: "Order together", np: "मिलेर अर्डर" },
  "account.group.detail": { en: "Group orders you host or joined", np: "तपाईंका समूह अर्डरहरू" },
  "account.help": { en: "Help & support", np: "सहयोग" },
  "account.help.detail": {
    en: "Order problems, refunds, anything else",
    np: "अर्डरको समस्या, फिर्ता, अरू जे पनि",
  },
  "account.legal": { en: "Terms & policies", np: "नियम र नीतिहरू" },
  "account.legal.detail": { en: "What we promise, and what we keep", np: "हाम्रा वाचा र नीतिहरू" },
  "account.reviews": { en: "Your reviews", np: "तपाईंका समीक्षा" },
  "account.reviews.detail": { en: "What you said about your orders", np: "अर्डरबारे तपाईंले भन्नुभएको" },
  "account.data": { en: "Your data", np: "तपाईंको डाटा" },
  "account.data.detail": {
    en: "Download a copy, or close the account",
    np: "प्रतिलिपि लिनुहोस्, वा खाता बन्द गर्नुहोस्",
  },
  "account.sell": { en: "Sell on GoPasal", np: "गोपसलमा बेच्नुहोस्" },
  "account.sell.detail": { en: "Run a shop? Take orders here", np: "पसल छ? यहाँबाट अर्डर लिनुहोस्" },
  "account.signOut": { en: "Sign out", np: "साइन आउट" },
  "account.signOut.confirm": { en: "Sign out?", np: "साइन आउट गर्ने?" },
  "account.signOut.detail": {
    en: "Your cart and orders stay on your number.",
    np: "तपाईंको कार्ट र अर्डर नम्बरमै रहन्छ।",
  },
  "account.stay": { en: "Stay signed in", np: "साइन इन नै रहने" },
  "account.signIn.title": { en: "Sign in to GoPasal", np: "गोपसलमा साइन इन" },
  "account.signIn.detail": {
    en: "Your addresses, orders and coins follow your phone number.",
    np: "तपाईंका ठेगाना, अर्डर र कोइन फोन नम्बरसँगै रहन्छन्।",
  },
  "account.coins.spend": { en: "Spend them at checkout", np: "चेकआउटमा प्रयोग गर्नुहोस्" },

  /* ── language ────────────────────────────────────────────────────────── */
  "language.title": { en: "Language", np: "भाषा" },
  "language.detail": { en: "English or Nepali", np: "अंग्रेजी वा नेपाली" },

  /* ── shared verbs ────────────────────────────────────────────────────── */
  "common.continue": { en: "Continue", np: "अगाडि बढ्नुहोस्" },
  "common.cancel": { en: "Cancel", np: "रद्द" },
  "common.back": { en: "Go back", np: "फर्कनुहोस्" },
  "common.retry": { en: "Try again", np: "फेरि प्रयास" },
  "common.close": { en: "Close", np: "बन्द गर्नुहोस्" },
  "common.save": { en: "Save", np: "सुरक्षित गर्नुहोस्" },
  "common.working": { en: "Working…", np: "पर्खनुहोस्…" },
};

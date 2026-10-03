import type { Dictionary } from "@gopasal/native-ui";

/**
 * The strings the first pass through the shopping screens missed.
 *
 * Home, cart, checkout, the product page and the tracking screen were
 * translated heading-first, which got the screens reading as Nepali while
 * leaving the smaller print — summary rows, signed-out states, screen-reader
 * labels — in English. Those are collected here rather than pushed back into
 * `core.ts`, because what they have in common is where they were found, not
 * what they mean.
 *
 * The house rules for the Nepali live at the top of `core.ts`.
 */
export const screens: Dictionary = {
  /* ── home ────────────────────────────────────────────────────────────── */
  "home.greeting.morning": { en: "Good morning", np: "शुभ प्रभात" },
  "home.greeting.afternoon": { en: "Good afternoon", np: "नमस्ते" },
  "home.greeting.evening": { en: "Good evening", np: "शुभ साँझ" },
  "home.greeting.line": {
    en: "{greeting} — what do you need today?",
    np: "{greeting} — आज के चाहियो?",
  },
  "home.greeting.named": {
    en: "{greeting}, {name} — what do you need today?",
    np: "{greeting}, {name} — आज के चाहियो?",
  },
  "home.showingNear": { en: "Showing shops near", np: "नजिकका पसलहरू देखाउँदै" },
  "home.nearby.one": { en: "1 open nearby", np: "नजिकै 1 खुला" },
  "home.nearby.many": { en: "{count} nearby", np: "नजिकै {count}" },
  "home.saveBadge": { en: "Save {amount}", np: "{amount} बचत" },
  "home.error.title": { en: "Can't load shops", np: "पसलहरू ल्याउन सकिएन" },
  "home.error.server": {
    en: "Something went wrong at our end. Pull down to try again.",
    np: "हाम्रो तर्फबाट केही बिग्रियो। तल तानेर फेरि प्रयास गर्नुहोस्।",
  },
  "home.error.offline": {
    en: "You're offline. We'll load these as soon as you're back.",
    np: "तपाईं अफलाइन हुनुहुन्छ। इन्टरनेट आएपछि हामी यी लोड गर्नेछौं।",
  },
  "home.empty.title": { en: "No shops yet", np: "अहिलेसम्म पसल छैन" },
  "home.empty.detail": {
    en: "There are no shops delivering to this area yet.",
    np: "यस क्षेत्रमा डेलिभरी गर्ने पसल अहिलेसम्म छैन।",
  },
  "home.tagline": {
    en: "Shops from your own neighbourhood, delivered by riders who live in it.",
    np: "आफ्नै टोलका पसल, त्यहीँ बस्ने राइडरहरूले पुर्‍याउने।",
  },
  "home.a11y.changeAddress": {
    en: "Change delivery address",
    np: "डेलिभरी ठेगाना बदल्नुहोस्",
  },
  "home.a11y.search": {
    en: "Search shops, groceries and medicines",
    np: "पसल, किराना र औषधि खोज्नुहोस्",
  },
  "home.a11y.coins": {
    en: "{count} GoCoins. Open rewards",
    np: "{count} गोकोइन। पुरस्कार खोल्नुहोस्",
  },
  "home.a11y.seeAllCategory": { en: "See all {category}", np: "सबै {category} हेर्नुहोस्" },

  /* ── cart ────────────────────────────────────────────────────────────── */
  "cart.view": { en: "View cart", np: "कार्ट हेर्नुहोस्" },
  // Two keys rather than a plural rule: the call site knows the count.
  "cart.pending.one": { en: "1 change waiting to send", np: "1 परिवर्तन पठाउन बाँकी" },
  "cart.pending.many": {
    en: "{count} changes waiting to send",
    np: "{count} परिवर्तन पठाउन बाँकी",
  },
  "cart.pending.sending": { en: " — sending now.", np: " — अहिले पठाउँदै।" },
  "cart.pending.offline": {
    en: " — they'll go out when you're back online.",
    np: " — इन्टरनेट आएपछि पठाइनेछ।",
  },
  "cart.parked.failed": { en: "{label} didn't go through", np: "{label} पठाउन सकिएन" },
  "cart.belowMin": {
    en: "Add रु {amount} more to reach this shop's रु {min} minimum.",
    np: "यो पसलको न्यूनतम रु {min} पुग्न रु {amount} थप्नुहोस्।",
  },
  "cart.minButton": { en: "Minimum order is रु {amount}", np: "न्यूनतम अर्डर रु {amount}" },
  "cart.signIn.title": {
    en: "Sign in to use your cart",
    np: "कार्ट प्रयोग गर्न साइन इन गर्नुहोस्",
  },
  "cart.signIn.detail": {
    en: "Your basket follows your number, so it's there on any phone you sign in on.",
    np: "तपाईंको कार्ट फोन नम्बरसँगै रहन्छ, त्यसैले जुनसुकै फोनमा साइन इन गर्दा त्यहीँ भेटिन्छ।",
  },
  "cart.a11y.empty": { en: "Empty the cart", np: "कार्ट खाली गर्नुहोस्" },
  "cart.a11y.removeItem": { en: "Remove item", np: "सामान हटाउनुहोस्" },
  "cart.a11y.removeFromCart": { en: "Remove from cart", np: "कार्टबाट हटाउनुहोस्" },
  "cart.a11y.removeNamed": {
    en: "Remove {name} from cart",
    np: "{name} कार्टबाट हटाउनुहोस्",
  },
  "cart.a11y.decrease": { en: "Decrease quantity", np: "संख्या घटाउनुहोस्" },
  "cart.a11y.increase": { en: "Increase quantity", np: "संख्या बढाउनुहोस्" },
  "cart.a11y.fewer": { en: "Fewer {name}", np: "{name} कम" },
  "cart.a11y.more": { en: "More {name}", np: "{name} बढी" },
  "cart.a11y.view": {
    en: "View cart, {count} items, रु {total}",
    np: "कार्ट हेर्नुहोस्, {count} सामान, रु {total}",
  },

  /* ── checkout ────────────────────────────────────────────────────────── */
  "checkout.signIn.title": {
    en: "Sign in to check out",
    np: "चेकआउट गर्न साइन इन गर्नुहोस्",
  },
  "checkout.itemsFrom.one": { en: "{count} item from {shop}", np: "{shop} बाट {count} सामान" },
  "checkout.itemsFrom.many": { en: "{count} items from {shop}", np: "{shop} बाट {count} सामान" },
  "checkout.manage": { en: "Manage", np: "व्यवस्थापन" },
  "checkout.add": { en: "Add", np: "थप्नुहोस्" },
  "checkout.noAddress": {
    en: "We need somewhere to take it. Adding one takes a moment and the pin is what the rider follows.",
    np: "कहाँ पुर्‍याउने भन्ने चाहिन्छ। ठेगाना थप्न एकैछिन लाग्छ, र राइडरले पिन नै पछ्याउँछ।",
  },
  "checkout.notDeliverable": {
    en: "{shop} doesn't deliver to this address. Pick another address, or order from a shop closer to it.",
    np: "{shop} ले यो ठेगानामा डेलिभरी गर्दैन। अर्को ठेगाना छान्नुहोस्, वा नजिकको पसलबाट अर्डर गर्नुहोस्।",
  },
  "checkout.thisShop": { en: "This shop", np: "यो पसल" },
  "checkout.noPayment": {
    en: "This shop hasn't enabled a payment method yet. Message them and they can turn one on.",
    np: "यो पसलले अझै भुक्तानीको तरिका चालु गरेको छैन। सन्देश पठाउनुहोस्, उनीहरूले चालु गर्न सक्छन्।",
  },
  "checkout.offerShort": {
    en: "Add रु {amount} more to use this",
    np: "यो प्रयोग गर्न रु {amount} थप्नुहोस्",
  },
  "checkout.coupon.placeholder": { en: "Have a code?", np: "कोड छ?" },
  "checkout.remove": { en: "Remove", np: "हटाउनुहोस्" },
  "checkout.couponBad": {
    en: "{code} can't be used on this order.",
    np: "{code} यो अर्डरमा प्रयोग गर्न मिल्दैन।",
  },
  "checkout.coins.usable": {
    en: "{count} of your {available} can be used here — रु {value} off",
    np: "तपाईंका {available} मध्ये {count} यहाँ प्रयोग गर्न मिल्छ — रु {value} छुट",
  },
  "checkout.coins.none": {
    en: "You have {available}, but none can be used on this order",
    np: "तपाईंसँग {available} छन्, तर यो अर्डरमा कुनै पनि प्रयोग गर्न मिल्दैन",
  },
  "checkout.note.placeholder": {
    en: "Ring the bell twice, no coriander…",
    np: "घण्टी दुई पटक बजाउनुहोस्, धनियाँ नहाल्नुहोस्…",
  },
  "checkout.summary": { en: "Summary", np: "सारांश" },
  "checkout.updating": { en: "Updating…", np: "अपडेट हुँदै…" },
  "checkout.deliveryDistance": { en: "Delivery · {distance} km", np: "डेलिभरी · {distance} किमि" },
  "checkout.offer": { en: "Offer", np: "अफर" },
  "checkout.offerCode": { en: "Offer {code}", np: "अफर {code}" },
  "checkout.coinsLine": { en: "GoCoins ({count})", np: "गोकोइन ({count})" },
  "checkout.totalNote": {
    en: "Confirmed by the server, and checked again when the order is placed — this is what you pay.",
    np: "सर्भरले पक्का गरेको, र अर्डर गर्दा फेरि जाँचिने — तपाईंले तिर्ने यही हो।",
  },
  "checkout.minNote": {
    en: "This shop's minimum is रु {min}. Add रु {amount} more to place the order.",
    np: "यो पसलको न्यूनतम रु {min} हो। अर्डर गर्न रु {amount} थप्नुहोस्।",
  },
  "checkout.priceError": {
    en: "Couldn't price this order just now. Pull the screen down to retry.",
    np: "अहिले यो अर्डरको मूल्य निकाल्न सकिएन। स्क्रिन तल तानेर फेरि प्रयास गर्नुहोस्।",
  },
  "checkout.priceOffline": {
    en: "You're offline, so we can't confirm the total. Reconnect to place the order.",
    np: "तपाईं अफलाइन हुनुहुन्छ, त्यसैले कुल रकम पक्का गर्न सकिँदैन। अर्डर गर्न इन्टरनेट जोड्नुहोस्।",
  },
  "checkout.block.address": { en: "Choose where it's going", np: "कहाँ पुर्‍याउने छान्नुहोस्" },
  "checkout.block.payment": { en: "Choose how you'll pay", np: "कसरी भुक्तानी गर्ने छान्नुहोस्" },
  "checkout.block.priceError": {
    en: "We couldn't price this order just now.",
    np: "अहिले यो अर्डरको मूल्य निकाल्न सकिएन।",
  },
  "checkout.block.offline": {
    en: "You're offline, so the total can't be confirmed.",
    np: "तपाईं अफलाइन हुनुहुन्छ, त्यसैले कुल रकम पक्का गर्न सकिँदैन।",
  },
  "checkout.block.notDeliverable": {
    en: "{shop} doesn't deliver to this address.",
    np: "{shop} ले यो ठेगानामा डेलिभरी गर्दैन।",
  },
  "checkout.block.minOrder": {
    en: "This shop's minimum is रु {min} — add रु {amount} more.",
    np: "यो पसलको न्यूनतम रु {min} हो — रु {amount} थप्नुहोस्।",
  },
  "checkout.addPin": { en: "Add pin", np: "पिन थप्नुहोस्" },
  "checkout.payRider": {
    en: "Pay the rider on delivery",
    np: "सामान बुझेपछि राइडरलाई तिर्नुहोस्",
  },
  "checkout.payingNow": { en: "Paying now", np: "अहिले भुक्तानी" },
  "checkout.noTotal": { en: "no total yet", np: "कुल रकम अझै छैन" },
  "checkout.placeError": {
    en: "Couldn't place the order. Nothing has been charged — try again.",
    np: "अर्डर गर्न सकिएन। कुनै रकम काटिएको छैन — फेरि प्रयास गर्नुहोस्।",
  },
  "checkout.a11y.manageAddresses": {
    en: "Manage addresses",
    np: "ठेगानाहरू व्यवस्थापन गर्नुहोस्",
  },
  "checkout.a11y.deliverTo": {
    en: "Deliver to {label}, {address}",
    np: "{label} मा पुर्‍याउने, {address}",
  },
  "checkout.a11y.pay": { en: "Pay by {method}", np: "{method} बाट भुक्तानी" },
  "checkout.a11y.applyOffer": { en: "Apply offer {code}", np: "अफर {code} लागू गर्नुहोस्" },
  "checkout.a11y.removeOffer": { en: "Remove offer {code}", np: "अफर {code} हटाउनुहोस्" },
  "checkout.a11y.coupon": { en: "Coupon code", np: "कुपन कोड" },
  "checkout.a11y.noCoins": { en: "Don't use GoCoins", np: "गोकोइन प्रयोग नगर्ने" },
  "checkout.a11y.addPin": {
    en: "Add a map pin to this address",
    np: "यो ठेगानामा नक्सा पिन थप्नुहोस्",
  },

  /* ── one order, while it is happening ────────────────────────────────── */
  "track.signIn.title": {
    en: "Sign in to see this order",
    np: "यो अर्डर हेर्न साइन इन गर्नुहोस्",
  },
  "track.order": { en: "Order", np: "अर्डर" },
  "track.orderCode": { en: "Order {code}", np: "अर्डर {code}" },
  "track.placed.toast": {
    en: "Order placed. The shop has been told.",
    np: "अर्डर भयो। पसललाई खबर गरियो।",
  },
  "track.rejected.title": { en: "The shop couldn't take this", np: "पसलले यो लिन सकेन" },
  "track.cancelled.title": { en: "Order cancelled", np: "अर्डर रद्द भयो" },
  "track.restored": {
    en: "Anything already taken — stock, coins, a coupon use — has been put back.",
    np: "लिइसकेको सबै — स्टक, कोइन, कुपन प्रयोग — फिर्ता गरिएको छ।",
  },
  "track.detail.ACCEPTED": {
    en: "The shop is getting your items together",
    np: "पसलले तपाईंका सामान जुटाउँदैछ",
  },
  "track.detail.PACKED": {
    en: "Ready and waiting for a rider",
    np: "तयार छ, राइडर कुर्दै",
  },
  "track.detail.DELIVERED": { en: "Handed over", np: "हस्तान्तरण भयो" },
  "track.riderFallback": { en: "On the way", np: "बाटोमा" },
  "track.items": { en: "Items", np: "सामान" },
  "track.payOnDelivery": { en: "Pay on delivery", np: "सामान बुझेपछि भुक्तानी" },
  "track.paid": { en: "Paid", np: "भुक्तानी भयो" },
  "track.yourNote": { en: "Your note", np: "तपाईंको सन्देश" },
  "track.callShop": { en: "Call shop", np: "पसललाई फोन" },
  "track.cancel.confirm.title": { en: "Cancel this order?", np: "यो अर्डर रद्द गर्ने?" },
  "track.cancel.confirm.message": {
    en: "The shop will be told. Anything already taken — stock, coins, a coupon use — goes back.",
    np: "पसललाई खबर गरिनेछ। लिइसकेको सबै — स्टक, कोइन, कुपन प्रयोग — फिर्ता हुन्छ।",
  },
  "track.cancel.confirm.yes": { en: "Cancel order", np: "अर्डर रद्द गर्नुहोस्" },
  "track.cancel.confirm.no": { en: "Keep it", np: "रहन दिनुहोस्" },

  /* ── product ─────────────────────────────────────────────────────────── */
  "product.size": { en: "Size", np: "साइज" },
  "product.seeShelf": { en: "See the rest of the shelf", np: "पसलका अरू सामान हेर्नुहोस्" },
  "product.itemFallback": { en: "Item", np: "सामान" },
  "product.a11y.add": { en: "Add {name} to cart", np: "{name} कार्टमा थप्नुहोस्" },
  "product.a11y.save": { en: "Save this product", np: "यो सामान सुरक्षित गर्नुहोस्" },
  "product.a11y.unsave": {
    en: "Remove from saved products",
    np: "सुरक्षित सामानबाट हटाउनुहोस्",
  },
  "product.a11y.open": { en: "Open {name}", np: "{name} खोल्नुहोस्" },
  "product.a11y.openShop": { en: "Open {shop}", np: "{shop} खोल्नुहोस्" },
  "product.a11y.chooseOption": {
    en: "Choose {name}, रु {price}",
    np: "{name} छान्नुहोस्, रु {price}",
  },
  "product.a11y.optionSoldOut": { en: "{name}, sold out", np: "{name}, सकियो" },
  "product.a11y.chooseSize": {
    en: "Choose a size of {name}",
    np: "{name} को साइज छान्नुहोस्",
  },

  /* ── shop ────────────────────────────────────────────────────────────── */
  "shop.offersHere": { en: "Offers you can use here", np: "यहाँ प्रयोग गर्न मिल्ने अफरहरू" },
  "shop.itemCount.one": { en: "1 item", np: "1 सामान" },
  "shop.itemCount.many": { en: "{count} items", np: "{count} सामान" },
  "shop.a11y.save": { en: "Save this shop", np: "यो पसल सुरक्षित गर्नुहोस्" },
  "shop.a11y.unsave": { en: "Remove from saved shops", np: "सुरक्षित पसलबाट हटाउनुहोस्" },
  "shop.a11y.call": { en: "Call {shop}", np: "{shop} लाई फोन गर्नुहोस्" },
  "shop.a11y.groupOrder": {
    en: "Start a group order at {shop}",
    np: "{shop} मा मिलेर अर्डर सुरु गर्नुहोस्",
  },

  /* ── account ─────────────────────────────────────────────────────────── */
  "account.a11y.editProfile": {
    en: "Edit your profile",
    np: "आफ्नो प्रोफाइल सम्पादन गर्नुहोस्",
  },
  "account.a11y.rewards": {
    en: "Open GoCoins and referrals",
    np: "गोकोइन र रेफरल खोल्नुहोस्",
  },
  "account.a11y.useLanguage": { en: "Use {language}", np: "{language} प्रयोग गर्नुहोस्" },
};

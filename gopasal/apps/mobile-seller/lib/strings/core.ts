import type { Dictionary } from "@gopasal/native-ui";

/**
 * Every string the seller app says, in English and Nepali.
 *
 * House rules for the Nepali, which are the customer app's and are repeated
 * here because this is the file somebody will be looking at when they add a
 * string:
 *
 *  - **Borrowed words stay borrowed.** "अर्डर", "स्टक" and "डेलिभरी" are what
 *    shopkeepers say; "आदेश" and "मौज्दात" are what a translation tool says and
 *    nobody else does.
 *  - **Money is रु and the digits stay Western.** Devanagari numerals are
 *    correct and are not what a price tag in Baneshwor looks like.
 *  - **Verbs are polite-plain (मध्यम आदरार्थी)** — "गर्नुहोस्", not the
 *    familiar or the very formal.
 *  - **Untranslated is better than badly translated.** A key with no `np` falls
 *    back to English, which is honest; an invented word is not.
 *
 * One rule of its own: this app is read at speed, by somebody holding a
 * customer's order in the other hand. Where the customer app can afford a
 * sentence, this one gets a word. "तयार भयो" beats "अर्डर तयार भएको जनाउनुहोस्".
 */
export const core: Dictionary = {
  "intro.tagline": { en: "Your shop, on your phone", np: "तपाईंको पसल, तपाईंकै फोनमा" },
  "intro.badge": { en: "Seller", np: "विक्रेता" },
  /* ── tabs and chrome ─────────────────────────────────────────────────── */
  "tab.queue": { en: "Queue", np: "अर्डरहरू" },
  "tab.catalogue": { en: "Shelf", np: "सामान" },
  "tab.messages": { en: "Chats", np: "कुराकानी" },
  "tab.money": { en: "Money", np: "हिसाब" },
  "tab.shop": { en: "Shop", np: "पसल" },

  "net.offline.title": { en: "No internet", np: "इन्टरनेट छैन" },
  "net.offline.detail": {
    en: "New orders won't come through until you're back online.",
    np: "इन्टरनेट नआएसम्म नयाँ अर्डर आउँदैन।",
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

  "ui.loading": { en: "Loading", np: "लोड हुँदै" },
  "ui.yourRider": { en: "Your rider", np: "तपाईंको राइडर" },

  /* ── sign in ─────────────────────────────────────────────────────────── */
  "auth.title": { en: "Your shop, on your phone", np: "तपाईंको पसल, तपाईंकै फोनमा" },
  "auth.detail": {
    en: "Sign in with the number your shop is registered under.",
    np: "पसल दर्ता भएको नम्बरबाट साइन इन गर्नुहोस्।",
  },
  "auth.phone.title": { en: "Your shop, on your phone", np: "तपाईंको पसल, तपाईंकै फोनमा" },
  "auth.phone.detail": {
    en: "Sign in with the number your shop is registered under.",
    np: "पसल दर्ता भएको नम्बरबाट साइन इन गर्नुहोस्।",
  },
  "auth.phone.placeholder": { en: "98XXXXXXXX" },
  "auth.phone.a11yInput": { en: "Your phone number", np: "तपाईंको फोन नम्बर" },
  "auth.phone.hint": {
    en: "We'll text you a six-digit code.",
    np: "हामी छ अंकको कोड म्यासेजमा पठाउँछौं।",
  },
  "auth.phone.waiting": { en: "Waiting for a connection…", np: "इन्टरनेट पर्खँदै…" },
  "auth.phone.sendFailed": {
    en: "Couldn't send the code. Try again in a moment.",
    np: "कोड पठाउन सकिएन। एकैछिनमा फेरि प्रयास गर्नुहोस्।",
  },
  "auth.phone.terms": {
    en: "By continuing you agree to GoPasal's terms and privacy policy.",
    np: "अगाडि बढ्नुभयो भने गोपसलका सर्त र गोपनीयता नीति मान्नुभएको हुन्छ।",
  },
  "auth.code.verify": { en: "Verify", np: "पुष्टि गर्नुहोस्" },
  "auth.code.changeNumber": { en: "Use a different number", np: "अर्को नम्बर प्रयोग गर्नुहोस्" },
  "auth.code.resendFailed": {
    en: "Couldn't send another code just yet.",
    np: "अहिले अर्को कोड पठाउन सकिएन।",
  },
  "auth.code.a11yBoxes": {
    en: "Verification code, {entered} of {total} digits entered",
    np: "पुष्टि कोड, {total} मध्ये {entered} अंक हालियो",
  },

  "auth.phone.label": { en: "Phone number", np: "फोन नम्बर" },
  "auth.phone.send": { en: "Send code", np: "कोड पठाउनुहोस्" },
  "auth.phone.sending": { en: "Sending…", np: "पठाउँदै…" },
  "auth.phone.invalid": {
    en: "That doesn't look like a Nepali mobile number.",
    np: "यो नेपाली मोबाइल नम्बर जस्तो देखिएन।",
  },
  "auth.code.title": { en: "Enter the code", np: "कोड हाल्नुहोस्" },
  "auth.code.sentTo": { en: "Sent to {phone}", np: "{phone} मा पठाइयो" },
  "auth.code.resend": { en: "Send it again", np: "फेरि पठाउनुहोस्" },
  "auth.code.resendIn": {
    en: "Send again in {seconds}s",
    np: "{seconds} सेकेन्डमा फेरि पठाउन सकिन्छ",
  },
  "auth.code.wrong": { en: "That code isn't right.", np: "कोड मिलेन।" },

  /* ── choosing a shop ─────────────────────────────────────────────────── */
  "shop.choose.title": { en: "Which shop?", np: "कुन पसल?" },
  "shop.choose.detail": {
    en: "You run more than one. Pick the counter you're standing at — you can switch any time.",
    np: "तपाईंसँग एकभन्दा बढी पसल छ। अहिले जुन पसलमा हुनुहुन्छ त्यो छान्नुहोस् — जहिले पनि बदल्न सकिन्छ।",
  },
  "shop.switch": { en: "Switch shop", np: "पसल बदल्नुहोस्" },
  "shop.switch.detail": {
    en: "Orders, shelf, chats and money all follow the shop you pick.",
    np: "अर्डर, सामान, कुराकानी र हिसाब — सबै तपाईंले छानेको पसलको देखिन्छ।",
  },
  "shop.current": { en: "You're on this counter now", np: "अहिले तपाईं यही पसलमा हुनुहुन्छ" },
  "shop.pill.open": { en: "Open", np: "खुला" },
  "shop.picker.failed.title": { en: "Couldn't load your shops", np: "पसलहरू देखाउन सकिएन" },
  "shop.picker.failed.detail": {
    en: "GoPasal didn't answer. Check the connection and try again — nothing is lost.",
    np: "गोपसलले जवाफ दिएन। इन्टरनेट हेरेर फेरि प्रयास गर्नुहोस् — केही हराउँदैन।",
  },
  "shop.picker.a11yShop": { en: "{name}, {area}, {state}" },
  "shop.picker.a11yShopNoArea": { en: "{name}, {state}" },

  /* ── the queue ───────────────────────────────────────────────────────── */
  "queue.title": { en: "Orders", np: "अर्डरहरू" },
  "queue.live": { en: "live", np: "लाइभ" },
  "queue.new": { en: "New", np: "नयाँ" },
  "queue.preparing": { en: "Preparing", np: "तयारी हुँदै" },
  "queue.ready": { en: "Ready", np: "तयार" },
  "queue.onTheWay": { en: "On the way", np: "बाटोमा" },
  "queue.done": { en: "Done", np: "सकियो" },
  "queue.empty.title": { en: "Nothing waiting", np: "केही पनि बाँकी छैन" },
  "queue.empty.detail": {
    en: "New orders land here the moment a customer places one.",
    np: "ग्राहकले अर्डर गर्नासाथ यहीँ देखिन्छ।",
  },
  "queue.empty.closed": {
    en: "Your shop is closed, so customers can't order right now.",
    np: "तपाईंको पसल बन्द छ, त्यसैले अहिले ग्राहकले अर्डर गर्न सक्दैनन्।",
  },
  "queue.minutesAgo": { en: "{minutes} min ago", np: "{minutes} मिनेट अघि" },
  "queue.justNow": { en: "just now", np: "भर्खरै" },
  "queue.hoursAgo": { en: "{hours} h ago", np: "{hours} घण्टा अघि" },
  "queue.dayAgo": { en: "1 day ago", np: "1 दिन अघि" },
  "queue.daysAgo": { en: "{days} days ago", np: "{days} दिन अघि" },
  "queue.waiting": { en: "waiting {minutes} min", np: "{minutes} मिनेटदेखि पर्खिरहेको" },
  "queue.itemsOne": { en: "1 item", np: "1 सामान" },
  "queue.itemsMany": { en: "{count} items", np: "{count} सामान" },
  "queue.done.empty": { en: "Nothing finished yet.", np: "अहिलेसम्म केही सकिएको छैन।" },
  "queue.a11y.accept": { en: "Accept order {code}", np: "अर्डर {code} स्वीकार गर्नुहोस्" },
  "queue.a11y.reject": { en: "Can't take order {code}", np: "अर्डर {code} लिन सकिँदैन" },

  /* ── acting on an order ──────────────────────────────────────────────── */
  "order.accept": { en: "Accept", np: "स्वीकार" },
  "order.reject": { en: "Can't take it", np: "लिन सकिँदैन" },
  "order.pack": { en: "Packed", np: "प्याक भयो" },
  "order.dispatch": { en: "Hand to rider", np: "राइडरलाई दिनुहोस्" },
  "order.cancel": { en: "Cancel order", np: "अर्डर रद्द" },
  "order.accepting": { en: "Accepting…", np: "स्वीकार गर्दै…" },
  "order.working": { en: "Working…", np: "पर्खनुहोस्…" },
  "order.title": { en: "Order {code}", np: "अर्डर {code}" },
  "order.customer": { en: "Customer", np: "ग्राहक" },
  "order.deliverTo": { en: "Deliver to", np: "यहाँ पुर्‍याउने" },
  "order.note": { en: "Customer's note", np: "ग्राहकको सन्देश" },
  "order.items": { en: "Items", np: "सामान" },
  "order.payment": { en: "Payment", np: "भुक्तानी" },
  "order.cod": { en: "Cash on delivery", np: "सामान बुझेपछि नगद" },
  "order.paid": { en: "Paid online", np: "अनलाइन भुक्तानी भयो" },
  "order.unpaid": { en: "Not paid yet", np: "अझै भुक्तानी भएको छैन" },
  "order.collect": { en: "Collect रु {amount}", np: "रु {amount} लिनुहोस्" },
  "order.total": { en: "Total", np: "जम्मा" },
  "order.subtotal": { en: "Items", np: "सामान" },
  "order.delivery": { en: "Delivery", np: "डेलिभरी" },
  "order.discount": { en: "Discount", np: "छुट" },
  "order.callCustomer": { en: "Call customer", np: "ग्राहकलाई फोन" },
  "order.messageCustomer": { en: "Message", np: "सन्देश" },
  "order.rider": { en: "Rider", np: "राइडर" },
  "order.assignRider": { en: "Choose a rider", np: "राइडर छान्नुहोस्" },
  "order.noRiders": {
    en: "No riders on your roster yet. Add them from Shop › Delivery.",
    np: "तपाईंको सूचीमा कुनै राइडर छैन। पसल › डेलिभरीबाट थप्नुहोस्।",
  },
  "order.reject.title": { en: "Why can't you take it?", np: "किन लिन सकिँदैन?" },
  "order.reject.detail": {
    en: "The customer is told, and anything already taken — stock, coins, a coupon — goes back.",
    np: "ग्राहकलाई खबर जान्छ, र लिइसकेको सबै — स्टक, कोइन, कुपन — फिर्ता हुन्छ।",
  },
  "order.reject.confirm": { en: "Reject the order", np: "अर्डर अस्वीकार गर्नुहोस्" },
  "order.cancel.title": { en: "Cancel this order?", np: "यो अर्डर रद्द गर्ने?" },
  "order.cancel.detail": {
    en: "It was already accepted, so the customer is expecting it. Say why.",
    np: "यो स्वीकार भइसकेको छ, ग्राहकले पर्खिरहनुभएको छ। कारण लेख्नुहोस्।",
  },
  "order.reason.placeholder": { en: "In a few words…", np: "छोटकरीमा…" },
  "order.reason.required": { en: "Please say why.", np: "कारण लेख्नुहोस्।" },
  "order.reason.outOfStock": { en: "Out of stock", np: "स्टक सकियो" },
  "order.reason.tooBusy": { en: "Too busy right now", np: "अहिले धेरै व्यस्त" },
  "order.reason.closing": { en: "Closing soon", np: "बन्द गर्न लागेको" },
  "order.reason.tooFar": { en: "Too far to deliver", np: "पुर्‍याउन धेरै टाढा" },
  "order.reason.other": { en: "Something else", np: "अरू कारण" },
  "order.changeRider": { en: "Change rider", np: "राइडर बदल्नुहोस्" },
  "order.a11y.pickRider": { en: "Choose {name}", np: "{name} छान्नुहोस्" },
  "order.riderLoad": { en: "{count} on the road", np: "{count} बाटोमा" },
  "order.cancelledNote": { en: "What the customer was told", np: "ग्राहकलाई भनिएको कुरा" },
  "order.outForDelivery.detail": {
    en: "The rider moves it along from their app. If you're taking it yourself, use the buttons below.",
    np: "राइडरले आफ्नो एपबाट अगाडि बढाउँछन्। आफैं लैजाँदै हुनुहुन्छ भने तलका बटन प्रयोग गर्नुहोस्।",
  },
  "order.status.delivered": { en: "Delivered", np: "डेलिभरी भयो" },
  "order.status.cancelled": { en: "Cancelled", np: "रद्द भयो" },
  "order.status.rejected": { en: "Rejected", np: "अस्वीकार भयो" },

  /* ── the shelf ───────────────────────────────────────────────────────── */
  "shelf.title": { en: "Shelf", np: "सामान" },
  "shelf.search": { en: "Find an item", np: "सामान खोज्नुहोस्" },
  "shelf.inStock": { en: "On sale", np: "बिक्रीमा" },
  "shelf.outOfStock": { en: "Sold out", np: "सकियो" },
  "shelf.lowStock": { en: "Low", np: "थोरै" },
  "shelf.stockLeft": { en: "{count} left", np: "{count} बाँकी" },
  "shelf.setStock": { en: "Set stock", np: "स्टक मिलाउनुहोस्" },
  "shelf.price": { en: "Price", np: "मूल्य" },
  "shelf.empty.title": { en: "Nothing on the shelf", np: "सामान केही छैन" },
  "shelf.empty.detail": {
    en: "Tap Add product to put your first item on the shelf.",
    np: "पहिलो सामान राख्न सामान थप्नुहोस् थिच्नुहोस्।",
  },
  "shelf.noMatch": { en: "Nothing matched “{query}”", np: "“{query}” केही भेटिएन" },
  "shelf.onlyHere": {
    en: "Adding many items at once from a spreadsheet is done on the web console.",
    np: "स्प्रेडसिटबाट धेरै सामान एकैचोटि थप्ने काम वेब कन्सोलमा हुन्छ।",
  },
  "shelf.count": { en: "{count} items", np: "{count} सामान" },
  "shelf.noneLeft": { en: "None left", np: "बाँकी छैन" },
  "shelf.untracked": { en: "Not counted", np: "गन्ती छैन" },
  "shelf.clearSearch": { en: "Clear the search", np: "खोज हटाउनुहोस्" },
  "shelf.filter.all": { en: "Everything", np: "सबै" },
  "shelf.filter.noneLeft": { en: "None left", np: "बाँकी छैन" },
  "shelf.filter.low": { en: "Running low", np: "थोरै बाँकी" },
  "shelf.filter.none.title": { en: "Nothing needs attention", np: "केही हेर्नुपर्ने छैन" },
  "shelf.filter.none.detail": {
    en: "Everything under this filter is stocked and on sale.",
    np: "यो छनोटमा सबै स्टकमा र बिक्रीमा छन्।",
  },
  "shelf.a11yOpen": { en: "Open {name}", np: "{name} खोल्नुहोस्" },
  "shelf.a11yUntracked": { en: "{name} is not counted", np: "{name} को गन्ती हुँदैन" },
  "shelf.a11yCount": {
    en: "{name}, {count} left. Change the count.",
    np: "{name}, {count} बाँकी। गन्ती बदल्नुहोस्।",
  },
  "shelf.a11yMarkSoldOut": {
    en: "{name} is on sale. Mark it sold out.",
    np: "{name} बिक्रीमा छ। सकियो भनी राख्नुहोस्।",
  },
  "shelf.a11yMarkOnSale": {
    en: "{name} is sold out. Put it back on sale.",
    np: "{name} सकियो। फेरि बिक्रीमा राख्नुहोस्।",
  },

  "shelf.stock.clear": { en: "Clear", np: "खाली" },
  "shelf.stock.was": {
    en: "Was {count} — nothing to change",
    np: "पहिले {count} थियो — बदल्नु केही छैन",
  },
  "shelf.stock.adding": { en: "Adding {count} to {from}", np: "{from} मा {count} थपिँदै" },
  "shelf.stock.removing": { en: "Taking {count} off {from}", np: "{from} बाट {count} घटाइँदै" },
  "shelf.stock.a11yDigit": { en: "{digit}" },
  "shelf.stock.a11yBack": { en: "Delete the last digit", np: "अन्तिम अंक मेटाउनुहोस्" },
  "shelf.stock.a11yAdd": { en: "Add {count}", np: "{count} थप्नुहोस्" },
  "shelf.stock.a11yRemove": { en: "Remove {count}", np: "{count} घटाउनुहोस्" },
  "shelf.stock.a11yClear": { en: "Clear the count", np: "गन्ती खाली गर्नुहोस्" },
  "shelf.stock.a11yValue": { en: "New count, {count}", np: "नयाँ गन्ती, {count}" },

  /* ── one item ────────────────────────────────────────────────────────── */
  "product.name": { en: "Name", np: "नाम" },
  "product.nameRequired": { en: "An item needs a name.", np: "सामानको नाम चाहिन्छ।" },
  "product.priceRequired": {
    en: "A price has to be रु 1 or more.",
    np: "मूल्य कम्तीमा रु 1 हुनुपर्छ।",
  },
  "product.saved": {
    en: "Saved — this is what the shop now shows.",
    np: "सुरक्षित भयो — अब पसलमा यही देखिन्छ।",
  },
  "product.tapToHide": { en: "Tap to stop selling", np: "बिक्री रोक्न थिच्नुहोस्" },
  "product.tapToShow": { en: "Tap to start selling", np: "बिक्री सुरु गर्न थिच्नुहोस्" },
  "product.variants": { en: "Options ({count})", np: "विकल्प ({count})" },
  "product.priceJump.title": {
    en: "Change the price to रु {price}?",
    np: "मूल्य रु {price} बनाउने?",
  },
  "product.priceJump.detail": {
    en: "It was रु {current}. Check the digits before you save.",
    np: "पहिले रु {current} थियो। सुरक्षित गर्नुअघि अंक हेर्नुहोस्।",
  },
  "product.notFound.title": { en: "Can't find that item", np: "त्यो सामान भेटिएन" },
  "product.notFound.detail": {
    en: "It may have been removed, or it's further down the shelf. Search for it there.",
    np: "हटाइएको हुन सक्छ, वा सूचीमा तल छ। त्यहीँ खोज्नुहोस्।",
  },

  /* ── messages ────────────────────────────────────────────────────────── */
  "chat.title": { en: "Chats", np: "कुराकानी" },
  "chat.empty.title": { en: "No messages", np: "कुनै सन्देश छैन" },
  "chat.empty.detail": {
    en: "When a customer asks about an order, it appears here.",
    np: "ग्राहकले अर्डरबारे सोध्दा यहीँ देखिन्छ।",
  },
  "chat.placeholder": { en: "Write a reply…", np: "जवाफ लेख्नुहोस्…" },
  "chat.send": { en: "Send", np: "पठाउनुहोस्" },
  "chat.close": { en: "Close this chat", np: "कुराकानी बन्द गर्नुहोस्" },
  "chat.closed": { en: "Closed — a reply reopens it", np: "बन्द छ — जवाफ दिए फेरि खुल्छ" },
  "chat.aboutOrder": { en: "About order {code}", np: "अर्डर {code} बारे" },
  "chat.waiting": { en: "Waiting on you", np: "जवाफ बाँकी" },
  "chat.earlier": { en: "Everything else", np: "बाँकी सबै" },
  "chat.unread": { en: "Unread", np: "नपढेको" },
  "chat.unreadCount": { en: "{count} unread", np: "{count} नपढेको" },
  "chat.closedTag": { en: "Closed", np: "बन्द" },
  "chat.noMessages": { en: "No messages yet", np: "अहिलेसम्म सन्देश छैन" },
  "chat.lastFromYou": { en: "You: {body}", np: "तपाईं: {body}" },
  "chat.composer.a11y": { en: "Your reply", np: "तपाईंको जवाफ" },
  "chat.openOrder.a11y": { en: "Open order {code}", np: "अर्डर {code} खोल्नुहोस्" },
  "chat.queued": { en: "Waiting to send", np: "पठाउन बाँकी" },
  "chat.sending": { en: "Sending…", np: "पठाउँदै…" },
  "chat.queuedNote": {
    en: "No internet — your reply is saved and sent the moment you're back.",
    np: "इन्टरनेट छैन — जवाफ सुरक्षित छ, इन्टरनेट आउनासाथ पठाइन्छ।",
  },
  "chat.close.confirm": { en: "Close this chat?", np: "कुराकानी बन्द गर्ने?" },
  "chat.close.detail": {
    en: "It stays in your list, and if the customer writes again it opens straight back up.",
    np: "सूचीमा रहिरहन्छ, र ग्राहकले फेरि लेखे तुरुन्तै खुल्छ।",
  },
  "chat.time.now": { en: "now", np: "अहिले" },
  "chat.time.minutes": { en: "{count}m", np: "{count}मि" },
  "chat.time.hours": { en: "{count}h", np: "{count}घ" },

  /* ── money ───────────────────────────────────────────────────────────── */
  "money.title": { en: "Money", np: "हिसाब" },
  "money.today": { en: "Today", np: "आज" },
  "money.week": { en: "This week", np: "यो हप्ता" },
  "money.month": { en: "This month", np: "यो महिना" },
  "money.sales": { en: "Sales", np: "बिक्री" },
  "money.orders": { en: "Orders", np: "अर्डर" },
  "money.average": { en: "Average order", np: "औसत अर्डर" },
  "money.pending": { en: "Coming to you", np: "आउन बाँकी" },
  "money.paidOut": { en: "Paid out", np: "भुक्तानी भइसकेको" },
  "money.codDue": { en: "Cash you owe GoPasal", np: "गोपसललाई तिर्नुपर्ने नगद" },
  "money.codNote": {
    en: "Cash you collected at the door on orders GoPasal has already settled. It comes off your next payout.",
    np: "गोपसलले हिसाब मिलाइसकेका अर्डरमा ढोकैमा उठाएको नगद। अर्को भुक्तानीबाट कट्टा हुन्छ।",
  },
  "money.topItems": { en: "Selling best", np: "सबैभन्दा बढी बिक्री" },
  "money.noSales": { en: "No sales in this period", np: "यो अवधिमा बिक्री भएन" },
  "money.settlements": { en: "Payouts", np: "भुक्तानीहरू" },
  "money.asOf": { en: "as of {time}", np: "{time} सम्मको" },
  "money.a11y.pending": { en: "Coming to you, रु {amount}", np: "आउन बाँकी, रु {amount}" },
  "money.pendingNote": {
    en: "GoPasal sends this on at the next payout. It isn't in your till yet.",
    np: "गोपसलले अर्को भुक्तानीमा पठाउँछ। अहिले तपाईंको गल्लामा छैन।",
  },
  "money.escrow": { en: "Still being held", np: "अझै रोकिएको" },
  "money.escrowNote": {
    en: "On {count} orders that aren't finished yet.",
    np: "नसकिएका {count} अर्डरको।",
  },
  "money.a11y.codDue": {
    en: "Cash you owe GoPasal, रु {amount}",
    np: "गोपसललाई तिर्नुपर्ने नगद, रु {amount}",
  },
  "money.a11y.rupees": { en: "रु {amount}" },
  "money.up": { en: "+{percent}%" },
  "money.down": { en: "−{percent}%" },
  "money.period.7d": { en: "7 days", np: "7 दिन" },
  "money.period.30d": { en: "30 days", np: "30 दिन" },
  "money.period.90d": { en: "90 days", np: "90 दिन" },
  "money.window": { en: "{from} to {to}", np: "{from} देखि {to}" },
  "money.delivered": { en: "Delivered", np: "डेलिभरी भएका" },
  "money.cashAtDoor": { en: "Cash taken at the door", np: "ढोकैमा उठाएको नगद" },
  "money.cashAtDoorNote": {
    en: "The full value of {count} cash orders — not your share of it.",
    np: "{count} नगद अर्डरको पूरा रकम — तपाईंको भाग होइन।",
  },
  "money.onlineOrders": { en: "Paid online", np: "अनलाइन भुक्तानी" },
  "money.onlineDelivered": {
    en: "{delivered} of {total} delivered",
    np: "{total} मध्ये {delivered} डेलिभरी भयो",
  },
  "money.unitsSold": { en: "{count} sold", np: "{count} बिक्री" },
  "money.topItems.note": {
    en: "What the items sold for. Delivery and coupons aren't in these figures, so they won't add up to sales.",
    np: "सामान बिकेको रकम। यसमा डेलिभरी र कुपन जोडिएको छैन, त्यसैले कुल बिक्रीसँग मिल्दैन।",
  },
  "money.byDayPlaced": { en: "By the day the order came in", np: "अर्डर आएको दिनअनुसार" },
  "money.bestDay": { en: "Best: {date}", np: "सबैभन्दा बढी: {date}" },
  "money.a11y.chart": {
    en: "Sales for the last {days} days. Best day {date}, रु {amount}.",
    np: "पछिल्लो {days} दिनको बिक्री। सबैभन्दा बढी {date}, रु {amount}।",
  },
  "money.refunds": { en: "Refunded to customers", np: "ग्राहकलाई फिर्ता" },
  "money.unavailable": { en: "These figures didn't load.", np: "यी अंक लोड भएनन्।" },
  "money.openNone": { en: "No settlement is open right now.", np: "अहिले कुनै हिसाब खुला छैन।" },
  "money.openPayout": { en: "Open settlement, coming to you", np: "खुला हिसाब, आउन बाँकी" },
  "money.openCollection": {
    en: "Open settlement, collected from you",
    np: "खुला हिसाब, तपाईंबाट उठाउने",
  },
  "money.settlement.toYou": { en: "Paid to you", np: "तपाईंलाई भुक्तानी" },
  "money.settlement.fromYou": { en: "Collected from you", np: "तपाईंबाट उठाएको" },
  "money.settlement.done": { en: "Done", np: "सकियो" },
  "money.settlement.open": { en: "Still open", np: "खुला छ" },
  "money.settlement.failed": { en: "Didn't go through", np: "भएन" },
  "money.a11y.settlement": { en: "{direction}, रु {amount}, {window}, {status}" },
  "money.settlements.empty": {
    en: "No payout has run yet. The first one appears here once GoPasal closes a window.",
    np: "अहिलेसम्म कुनै भुक्तानी भएको छैन। गोपसलले अवधि बन्द गरेपछि पहिलो यहीँ देखिन्छ।",
  },
  "money.settlements.more": {
    en: "{count} older payouts are on the web console.",
    np: "पुराना {count} भुक्तानी वेब कन्सोलमा छन्।",
  },

  /* ── the shop ────────────────────────────────────────────────────────── */
  "shop.title": { en: "Shop", np: "पसल" },
  "shop.open": { en: "Open for orders", np: "अर्डर लिन खुला" },
  "shop.closed": { en: "Closed", np: "बन्द" },
  "shop.openDetail": {
    en: "Customers can see you and order.",
    np: "ग्राहकले देख्न र अर्डर गर्न सक्छन्।",
  },
  "shop.closedDetail": {
    en: "You're hidden from the app. Orders already placed still need finishing.",
    np: "तपाईं एपमा देखिनुहुन्न। अर्डर भइसकेका काम भने सिध्याउनुपर्छ।",
  },
  "shop.minOrder": { en: "Minimum order", np: "न्यूनतम अर्डर" },
  "shop.minOrderDetail": {
    en: "Below this, a customer can't check out.",
    np: "यसभन्दा कम भए ग्राहकले अर्डर गर्न पाउँदैनन्।",
  },
  "shop.riders": { en: "Riders", np: "राइडरहरू" },
  "shop.reviews": { en: "Reviews", np: "समीक्षा" },
  "shop.signOut": { en: "Sign out", np: "साइन आउट" },
  "shop.signOut.confirm": { en: "Sign out of GoPasal?", np: "गोपसलबाट साइन आउट गर्ने?" },
  "shop.signOut.detail": {
    en: "You'll stop getting order alerts on this phone until you sign in again.",
    np: "फेरि साइन इन नगरेसम्म यो फोनमा अर्डरको सूचना आउँदैन।",
  },
  "shop.stay": { en: "Stay signed in", np: "साइन इन नै रहनुहोस्" },

  "shop.hidden.title": {
    en: "Customers still can't see you",
    np: "ग्राहकले अझै देख्न सकेका छैनन्",
  },
  "shop.blocker.approval": {
    en: "GoPasal hasn't approved the shop yet.",
    np: "गोपसलले पसल स्वीकृत गरेको छैन।",
  },
  "shop.blocker.location": {
    en: "Your shop's location isn't recorded. Record it from Shop › Shop settings.",
    np: "पसलको ठाउँ राखिएको छैन। पसल › पसल सेटिङबाट राख्नुहोस्।",
  },
  "shop.blocker.stock": {
    en: "Nothing on your shelf is in stock and on sale.",
    np: "सामानमध्ये कुनै पनि स्टकमा र बिक्रीमा छैन।",
  },
  "shop.openAction": { en: "Open the shop", np: "पसल खोल्नुहोस्" },
  "shop.closeAction": { en: "Close the shop", np: "पसल बन्द गर्नुहोस्" },
  "shop.close.confirm": { en: "Close the shop?", np: "पसल बन्द गर्ने?" },
  "shop.stayOpen": { en: "Stay open", np: "खुला नै राख्नुहोस्" },
  "shop.minOrder.none": {
    en: "No minimum — any order goes through.",
    np: "न्यूनतम छैन — जतिको भए पनि अर्डर जान्छ।",
  },
  "shop.minOrder.noneShort": { en: "None", np: "छैन" },
  "shop.minOrder.was": { en: "Was रु {amount}", np: "पहिले रु {amount} थियो" },
  "shop.minOrder.saved": {
    en: "Saved — the minimum is now रु {amount}",
    np: "सुरक्षित भयो — अब न्यूनतम रु {amount}",
  },
  "shop.minOrder.tooHigh": {
    en: "That's above रु {amount}. Check the number — customers below it can't order at all.",
    np: "यो रु {amount} भन्दा माथि छ। अंक हेर्नुहोस् — यसभन्दा कमका ग्राहकले अर्डर नै गर्न पाउँदैनन्।",
  },
  "shop.minOrder.a11yRow": {
    en: "Minimum order, रु {amount}. Change it",
    np: "न्यूनतम अर्डर, रु {amount}। बदल्नुहोस्",
  },
  "shop.minOrder.a11yValue": { en: "Minimum order, रु {amount}", np: "न्यूनतम अर्डर, रु {amount}" },
  "shop.minOrder.a11yNone": { en: "No minimum order", np: "न्यूनतम अर्डर छैन" },
  "shop.minOrder.a11yAdd": { en: "Add रु {amount}", np: "रु {amount} थप्नुहोस्" },
  "shop.minOrder.a11yRemove": { en: "Take off रु {amount}", np: "रु {amount} घटाउनुहोस्" },
  "shop.minOrder.a11yClear": { en: "Clear the amount", np: "रकम खाली गर्नुहोस्" },
  "shop.rider.busy": { en: "{count} on the road", np: "{count} बाटोमा" },
  "shop.rider.free": { en: "Free now", np: "अहिले खाली" },
  "shop.rider.offline": { en: "Not online", np: "अनलाइन छैन" },
  "shop.riders.failed": {
    en: "Couldn't load your riders just now.",
    np: "अहिले राइडरहरू देखाउन सकिएन।",
  },
  "shop.reviewsDetail": {
    en: "{rating} out of 5, from {count} customers",
    np: "5 मध्ये {rating}, {count} ग्राहकबाट",
  },
  "shop.switchDetail": {
    en: "You run {count} shops on this account",
    np: "यो खातामा तपाईंका {count} पसल छन्",
  },

  /* ── reviews ─────────────────────────────────────────────────────────── */
  "reviews.title": { en: "Reviews", np: "समीक्षा" },
  "reviews.reply": { en: "Reply", np: "जवाफ" },
  "reviews.replyPlaceholder": { en: "Answer the customer…", np: "ग्राहकलाई जवाफ दिनुहोस्…" },
  "reviews.replied": { en: "You replied", np: "तपाईंले जवाफ दिनुभयो" },
  "reviews.empty.title": { en: "No reviews yet", np: "अहिलेसम्म समीक्षा छैन" },
  "reviews.empty.detail": {
    en: "Customers can review an order once it's delivered.",
    np: "अर्डर पुगेपछि ग्राहकले समीक्षा लेख्न सक्छन्।",
  },
  "reviews.unanswered": { en: "Not answered", np: "जवाफ बाँकी" },
  "reviews.all": { en: "All", np: "सबै" },
  "reviews.lowRated": { en: "1–2 stars", np: "1–2 तारा" },
  "reviews.noLowRated": { en: "No one- or two-star reviews", np: "एक वा दुई ताराको समीक्षा छैन" },
  "reviews.allAnswered.title": { en: "Everyone has an answer", np: "सबैलाई जवाफ गइसक्यो" },
  "reviews.allAnswered.detail": {
    en: "Nothing is waiting on you. Tap All to read the rest.",
    np: "तपाईंको केही बाँकी छैन। बाँकी पढ्न सबै थिच्नुहोस्।",
  },
  "reviews.countOne": { en: "1 review", np: "1 समीक्षा" },
  "reviews.count": { en: "{count} reviews", np: "{count} समीक्षा" },
  "reviews.anonymous": { en: "A customer", np: "एक ग्राहक" },
  "reviews.ratingOnly": { en: "A rating, with no words.", np: "तारा मात्र, केही लेखिएको छैन।" },
  "reviews.a11y.rating": { en: "{rating} out of 5", np: "5 मध्ये {rating}" },
  "reviews.change": { en: "Change your reply", np: "जवाफ बदल्नुहोस्" },
  "reviews.replaceNote": {
    en: "This replaces the answer customers can see.",
    np: "ग्राहकले देख्ने जवाफ यसैले बदलिन्छ।",
  },
  "reviews.post": { en: "Send", np: "पठाउनुहोस्" },
  "reviews.needWords": { en: "Write something first.", np: "पहिले केही लेख्नुहोस्।" },
  "reviews.tooLong": {
    en: "That's longer than {max} characters.",
    np: "यो {max} अक्षरभन्दा लामो भयो।",
  },
  "reviews.remaining": { en: "{count} characters left", np: "{count} अक्षर बाँकी" },

  /* ── running the shop from the phone ─────────────────────────────────── */
  "shop.riders.manage": { en: "Manage riders and zones", np: "राइडर र क्षेत्र मिलाउनुहोस्" },
  "shop.manage.team": { en: "Team", np: "टोली" },
  "shop.manage.teamDetail": {
    en: "Staff, invites and what each can do",
    np: "कर्मचारी, निमन्त्रणा र कसले के गर्न सक्छ",
  },
  "shop.manage.promotions": { en: "Coupons", np: "कुपन" },
  "shop.manage.promotionsDetail": {
    en: "Discount codes for your customers",
    np: "ग्राहकका लागि छुट कोड",
  },
  "shop.manage.delivery": { en: "Delivery", np: "डेलिभरी" },
  "shop.manage.deliveryDetail": {
    en: "Riders and the areas you deliver to",
    np: "राइडर र डेलिभरी गर्ने क्षेत्र",
  },
  "shop.manage.settings": { en: "Shop settings", np: "पसल सेटिङ" },
  "shop.manage.settingsDetail": {
    en: "Name, hours, address and location",
    np: "नाम, समय, ठेगाना र ठाउँ",
  },
  "shelf.noMatch.detail": {
    en: "Check the spelling, or add it as a new product.",
    np: "हिज्जे जाँच्नुहोस्, वा नयाँ सामानको रूपमा थप्नुहोस्।",
  },

  /* ── language ────────────────────────────────────────────────────────── */
  "language.title": { en: "Language", np: "भाषा" },
  "language.detail": { en: "English or Nepali", np: "अंग्रेजी वा नेपाली" },
  "language.a11y.use": { en: "Use {language}", np: "{language} प्रयोग गर्नुहोस्" },

  /* ── shared verbs ────────────────────────────────────────────────────── */
  "list.showMore": {
    en: "Show more · {shown} of {total}",
    np: "अरू हेर्नुहोस् · {total} मध्ये {shown}",
  },
  "queue.done.search": {
    en: "Find an order by code, name or phone",
    np: "कोड, नाम वा फोनले अर्डर खोज्नुहोस्",
  },
  "common.continue": { en: "Continue", np: "अगाडि बढ्नुहोस्" },
  "common.cancel": { en: "Cancel", np: "रद्द" },
  "common.back": { en: "Go back", np: "फर्कनुहोस्" },
  "common.retry": { en: "Try again", np: "फेरि प्रयास" },
  "common.close": { en: "Close", np: "बन्द गर्नुहोस्" },
  "common.save": { en: "Save", np: "सुरक्षित गर्नुहोस्" },
  "common.saving": { en: "Saving…", np: "सुरक्षित गर्दै…" },
  "common.done": { en: "Done", np: "भयो" },
  "common.working": { en: "Working…", np: "पर्खनुहोस्…" },
  "common.notNow": { en: "Not now", np: "अहिले होइन" },
  "common.somethingWrong": {
    en: "That didn't work. Try again.",
    np: "काम भएन। फेरि प्रयास गर्नुहोस्।",
  },
};

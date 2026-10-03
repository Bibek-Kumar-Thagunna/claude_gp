import type { Dictionary } from "@gopasal/native-ui";

/** Strings for the product screens. House rules for the Nepali are at the top of ./core.ts. */
export const productStrings: Dictionary = {
  /* ── edit ────────────────────────────────────────────────────────────── */
  "product.edit.changedElsewhere": {
    en: "Someone changed this product while you were editing. Saving only sends the boxes you changed.",
    np: "तपाईं बदल्दै गर्दा अरू कसैले यो सामान बदल्यो। सेभ गर्दा तपाईंले बदलेका कुरा मात्र जान्छन्।",
  },
  "product.edit.details": { en: "Details", np: "विवरण" },
  "product.edit.discard": { en: "Undo changes", np: "परिवर्तन फर्काउनुहोस्" },
  "product.edit.readOnly": {
    en: "You can look at this product but not change it. Editing needs permission from the shop owner.",
    np: "तपाईं यो सामान हेर्न सक्नुहुन्छ, बदल्न सक्नुहुन्न। बदल्न पसलको मालिकको अनुमति चाहिन्छ।",
  },
  "product.edit.title": { en: "Product", np: "सामान" },

  /* ── error ───────────────────────────────────────────────────────────── */
  "product.error.forbidden": {
    en: "You don't have permission to do that at this shop.",
    np: "यो पसलमा त्यो गर्ने अनुमति तपाईंलाई छैन।",
  },
  "product.error.offline": {
    en: "Couldn't reach GoPasal. Check your connection and try again.",
    np: "गोपसलसम्म पुग्न सकिएन। इन्टरनेट हेरेर फेरि प्रयास गर्नुहोस्।",
  },

  /* ── field ───────────────────────────────────────────────────────────── */
  "product.field.category": { en: "Category", np: "किसिम" },
  "product.field.categoryFailed": {
    en: "Couldn't load categories. Tap to try again.",
    np: "किसिमहरू देखाउन सकिएन। फेरि प्रयास गर्न थिच्नुहोस्।",
  },
  "product.field.categoryNone": {
    en: "None chosen. Customers find it by name only.",
    np: "छानिएको छैन। ग्राहकले नामबाट मात्र भेट्छन्।",
  },
  "product.field.description": { en: "Description", np: "विवरण" },
  "product.field.descriptionCount": { en: "{count} / {max}", np: "{count} / {max}" },
  "product.field.mrp": { en: "MRP (printed price)", np: "MRP (छापिएको मूल्य)" },
  "product.field.mrpHint": {
    en: "Optional. When it's more than your price, customers see it crossed out.",
    np: "ऐच्छिक। तपाईंको मूल्यभन्दा बढी भए ग्राहकले काटिएको देख्छन्।",
  },
  "product.field.nameNp": { en: "Name in Nepali", np: "नेपालीमा नाम" },
  "product.field.namePlaceholder": { en: "e.g. Basmati rice", np: "जस्तै बासमती चामल" },
  "product.field.optional": { en: "Optional", np: "ऐच्छिक" },
  "product.field.priceHint": {
    en: "Whole rupees — what the customer pays.",
    np: "पूरा रुपैयाँ — ग्राहकले तिर्ने।",
  },
  "product.field.stock": { en: "How many you have now", np: "अहिले कति छ" },
  "product.field.stockHint": {
    en: "Left empty, it starts at 0.",
    np: "खाली छोडे 0 बाट सुरु हुन्छ।",
  },
  "product.field.tags": { en: "Search words", np: "खोज्ने शब्द" },
  "product.field.tagsHint": {
    en: "Separate with commas, e.g. chamal, basmati. {count} of {max}.",
    np: "अल्पविरामले छुट्याउनुहोस्, जस्तै चामल, basmati। {max} मध्ये {count}।",
  },
  "product.field.trackStock": { en: "Count stock", np: "स्टक गन्ने" },
  "product.field.trackStockOff": {
    en: "Off: always on sale until you hide it.",
    np: "बन्द: तपाईंले नलुकाएसम्म सधैं बिक्रीमा।",
  },
  "product.field.trackStockOn": {
    en: "GoPasal keeps a count and stops selling at zero.",
    np: "गोपसलले गन्छ र शून्य भएपछि बेच्न रोक्छ।",
  },
  "product.field.unit": { en: "Sold as", np: "बेच्ने एकाइ" },
  "product.field.unitHint": {
    en: "e.g. 1 kg, 500 ml, 1 packet.",
    np: "जस्तै 1 kg, 500 ml, 1 प्याकेट।",
  },
  "product.field.unitHintNew": {
    en: "e.g. 1 kg, 500 ml, 1 packet. Left empty, it's 1 pc.",
    np: "जस्तै 1 kg, 500 ml, 1 प्याकेट। खाली छोडे 1 pc।",
  },

  /* ── general ─────────────────────────────────────────────────────────── */
  "product.fixProblems": {
    en: "Check the boxes marked in red.",
    np: "रातोले देखाएका कुरा जाँच्नुहोस्।",
  },
  "product.keep": { en: "Keep it", np: "राख्नुहोस्" },
  "product.untrackedHere": {
    en: "This item isn't counted. Turn on “Count stock” in the details above to keep a number for it.",
    np: "यो सामान गनिँदैन। संख्या राख्न माथिको विवरणमा “स्टक गन्ने” खोल्नुहोस्।",
  },
  "shelf.addProduct": { en: "Add product", np: "सामान थप्नुहोस्" },

  /* ── gone ────────────────────────────────────────────────────────────── */
  "product.gone.deletedDetail": {
    en: "The product and its photos have been removed.",
    np: "सामान र त्यसका फोटो हटाइए।",
  },
  "product.gone.deletedTitle": { en: "Deleted", np: "मेटाइयो" },
  "product.gone.detail": {
    en: "Your shop doesn't have it any more — it may have been deleted on another device.",
    np: "यो सामान अब तपाईंको पसलमा छैन — अर्को फोनबाट मेटाइएको हुन सक्छ।",
  },
  "product.gone.errorTitle": { en: "Couldn't load this product", np: "यो सामान देखाउन सकिएन" },
  "product.gone.title": { en: "This product is gone", np: "यो सामान छैन" },
  "product.gone.truncatedDetail": {
    en: "It isn't in the first {count} products of your shelf. It may still be there — search for it by name on the shelf.",
    np: "यो तपाईंको सामानका पहिलो {count} मा छैन। अझै हुन सक्छ — सामान ट्याबमा नामले खोज्नुहोस्।",
  },
  "product.gone.truncatedTitle": { en: "Couldn't find it quickly", np: "छिटो भेटिएन" },

  /* ── issue ───────────────────────────────────────────────────────────── */
  "product.issue.category": {
    en: "That category id is not a real one.",
    np: "त्यो किसिम साँचो होइन।",
  },
  "product.issue.descriptionTooLong": {
    en: "The description can be at most {max} characters.",
    np: "विवरण बढीमा {max} अक्षरको हुन सक्छ।",
  },
  "product.issue.mrp": {
    en: "Enter the MRP in whole rupees, or leave it empty.",
    np: "MRP पूरा रुपैयाँमा हाल्नुहोस्, वा खाली छोड्नुहोस्।",
  },
  "product.issue.nameMissing": { en: "Give the product a name.", np: "सामानको नाम दिनुहोस्।" },
  "product.issue.nameNpTooLong": {
    en: "The Nepali name can be at most {max} characters.",
    np: "नेपाली नाम बढीमा {max} अक्षरको हुन सक्छ।",
  },
  "product.issue.nameTooLong": {
    en: "A name can be at most {max} characters.",
    np: "नाम बढीमा {max} अक्षरको हुन सक्छ।",
  },
  "product.issue.price": {
    en: "Enter the price in whole rupees.",
    np: "मूल्य पूरा रुपैयाँमा हाल्नुहोस्।",
  },
  "product.issue.stock": {
    en: "A count is a whole number, zero or more.",
    np: "संख्या पूरा अंक हुनुपर्छ, शून्य वा बढी।",
  },
  "product.issue.tagCount": { en: "At most {max} tags.", np: "बढीमा {max} शब्द।" },
  "product.issue.tagTooLong": {
    en: "Each tag can be at most {max} characters.",
    np: "हरेक शब्द बढीमा {max} अक्षरको हुन सक्छ।",
  },
  "product.issue.unitMissing": {
    en: 'Say what one of these is, e.g. "1 kg".',
    np: 'एउटा भनेको कति हो लेख्नुहोस्, जस्तै "1 kg"।',
  },
  "product.issue.unitTooLong": {
    en: "A unit can be at most {max} characters.",
    np: "एकाइ बढीमा {max} अक्षरको हुन सक्छ।",
  },

  /* ── new ─────────────────────────────────────────────────────────────── */
  "product.new.locked.detail": {
    en: "Adding products needs permission from the shop owner.",
    np: "सामान थप्न पसलको मालिकको अनुमति चाहिन्छ।",
  },
  "product.new.locked.title": {
    en: "You can't add products here",
    np: "तपाईं यहाँ सामान थप्न सक्नुहुन्न",
  },
  "product.new.more": { en: "More details (optional)", np: "थप विवरण (ऐच्छिक)" },
  "product.new.moreDetail": {
    en: "Nepali name, MRP, unit, category, description, search words, stock count",
    np: "नेपाली नाम, MRP, एकाइ, किसिम, विवरण, खोज्ने शब्द, स्टक संख्या",
  },
  "product.new.save": { en: "Save product", np: "सामान सेभ गर्नुहोस्" },
  "product.new.saveWithPhotos": {
    en: "Save with {count} photo(s)",
    np: "{count} फोटोसहित सेभ गर्नुहोस्",
  },
  "product.new.saved.detail": {
    en: "On sale now. Add the next one below.",
    np: "अब बिक्रीमा छ। तल अर्को थप्नुहोस्।",
  },
  "product.new.saved.open": {
    en: "Open it — add options or more photos",
    np: "खोल्नुहोस् — विकल्प वा थप फोटो राख्नुहोस्",
  },
  "product.new.saved.photosFailed": {
    en: "{count} photo(s) didn't upload. Open it to add them again.",
    np: "{count} फोटो अपलोड भएन। खोलेर फेरि थप्नुहोस्।",
  },
  "product.new.saved.title": { en: "Saved “{name}”", np: "“{name}” सेभ भयो" },
  "product.new.title": { en: "Add a product", np: "सामान थप्नुहोस्" },

  /* ── photo ───────────────────────────────────────────────────────────── */
  "product.photo.a11yCover": {
    en: "Photo 1 of {count}, the one customers see",
    np: "{count} मध्ये फोटो 1, ग्राहकले देख्ने",
  },
  "product.photo.a11yTile": { en: "Photo {n} of {count}", np: "{count} मध्ये फोटो {n}" },
  "product.photo.cameraDenied": {
    en: "GoPasal needs camera permission to photograph your products.",
    np: "सामानको फोटो खिच्न गोपसललाई क्यामेरा अनुमति चाहिन्छ।",
  },
  "product.photo.choose": { en: "Choose", np: "छान्नुहोस्" },
  "product.photo.count": { en: "{count} of {max}", np: "{max} मध्ये {count}" },
  "product.photo.coverBadge": { en: "Customers see this one", np: "ग्राहकले यही देख्छन्" },
  "product.photo.delete": { en: "Delete photo", np: "फोटो मेटाउनुहोस्" },
  "product.photo.deleteDetail": {
    en: "It is removed from the product and from storage. This can't be undone.",
    np: "सामान र स्टोरेज दुवैबाट हट्छ। फर्काउन मिल्दैन।",
  },
  "product.photo.deleteTitle": { en: "Delete this photo?", np: "यो फोटो मेटाउने?" },
  "product.photo.discard": { en: "Remove", np: "हटाउनुहोस्" },
  "product.photo.earlier": { en: "Earlier", np: "अघि" },
  "product.photo.empty": {
    en: "No photo yet. The first photo you add is the one customers see.",
    np: "अहिलेसम्म फोटो छैन। पहिलो राखेको फोटो ग्राहकले देख्छन्।",
  },
  "product.photo.full": {
    en: "This product already has {max} photos. Remove one first.",
    np: "यो सामानमा पहिल्यै {max} फोटो छन्। पहिले एउटा हटाउनुहोस्।",
  },
  "product.photo.fullNote": {
    en: "{max} photos is the most a product can have. Delete one to add another.",
    np: "एउटा सामानमा बढीमा {max} फोटो हुन्छ। अर्को थप्न एउटा मेटाउनुहोस्।",
  },
  "product.photo.heic": {
    en: "That is an iPhone HEIC photo, which GoPasal can't use. Take it with the camera button instead, or set Settings › Camera › Formats to Most Compatible.",
    np: "यो iPhone को HEIC फोटो हो, गोपसलले प्रयोग गर्न सक्दैन। बरु क्यामेरा बटनले खिच्नुहोस्, वा Settings › Camera › Formats मा Most Compatible राख्नुहोस्।",
  },
  "product.photo.later": { en: "Later", np: "पछि" },
  "product.photo.libraryDenied": {
    en: "GoPasal needs permission to open your photos.",
    np: "फोटो खोल्न गोपसललाई अनुमति चाहिन्छ।",
  },
  "product.photo.makeCover": { en: "Make this the cover", np: "यसलाई मुख्य फोटो बनाउनुहोस्" },
  "product.photo.take": { en: "Take photo", np: "फोटो खिच्नुहोस्" },
  "product.photo.title": { en: "Photos", np: "फोटो" },
  "product.photo.tooLarge": {
    en: "That photo is {size} MB; the limit is {limit} MB. Take it again with the camera button.",
    np: "त्यो फोटो {size} MB छ; सीमा {limit} MB हो। क्यामेरा बटनले फेरि खिच्नुहोस्।",
  },
  "product.photo.type": {
    en: "Photos must be JPEG, PNG or WebP.",
    np: "फोटो JPEG, PNG वा WebP हुनुपर्छ।",
  },
  "product.photo.unreadable": {
    en: "That photo could not be read. Choose it again.",
    np: "त्यो फोटो पढ्न सकिएन। फेरि छान्नुहोस्।",
  },
  "product.photo.uploading": {
    en: "Sending photo {n} of {total}…",
    np: "{total} मध्ये फोटो {n} पठाउँदै…",
  },

  /* ── remove ──────────────────────────────────────────────────────────── */
  "product.remove.confirmDetail": {
    en: "This can't be undone. The product, its {photos} photo(s) and {options} option(s) are removed for good; past orders keep their receipts. If you might sell it again, hide it instead.",
    np: "फर्काउन मिल्दैन। सामान, त्यसका {photos} फोटो र {options} विकल्प सधैंका लागि हट्छन्; पुराना अर्डरका बिल रहन्छन्। फेरि बेच्न सक्नुहुन्छ भने बरु लुकाउनुहोस्।",
  },
  "product.remove.confirmTitle": {
    en: "Delete “{name}” permanently?",
    np: "“{name}” सधैंका लागि मेटाउने?",
  },
  "product.remove.delete": { en: "Delete permanently", np: "सधैंका लागि मेटाउनुहोस्" },
  "product.remove.detail": {
    en: "Hiding keeps everything and can be undone. Deleting removes the product and its photos for good.",
    np: "लुकाउँदा सबै रहन्छ र फर्काउन सकिन्छ। मेटाउँदा सामान र फोटो सधैंका लागि हट्छन्।",
  },
  "product.remove.hideInstead": { en: "Hide it instead", np: "बरु लुकाउनुहोस्" },
  "product.remove.title": { en: "Stop selling this", np: "यो बेच्न रोक्नुहोस्" },

  /* ── variant ─────────────────────────────────────────────────────────── */
  "product.variant.a11yEdit": {
    en: "Edit option {name}, {count} in total",
    np: "विकल्प {name} बदल्नुहोस्, जम्मा {count}",
  },
  "product.variant.a11yStock": {
    en: "Total count for this option. This replaces the count; it does not add to it.",
    np: "यो विकल्पको जम्मा संख्या। यसले संख्या बदल्छ, थप्दैन।",
  },
  "product.variant.active": { en: "Customers can choose this", np: "ग्राहकले यो छान्न सक्छन्" },
  "product.variant.activeOff": {
    en: "Hidden from customers. Kept here to switch back on.",
    np: "ग्राहकबाट लुकाइएको। फेरि खोल्न यहीँ राखिएको।",
  },
  "product.variant.activeOn": {
    en: "Shown as a choice on the product.",
    np: "सामानमा छनोटको रूपमा देखिन्छ।",
  },
  "product.variant.add": { en: "Add an option", np: "विकल्प थप्नुहोस्" },
  "product.variant.createdButOn": {
    en: "The option was saved, but customers can still choose it. Switch it off and save again.",
    np: "विकल्प सेभ भयो, तर ग्राहकले अझै छान्न सक्छन्। बन्द गरेर फेरि सेभ गर्नुहोस्।",
  },
  "product.variant.delete": { en: "Delete this option", np: "यो विकल्प मेटाउनुहोस्" },
  "product.variant.deleteDetail": {
    en: "This can't be undone. Past receipts keep their lines, but the option is gone. To stop selling it for now, open it and switch “Customers can choose this” off instead.",
    np: "फर्काउन मिल्दैन। पुराना बिलमा लाइन रहन्छ, तर विकल्प हट्छ। अहिलेलाई मात्र बेच्न रोक्न खोलेर “ग्राहकले यो छान्न सक्छन्” बन्द गर्नुहोस्।",
  },
  "product.variant.deleteTitle": {
    en: "Delete the “{name}” option permanently?",
    np: "“{name}” विकल्प सधैंका लागि मेटाउने?",
  },
  "product.variant.editTitle": { en: "Edit option", np: "विकल्प बदल्नुहोस्" },
  "product.variant.issue.nameMissing": {
    en: 'Name the option, e.g. "1 kg".',
    np: 'विकल्पको नाम दिनुहोस्, जस्तै "1 kg"।',
  },
  "product.variant.issue.nameTooLong": {
    en: "An option name can be at most {max} characters.",
    np: "विकल्पको नाम बढीमा {max} अक्षरको हुन सक्छ।",
  },
  "product.variant.issue.skuTooLong": {
    en: "An SKU can be at most {max} characters.",
    np: "SKU बढीमा {max} अक्षरको हुन सक्छ।",
  },
  "product.variant.mrp": { en: "MRP" },
  "product.variant.name": { en: "Option name", np: "विकल्पको नाम" },
  "product.variant.namePlaceholder": { en: "e.g. 1 kg", np: "जस्तै 1 kg" },
  "product.variant.newTitle": { en: "New option", np: "नयाँ विकल्प" },
  "product.variant.none": {
    en: "Sold in sizes? Add options like 500 g and 1 kg, each with its own price and count.",
    np: "साइज अनुसार बेच्नुहुन्छ? 500 g र 1 kg जस्ता विकल्प थप्नुहोस्, हरेकको आफ्नै मूल्य र संख्या।",
  },
  "product.variant.off": { en: "Hidden", np: "लुकाइएको" },
  "product.variant.on": { en: "Offered", np: "बिक्रीमा" },
  "product.variant.sku": { en: "SKU / barcode", np: "SKU / बारकोड" },
  "product.variant.stock": {
    en: "Count (the total, not a change)",
    np: "संख्या (जम्मा, फरक होइन)",
  },
  "product.variant.stockExample": {
    en: "Type the new total, not a change. To add 5 to {from}, type {sum}.",
    np: "फरक होइन, नयाँ जम्मा लेख्नुहोस्। {from} मा 5 थप्न {sum} लेख्नुहोस्।",
  },
  "product.variant.stockHintNew": {
    en: "The whole number you have of this option. Left empty, it's 0.",
    np: "यो विकल्प तपाईंसँग जम्मा कति छ। खाली छोडे 0।",
  },
  "product.variant.stockTitle": { en: "Total on the shelf now", np: "अहिले र्‍याकमा जम्मा" },
  "product.variant.stockTotal": { en: "{count} in total", np: "जम्मा {count}" },
  "product.variant.stockWillBe": {
    en: "Was {from}. Saving sets it to exactly {to} — it doesn't add to it.",
    np: "पहिले {from}। सेभ गर्दा ठ्याक्कै {to} हुन्छ — थपिँदैन।",
  },

  /* ── visibility ──────────────────────────────────────────────────────── */
  "product.visibility.hidden": { en: "Hidden from customers", np: "ग्राहकबाट लुकाइएको" },
  "product.visibility.hiddenDetail": {
    en: "Everything is kept — photos, options, price. Show it again any time.",
    np: "सबै रहन्छ — फोटो, विकल्प, मूल्य। जहिले पनि फेरि देखाउन सकिन्छ।",
  },
  "product.visibility.hide": { en: "Hide from customers", np: "ग्राहकबाट लुकाउनुहोस्" },
  "product.visibility.show": { en: "Show to customers", np: "ग्राहकलाई देखाउनुहोस्" },
  "product.visibility.shown": { en: "Customers can see this", np: "ग्राहकले यो देख्छन्" },
  "product.visibility.shownButEmpty": {
    en: "But none are left, so nobody can buy it until you add stock.",
    np: "तर एउटा पनि बाँकी छैन, स्टक नथपेसम्म कसैले किन्न सक्दैन।",
  },
  "product.visibility.shownDetail": {
    en: "Hiding is instant and can be undone.",
    np: "लुकाउन तुरुन्तै हुन्छ र फर्काउन सकिन्छ।",
  },
};

import type { Dictionary } from "@gopasal/native-ui";

/** Strings for the browse screens. See ./core.ts for the house rules. */
export const browse: Dictionary = {
  /* ── search ──────────────────────────────────────────────────────────── */
  "search.placeholder": {
    en: "Search shops, groceries, medicines…",
    np: "पसल, किराना, औषधि खोज्नुहोस्…",
  },
  "search.label": { en: "Search", np: "खोज्नुहोस्" },
  "search.clear": { en: "Clear search", np: "खोज मेट्नुहोस्" },
  "search.items": { en: "Items", np: "सामान" },
  "search.shops": { en: "Shops", np: "पसलहरू" },
  "search.empty.title": { en: 'Nothing for "{query}"', np: '"{query}" भेटिएन' },
  "search.empty.detail": {
    en: "Nothing matching near {area}. A shop that stocks it may not deliver to this area yet.",
    np: "{area} नजिक मिल्दो केही भेटिएन। यो राख्ने पसलले यो क्षेत्रमा अझै डेलिभरी नगर्न सक्छ।",
  },
  "search.hint": {
    en: "Type at least two letters — a product, a brand, or a shop's name.",
    np: "कम्तीमा दुई अक्षर टाइप गर्नुहोस् — सामान, ब्रान्ड वा पसलको नाम।",
  },
  "search.addToCart": { en: "Add {name} to cart", np: "{name} कार्टमा थप्नुहोस्" },

  /* ── category screen and grid ────────────────────────────────────────── */
  "category.title": { en: "Category", np: "श्रेणी" },
  "category.empty.title": { en: "No {name} here yet", np: "यहाँ अहिले {name} छैन" },
  "category.empty.titleGeneric": { en: "No shops here yet", np: "यहाँ अहिले कुनै पसल छैन" },
  "category.empty.detail": {
    en: "Nothing in this category delivers to {area} at the moment. We add shops neighbourhood by neighbourhood — try another category meanwhile.",
    np: "यो श्रेणीमा अहिले {area} मा डेलिभरी गर्ने कुनै पसल छैन। हामी टोल-टोलमा पसल थप्दै छौं — अहिलेलाई अर्को श्रेणी हेर्नुहोस्।",
  },
  "category.backHome": { en: "Back to home", np: "गृहपृष्ठमा फर्कनुहोस्" },
  "category.shopsNearby.one": { en: "1 shop nearby", np: "नजिकै 1 पसल" },
  "category.shopsNearby.many": { en: "{count} shops nearby", np: "नजिकै {count} पसल" },
  "category.popular": { en: "Popular here", np: "यहाँ धेरै किनिने सामान" },
  "category.addToCart": { en: "Add {name} to cart", np: "{name} कार्टमा थप्नुहोस्" },
  "category.a11y.shops": { en: "{name} shops", np: "{name} पसलहरू" },

  // The shortened tile labels. The slug's own name is server data and is left
  // alone; these four are the app's own abbreviations of it.
  "category.short.vegetables": { en: "Veg & Fruits", np: "तरकारी र फलफूल" },
  "category.short.meatFish": { en: "Meat & Fish", np: "मासु र माछा" },
  "category.short.printCopy": { en: "Stationery & Photocopy", np: "स्टेसनरी र फोटोकपी" },
  "category.short.restaurant": { en: "Restaurants", np: "रेस्टुरेन्ट" },

  /* ── saved ───────────────────────────────────────────────────────────── */
  "saved.signIn.title": {
    en: "Sign in to see what you saved",
    np: "सुरक्षित गरेका हेर्न साइन इन गर्नुहोस्",
  },
  "saved.tab.shops": { en: "Shops", np: "पसलहरू" },
  "saved.tab.shopsCount": { en: "Shops ({count})", np: "पसलहरू ({count})" },
  "saved.tab.products": { en: "Products", np: "सामान" },
  "saved.tab.productsCount": { en: "Products ({count})", np: "सामान ({count})" },
  "saved.a11y.showShops": { en: "Show saved shops", np: "सुरक्षित पसलहरू देखाउनुहोस्" },
  "saved.a11y.showProducts": { en: "Show saved products", np: "सुरक्षित सामान देखाउनुहोस्" },
  "saved.empty.title": { en: "Nothing saved yet", np: "अहिलेसम्म केही सुरक्षित छैन" },
  "saved.empty.detail": {
    en: "Tap the heart on a shop to keep it here — handy for the one you order from every week.",
    np: "पसलको मुटुमा थिच्नुहोस्, यहाँ रहन्छ — हरेक हप्ता अर्डर गर्ने पसलका लागि सजिलो।",
  },
  "saved.aShop": { en: "a shop", np: "एउटा पसल" },
  "saved.shopClosed": { en: "Shop closed", np: "पसल बन्द" },
  "saved.addToCart": { en: "Add {name} to cart", np: "{name} कार्टमा थप्नुहोस्" },

  /* ── the shop row ────────────────────────────────────────────────────── */
  "shopcard.opens": { en: "Opens {hours}", np: "{hours} मा खुल्छ" },
  "shopcard.metres": { en: "{value} m", np: "{value} मि" },
  "shopcard.kilometres": { en: "{value} km", np: "{value} कि.मि." },

  /* ── offers ──────────────────────────────────────────────────────────── */
  "offer.platform": { en: "GOPASAL OFFER", np: "गोपसल अफर" },
  "offer.flat": { en: "{amount} off", np: "{amount} छुट" },
  "offer.percent": { en: "{value}% off", np: "{value}% छुट" },
  "offer.minOrder": { en: "on orders above {amount}", np: "{amount} माथिको अर्डरमा" },
  "offer.anyOrder": { en: "on any order", np: "जुनसुकै अर्डरमा" },
  "offer.upTo": { en: "up to {amount}", np: "बढीमा {amount}" },
  "offer.shop": { en: "SHOP OFFER", np: "पसलको अफर" },
  "offer.copy": { en: "COPY", np: "कपी" },
  "offer.copied": { en: "COPIED", np: "कपी भयो" },
  "offer.a11y": {
    en: "{title}, {detail}. Tap to copy code {code}",
    np: "{title}, {detail}। कोड {code} कपी गर्न थिच्नुहोस्।",
  },
};

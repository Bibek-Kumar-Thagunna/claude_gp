/** Bilingual dictionary — English + Nepali (Devanagari). */

export type Lang = "en" | "np";

export const LANGS: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "np", label: "Nepali", native: "नेपाली" },
];

export const dict = {
  brandTagline: {
    en: "Your neighbourhood shops, online.",
    np: "तपाईंको छिमेकका पसलहरू, अनलाइन।",
  },
  heroTitle: {
    en: "Every local shop, one tap away.",
    np: "हरेक स्थानीय पसल, एक ट्यापमा।",
  },
  heroSub: {
    en: "Discover trusted shops near you — kirana, pharmacy, fresh vegetables and more. Order online, connect directly with the shopkeeper, and pay on delivery.",
    np: "तपाईं नजिकका भरपर्दो पसलहरू पत्ता लगाउनुहोस् — किराना, फार्मेसी, ताजा तरकारी र थप। अनलाइन अर्डर गर्नुहोस्, पसले सँग सिधै कुरा गर्नुहोस्, र डेलिभरीमा तिर्नुहोस्।",
  },
  searchPlaceholder: {
    en: "Search shops, groceries, medicines…",
    np: "पसल, किराना, औषधि खोज्नुहोस्…",
  },
  useLocation: { en: "Set your location", np: "स्थान छान्नुहोस्" },
  shopsNearYou: { en: "Shops near you", np: "तपाईं नजिकका पसल" },
  browseCategories: { en: "Browse by category", np: "श्रेणी अनुसार हेर्नुहोस्" },
  popularNow: { en: "Popular right now", np: "अहिले लोकप्रिय" },
  viewShop: { en: "View shop", np: "पसल हेर्नुहोस्" },
  addToCart: { en: "Add", np: "थप्नुहोस्" },
  openNow: { en: "Open now", np: "अहिले खुला" },
  closed: { en: "Closed", np: "बन्द" },
  selfDelivery: { en: "Delivered by the shop", np: "पसलले नै पुर्‍याउँछ" },
  codAvailable: { en: "Cash on delivery", np: "डेलिभरीमा नगद" },
  contactShop: { en: "Contact shopkeeper", np: "पसलेसँग सम्पर्क" },
  becomeSeller: { en: "Sell on GoPasal", np: "गोपसलमा बेच्नुहोस्" },
  login: { en: "Log in", np: "लग इन" },
  loginOrSignup: { en: "Log in or sign up", np: "लग इन वा साइन अप" },
  signup: { en: "Sign up", np: "साइन अप" },
  account: { en: "Account", np: "खाता" },
  orders: { en: "My orders", np: "मेरा अर्डर" },
  howItWorks: { en: "How it works", np: "कसरी काम गर्छ" },
  getApp: { en: "Get the app", np: "एप डाउनलोड" },
  footerRights: {
    en: "All rights reserved.",
    np: "सर्वाधिकार सुरक्षित।",
  },
} as const;

export type DictKey = keyof typeof dict;

export function t(key: DictKey, lang: Lang): string {
  return dict[key][lang];
}

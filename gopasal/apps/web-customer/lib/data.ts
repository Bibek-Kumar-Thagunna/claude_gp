/**
 * Mock catalogue for the customer website.
 * Replace with API calls once the backend lands — shapes mirror the planned
 * REST/GraphQL contract (Store, Category, Product).
 */

export type Category = {
  slug: string;
  en: string;
  np: string;
  icon: string; // lucide icon name
  hue: string; // tailwind bg helper
};

export type Product = {
  id: string;
  name: string;
  np?: string;
  price: number;
  mrp?: number;
  unit: string;
  image?: string;
  tag?: string;
};

export type Store = {
  slug: string;
  name: string;
  np: string;
  category: string;
  area: string; // Kathmandu-valley locality
  rating: number;
  reviews: number;
  distanceKm: number;
  isOpen: boolean;
  hours: string;
  cover: string; // gradient token
  emoji: string;
  verified: boolean;
  minOrder: number;
  products: Product[];
};

export const CATEGORIES: Category[] = [
  { slug: "grocery", en: "Grocery & Kirana", np: "किराना", icon: "ShoppingBasket", hue: "bg-crimson-50" },
  { slug: "vegetables", en: "Fruits & Vegetables", np: "तरकारी", icon: "Carrot", hue: "bg-[#EAF7EF]" },
  { slug: "pharmacy", en: "Pharmacy", np: "फार्मेसी", icon: "Pill", hue: "bg-[#E9EEFF]" },
  { slug: "bakery", en: "Bakery & Sweets", np: "बेकरी", icon: "Croissant", hue: "bg-[#FFF3DF]" },
  { slug: "meat", en: "Meat & Fish", np: "मासु", icon: "Fish", hue: "bg-crimson-50" },
  { slug: "dairy", en: "Dairy & Eggs", np: "डेरी", icon: "Milk", hue: "bg-[#EEF6FF]" },
  { slug: "stationery", en: "Stationery", np: "स्टेशनरी", icon: "PencilRuler", hue: "bg-[#F3EEFF]" },
  { slug: "electronics", en: "Electronics", np: "इलेक्ट्रोनिक्स", icon: "Plug", hue: "bg-[#EAF7EF]" },
];

const P = (id: string, name: string, price: number, unit: string, extra: Partial<Product> = {}): Product => ({
  id,
  name,
  price,
  unit,
  ...extra,
});

export const STORES: Store[] = [
  {
    slug: "namaste-kirana",
    name: "Namaste Kirana Pasal",
    np: "नमस्ते किराना पसल",
    category: "grocery",
    area: "Baneshwor, Kathmandu",
    rating: 4.8,
    reviews: 1240,
    distanceKm: 0.6,
    isOpen: true,
    hours: "7:00 AM – 9:00 PM",
    cover: "from-crimson-500 to-crimson-700",
    emoji: "🛒",
    verified: true,
    minOrder: 200,
    products: [
      P("g1", "Basmati Rice (Tilottama)", 185, "per kg", { mrp: 210, tag: "Bestseller" }),
      P("g2", "Sunflower Oil (Dhara)", 320, "1 L", { mrp: 355 }),
      P("g3", "Wai Wai Noodles", 20, "per pack", { tag: "Popular" }),
      P("g4", "Sugar (Shree Ram)", 95, "per kg"),
      P("g5", "Masala Tea (Tokla)", 140, "200 g"),
      P("g6", "Lentils / Musuro Dal", 165, "per kg"),
    ],
  },
  {
    slug: "himalayan-fresh",
    name: "Himalayan Fresh Vegetables",
    np: "हिमालयन ताजा तरकारी",
    category: "vegetables",
    area: "Patan, Lalitpur",
    rating: 4.7,
    reviews: 860,
    distanceKm: 1.2,
    isOpen: true,
    hours: "6:00 AM – 8:00 PM",
    cover: "from-[#0E9F6E] to-[#0B7E58]",
    emoji: "🥬",
    verified: true,
    minOrder: 150,
    products: [
      P("v1", "Tomato (Fresh)", 80, "per kg", { tag: "Fresh today" }),
      P("v2", "Cauliflower / Kauli", 70, "per kg"),
      P("v3", "Potato / Aalu", 60, "per kg", { mrp: 75 }),
      P("v4", "Green Chilli / Khursani", 120, "per kg"),
      P("v5", "Onion / Pyaj", 90, "per kg"),
      P("v6", "Spinach / Palungo", 40, "per bunch"),
    ],
  },
  {
    slug: "care-pharmacy",
    name: "Care Pharmacy & Wellness",
    np: "केयर फार्मेसी",
    category: "pharmacy",
    area: "Pulchowk, Lalitpur",
    rating: 4.9,
    reviews: 540,
    distanceKm: 0.9,
    isOpen: true,
    hours: "8:00 AM – 10:00 PM",
    cover: "from-[#2540E8] to-[#1B31C0]",
    emoji: "💊",
    verified: true,
    minOrder: 0,
    products: [
      P("p1", "Paracetamol 500mg", 25, "10 tablets"),
      P("p2", "Hand Sanitiser 200ml", 150, "each"),
      P("p3", "Vitamin C 1000mg", 380, "20 tablets", { tag: "Popular" }),
      P("p4", "Digital Thermometer", 450, "each"),
      P("p5", "First-aid Band", 90, "pack"),
      P("p6", "ORS Sachet", 18, "each"),
    ],
  },
  {
    slug: "sunrise-bakery",
    name: "Sunrise Bakery & Sweets",
    np: "सनराइज बेकरी",
    category: "bakery",
    area: "Boudha, Kathmandu",
    rating: 4.6,
    reviews: 410,
    distanceKm: 2.1,
    isOpen: false,
    hours: "9:00 AM – 7:00 PM",
    cover: "from-[#F6A609] to-[#D98B00]",
    emoji: "🥐",
    verified: false,
    minOrder: 100,
    products: [
      P("b1", "Butter Croissant", 90, "each", { tag: "Fresh" }),
      P("b2", "Chocolate Pastry", 120, "each"),
      P("b3", "Whole Wheat Bread", 85, "loaf"),
      P("b4", "Sel Roti (6 pcs)", 130, "pack"),
      P("b5", "Birthday Cake 1kg", 950, "each"),
      P("b6", "Cookies (Assorted)", 220, "250 g"),
    ],
  },
];

export function storeBySlug(slug: string): Store | undefined {
  return STORES.find((s) => s.slug === slug);
}

export function storesByCategory(category: string): Store[] {
  return STORES.filter((s) => s.category === category);
}

export const POPULAR: { product: Product; store: Store }[] = STORES.flatMap((s) =>
  s.products
    .filter((p) => p.tag)
    .slice(0, 2)
    .map((product) => ({ product, store: s })),
).slice(0, 8);

/** Customer storefront view types. Every value is mapped from an API payload. */
export type Category = {
  id: string;
  slug: string;
  en: string;
  np: string;
  icon: string;
  hue: string;
};

export type ProductVariant = {
  id: string;
  name: string;
  price: number;
  mrp?: number | null;
  stock: number;
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
  variants: ProductVariant[];
  distanceMeters?: number | null;
  shop?: Pick<Store, "id" | "slug" | "name" | "isOpen">;
};

export type Store = {
  id: string;
  slug: string;
  name: string;
  np: string;
  category: string;
  categoryId?: string;
  area: string;
  rating: number;
  reviews: number;
  isOpen: boolean;
  hours: string;
  cover: string;
  emoji: string;
  verified: boolean;
  minOrder: number;
  deliveryRadiusKm?: number;
  distanceMeters?: number | null;
  phone?: string;
  products: Product[];
};

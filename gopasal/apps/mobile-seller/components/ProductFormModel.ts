import type { ProductRow } from "@gopasal/native-data/seller";
import {
  MAX_IMAGE_BYTES,
  PRODUCT_IMAGE_LIMIT,
  PRODUCT_LIMITS,
  type ImageIssue,
  type PickedImage,
  type ProductCreateInput,
  type ProductIssue,
  type ProductPatch,
  type VariantIssue,
} from "@gopasal/native-data/seller-catalog";
import { ApiError } from "@gopasal/native-data";
import { interpolate, type I18n } from "@gopasal/native-ui";

/**
 * The product form as typed, and the two ways it becomes a request.
 *
 * Every field is held as the string the keypad produced, not as the number it
 * will become. Parsing on every keystroke would turn a half-typed "1" of "120"
 * into a price the screen then reformats under the thumb, and it would make
 * "empty" and "zero" the same state — which for MRP they are not: empty means
 * "there is no printed price", zero means "the printed price is free".
 */
export type ProductForm = {
  name: string;
  nameNp: string;
  description: string;
  categoryId: string | null;
  price: string;
  mrp: string;
  unit: string;
  /** Comma-separated, as typed. Split only when a request is built. */
  tags: string;
  trackStock: boolean;
  /** Create only. An edit changes the count through the counting sheet. */
  stock: string;
};

export const EMPTY_PRODUCT_FORM: ProductForm = {
  name: "",
  nameNp: "",
  description: "",
  categoryId: null,
  price: "",
  mrp: "",
  unit: "",
  tags: "",
  trackStock: false,
  stock: "",
};

type T = I18n["t"];

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/**
 * Keep only the digits, reading Devanagari numerals as their Western twins.
 *
 * A Nepali keyboard types ०-९, and a shopkeeper switching layouts to enter a
 * price is a shopkeeper who types it wrong. The API takes Western digits and
 * the app displays them, so the conversion happens here, at the input, where it
 * is visible, rather than being refused later as "not a number".
 */
export function digitsOnly(text: string): string {
  let out = "";
  for (const ch of text) {
    const devanagari = DEVANAGARI_DIGITS.indexOf(ch);
    if (devanagari >= 0) out += String(devanagari);
    else if (ch >= "0" && ch <= "9") out += ch;
  }
  // Leading zeros are stripped because "007" parses to 7 and the box should say
  // what will be sent. A lone "0" survives — it is a real answer for a count.
  return out.replace(/^0+(?=\d)/, "");
}

/**
 * An empty required number becomes NaN rather than `undefined`, so that
 * `productDraftIssues` sees a value it can refuse. `undefined` on a PATCH means
 * "leave it alone", which would let a cleared price box save silently as no
 * change at all.
 */
export const wholeOrNaN = (text: string): number => (text === "" ? Number.NaN : Number.parseInt(text, 10));

export function splitTags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const tag = raw.trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

export function formFromProduct(product: ProductRow): ProductForm {
  return {
    name: product.name,
    nameNp: product.nameNp ?? "",
    description: product.description ?? "",
    categoryId: product.categoryId,
    price: String(product.price),
    mrp: product.mrp == null ? "" : String(product.mrp),
    unit: product.unit,
    tags: product.tags.join(", "),
    trackStock: product.trackStock,
    stock: "",
  };
}

/**
 * The create body. Optional keys are omitted rather than sent empty, because the
 * service defaults an absent `unit` to "1 pc" and would store an empty string
 * as exactly that — an empty unit.
 */
export function createInput(form: ProductForm): ProductCreateInput {
  const input: ProductCreateInput = { name: form.name.trim(), price: wholeOrNaN(form.price) };
  const nameNp = form.nameNp.trim();
  const description = form.description.trim();
  const unit = form.unit.trim();
  const tags = splitTags(form.tags);
  if (nameNp) input.nameNp = nameNp;
  if (description) input.description = description;
  if (form.categoryId) input.categoryId = form.categoryId;
  if (form.mrp !== "") input.mrp = wholeOrNaN(form.mrp);
  if (unit) input.unit = unit;
  if (tags.length > 0) input.tags = tags;
  if (form.trackStock) {
    input.trackStock = true;
    if (form.stock !== "") input.stock = wholeOrNaN(form.stock);
  }
  return input;
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * Only what changed, never a snapshot.
 *
 * The PATCH is partial on purpose: a snapshot would rewrite every column,
 * including the price a colleague corrected while this form sat open. A field
 * the shopkeeper did not touch is not in the body and cannot overwrite anyone.
 */
export function productPatch(form: ProductForm, product: ProductRow): ProductPatch {
  const patch: ProductPatch = {};
  const name = form.name.trim();
  if (name !== product.name) patch.name = name;

  const nameNp = form.nameNp.trim() || null;
  if (nameNp !== (product.nameNp ?? null)) patch.nameNp = nameNp;

  const description = form.description.trim() || null;
  if (description !== (product.description ?? null)) patch.description = description;

  if (form.categoryId !== (product.categoryId ?? null)) patch.categoryId = form.categoryId;

  const price = wholeOrNaN(form.price);
  if (price !== product.price) patch.price = price;

  // `null` clears the MRP — one of the four columns where the API reads null as
  // "empty it" rather than "leave it".
  const mrp = form.mrp === "" ? null : wholeOrNaN(form.mrp);
  if (mrp !== (product.mrp ?? null)) patch.mrp = mrp;

  const unit = form.unit.trim();
  if (unit !== product.unit) patch.unit = unit;

  const tags = splitTags(form.tags);
  if (!sameList(tags, product.tags)) patch.tags = tags;

  if (form.trackStock !== product.trackStock) patch.trackStock = form.trackStock;
  return patch;
}

export function hasChanges(patch: ProductPatch): boolean {
  return Object.keys(patch).length > 0;
}

/* ── words for problems ───────────────────────────────────────────────────── */

type IssueText<F extends string> = {
  field: F;
  key: string;
  en: string;
  vars?: Record<string, string | number>;
};

/**
 * The validators' English, each with a key of its own.
 *
 * `productDraftIssues` answers in English because it is shared with the web
 * console. Matching its exact sentence here (rather than, say, only its field)
 * is what lets one field carry two different messages — "give it a name" and
 * "that name is too long" — under two different translations. A sentence this
 * table does not know falls through to the validator's own words, so a new rule
 * upstream is shown in English rather than hidden.
 */
const PRODUCT_ISSUE_TEXT: IssueText<ProductIssue["field"]>[] = [
  { field: "name", key: "product.issue.nameMissing", en: "Give the product a name." },
  {
    field: "name",
    key: "product.issue.nameTooLong",
    en: "A name can be at most {max} characters.",
    vars: { max: PRODUCT_LIMITS.nameMax },
  },
  {
    field: "nameNp",
    key: "product.issue.nameNpTooLong",
    en: "The Nepali name can be at most {max} characters.",
    vars: { max: PRODUCT_LIMITS.nameMax },
  },
  {
    field: "description",
    key: "product.issue.descriptionTooLong",
    en: "The description can be at most {max} characters.",
    vars: { max: PRODUCT_LIMITS.descriptionMax },
  },
  { field: "categoryId", key: "product.issue.category", en: "That category id is not a real one." },
  { field: "price", key: "product.issue.price", en: "Enter the price in whole rupees." },
  { field: "mrp", key: "product.issue.mrp", en: "Enter the MRP in whole rupees, or leave it empty." },
  { field: "unit", key: "product.issue.unitMissing", en: `Say what one of these is, e.g. "1 kg".` },
  {
    field: "unit",
    key: "product.issue.unitTooLong",
    en: "A unit can be at most {max} characters.",
    vars: { max: PRODUCT_LIMITS.unitMax },
  },
  {
    field: "tags",
    key: "product.issue.tagCount",
    en: "At most {max} tags.",
    vars: { max: PRODUCT_LIMITS.tagCount },
  },
  {
    field: "tags",
    key: "product.issue.tagTooLong",
    en: "Each tag can be at most {max} characters.",
    vars: { max: PRODUCT_LIMITS.tagMax },
  },
  { field: "stock", key: "product.issue.stock", en: "A count is a whole number, zero or more." },
];

const VARIANT_ISSUE_TEXT: IssueText<VariantIssue["field"]>[] = [
  { field: "name", key: "product.variant.issue.nameMissing", en: `Name the option, e.g. "1 kg".` },
  {
    field: "name",
    key: "product.variant.issue.nameTooLong",
    en: "An option name can be at most {max} characters.",
    vars: { max: PRODUCT_LIMITS.variantNameMax },
  },
  {
    field: "sku",
    key: "product.variant.issue.skuTooLong",
    en: "An SKU can be at most {max} characters.",
    vars: { max: PRODUCT_LIMITS.variantSkuMax },
  },
  { field: "price", key: "product.issue.price", en: "Enter the price in whole rupees." },
  { field: "mrp", key: "product.issue.mrp", en: "Enter the MRP in whole rupees, or leave it empty." },
  { field: "stock", key: "product.issue.stock", en: "A count is a whole number, zero or more." },
];

function issueText<F extends string>(
  t: T,
  table: IssueText<F>[],
  prefix: string,
  issue: { field: F; message: string },
): string {
  const known = table.find(
    (entry) => entry.field === issue.field && interpolate(entry.en, entry.vars) === issue.message,
  );
  if (known) return t(known.key, known.vars, known.en);
  return t(`${prefix}.${issue.field}`, undefined, issue.message);
}

/** First problem per field, translated — a field shows one sentence, not a list. */
export function productProblems(t: T, issues: ProductIssue[]): Partial<Record<ProductIssue["field"], string>> {
  const out: Partial<Record<ProductIssue["field"], string>> = {};
  for (const issue of issues) {
    out[issue.field] ??= issueText(t, PRODUCT_ISSUE_TEXT, "product.issue", issue);
  }
  return out;
}

export function variantProblems(t: T, issues: VariantIssue[]): Partial<Record<VariantIssue["field"], string>> {
  const out: Partial<Record<VariantIssue["field"], string>> = {};
  for (const issue of issues) {
    out[issue.field] ??= issueText(t, VARIANT_ISSUE_TEXT, "product.variant.issue", issue);
  }
  return out;
}

const MIB = 1024 * 1024;

/**
 * Why a picked photo was refused, in words a shopkeeper can act on.
 *
 * HEIC gets its own sentence because it is the one refusal a shopkeeper cannot
 * understand from "JPEG, PNG or WebP": their phone never told them the photo was
 * anything else. The fix is on the phone, so the sentence says where.
 */
export function photoIssueText(t: T, issue: ImageIssue, image: PickedImage): string {
  switch (issue.reason) {
    case "COUNT":
      return t(
        "product.photo.full",
        { max: PRODUCT_IMAGE_LIMIT },
        "This product already has {max} photos. Remove one first.",
      );
    case "NO_URI":
      return t("product.photo.unreadable", undefined, "That photo could not be read. Choose it again.");
    case "TOO_LARGE":
      return t(
        "product.photo.tooLarge",
        {
          size: ((image.fileSize ?? 0) / MIB).toFixed(1),
          limit: Math.floor(MAX_IMAGE_BYTES / MIB),
        },
        "That photo is {size} MB; the limit is {limit} MB. Take it again with the camera button.",
      );
    case "TYPE": {
      const declared = `${image.mimeType ?? ""} ${image.fileName ?? ""}`.toLowerCase();
      if (declared.includes("heic") || declared.includes("heif")) {
        return t(
          "product.photo.heic",
          undefined,
          "That is an iPhone HEIC photo, which GoPasal can't use. Take it with the camera button instead, or set Settings › Camera › Formats to Most Compatible.",
        );
      }
      return t("product.photo.type", undefined, "Photos must be JPEG, PNG or WebP.");
    }
  }
}

/**
 * A failed write, said once.
 *
 * A 4xx from the catalogue routes carries a sentence written for a seller —
 * "This product already has 8 photos. Remove one first." — and replacing it with
 * a generic line would throw away the only useful part. Anything else (network,
 * 5xx) gets the app's own words, because the server's are about the server.
 */
export function writeErrorText(t: T, cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.status === 0) {
      return t(
        "product.error.offline",
        undefined,
        "Couldn't reach GoPasal. Check your connection and try again.",
      );
    }
    if (cause.status === 403) {
      return t(
        "product.error.forbidden",
        undefined,
        "You don't have permission to do that at this shop.",
      );
    }
    if (cause.status >= 400 && cause.status < 500 && cause.status !== 401 && cause.message) {
      return cause.message;
    }
  }
  return t("common.somethingWrong");
}

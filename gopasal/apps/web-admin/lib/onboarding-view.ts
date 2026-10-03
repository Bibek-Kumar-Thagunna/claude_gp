/**
 * How an onboarding application is *presented to a reviewer* — field names in
 * words, document labels, timeline phrasing.
 *
 * The API decides what is missing, what is editable and what a status means; this
 * file only decides what to call things. Where a list is copied from the server
 * (`EDITABLE_FIELDS`, the required document set) it is a convenience for building
 * a picker, never the authority — the server validates the same list again and
 * its refusal is what gets displayed.
 *
 * A sister file exists in the seller console. The two are deliberately separate
 * copies: the wording differs (a reviewer reads "Owner's citizenship number", the
 * applicant reads "Your citizenship number") and the two consoles have no shared
 * workspace package. Keep the *keys* in step; the prose is free to differ.
 */

import type { DocumentKind, PayoutMethod } from "./api/types";

/** `EDITABLE_FIELDS` from `apps/api/src/modules/onboarding/application-state.ts`. */
export const EDITABLE_FIELDS = [
  "shopName",
  "shopNameNp",
  "categoryId",
  "description",
  "contactPhone",
  "contactEmail",
  "area",
  "fullAddress",
  "deliveryRadiusKm",
  "hours",
  "soloMode",
  "ownerName",
  "ownerNameNp",
  "citizenshipNo",
  "registrationNo",
  "panNo",
  "vatNo",
  "payoutMethod",
  "bankName",
  "bankBranch",
  "bankAccountNo",
  "bankAccountName",
  "walletNumber",
  "documents",
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const FIELD_LABELS: Record<string, string> = {
  shopName: "Shop name",
  shopNameNp: "Shop name in Nepali",
  categoryId: "Shop type",
  description: "About the shop",
  contactPhone: "Shop phone number",
  contactEmail: "Shop email",
  area: "Area",
  fullAddress: "Full address",
  lat: "Map location",
  lng: "Map location",
  location: "Verified shop location",
  deliveryRadiusKm: "Delivery coverage",
  hours: "Opening hours",
  soloMode: "Solo mode",
  ownerName: "Owner's full name",
  ownerNameNp: "Owner's name in Nepali",
  citizenshipNo: "Citizenship number",
  registrationNo: "Business registration number",
  panNo: "PAN number",
  vatNo: "VAT number",
  payoutMethod: "Payout method",
  bankName: "Bank name",
  bankBranch: "Bank branch",
  bankAccountNo: "Account number",
  bankAccountName: "Account holder's name",
  walletNumber: "Wallet number",
  documents: "Documents",
};

export function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? name;
}

/**
 * The field groups the request-changes picker offers, so a reviewer ticks
 * "Citizenship number" rather than typing `citizenshipNo`.
 */
export const FIELD_GROUPS: { section: string; fields: EditableField[] }[] = [
  {
    section: "Shop",
    fields: ["shopName", "shopNameNp", "categoryId", "description", "hours", "soloMode"],
  },
  {
    section: "Contact & location",
    fields: ["contactPhone", "contactEmail", "area", "fullAddress", "deliveryRadiusKm"],
  },
  {
    section: "Owner & registration",
    fields: ["ownerName", "ownerNameNp", "citizenshipNo", "registrationNo", "panNo", "vatNo"],
  },
  {
    section: "Payout",
    fields: [
      "payoutMethod",
      "bankName",
      "bankBranch",
      "bankAccountNo",
      "bankAccountName",
      "walletNumber",
    ],
  },
  { section: "Papers", fields: ["documents"] },
];

const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  CITIZENSHIP_FRONT: "Citizenship — front",
  CITIZENSHIP_BACK: "Citizenship — back",
  PAN_CERTIFICATE: "Business PAN certificate",
  VAT_CERTIFICATE: "VAT certificate",
  BUSINESS_LICENCE: "Business registration certificate",
  REGULATORY_LICENCE: "Sector regulator licence",
  SHOP_PHOTO: "Photo of the shop",
  OWNER_PHOTO: "Photo of the owner",
  BANK_PROOF: "Bank account proof",
  OTHER: "Other document",
};

export function documentLabel(kind: DocumentKind): string {
  return DOCUMENT_LABELS[kind];
}

/**
 * Same labels, for a kind that arrived as a bare `string` — the `missingDocuments`
 * array on an error envelope, which is untyped JSON. An unrecognised value is
 * shown as itself rather than swallowed: a reviewer who sees `SOMETHING_NEW` can
 * report it, whereas a blank line hides a server change.
 */
export function documentLabelOf(kind: string): string {
  const known: Record<string, string> = DOCUMENT_LABELS;
  return known[kind] ?? kind.replace(/_/g, " ").toLowerCase();
}

/**
 * What a reviewer should expect to see. Mirrors `ALWAYS_REQUIRED_DOCUMENTS` plus
 * the conditional bank proof; the server's `missingDocuments` is still the answer
 * that decides whether approval is allowed.
 */
export function requiredDocumentKinds(
  payoutMethod: PayoutMethod | null,
  vatNo?: string | null,
  categorySlug?: string | null,
): DocumentKind[] {
  const required: DocumentKind[] = [
    "CITIZENSHIP_FRONT",
    "CITIZENSHIP_BACK",
    "BUSINESS_LICENCE",
    "PAN_CERTIFICATE",
    "SHOP_PHOTO",
  ];
  if (vatNo?.trim()) required.push("VAT_CERTIFICATE");
  if (categorySlug === "pharmacy") required.push("REGULATORY_LICENCE");
  if (payoutMethod === "BANK") required.push("BANK_PROOF");
  return required;
}

const PAYOUT_LABELS: Record<PayoutMethod, string> = {
  BANK: "Bank transfer",
  ESEWA: "eSewa",
  KHALTI: "Khalti",
};

export function payoutLabel(method: PayoutMethod | null): string {
  return method ? PAYOUT_LABELS[method] : "Not chosen";
}

/** Timeline entry types the onboarding module writes, in plain words. */
const TIMELINE_LABELS: Record<string, string> = {
  created: "Application started",
  submitted: "Sent for review",
  resubmitted: "Sent again after changes",
  withdrawn: "Withdrawn by the applicant",
  picked_up: "Picked up by a reviewer",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Not approved",
  document_uploaded: "Document attached",
  document_replaced: "Document replaced",
  document_removed: "Document removed",
  document_accepted: "Document accepted",
  document_rejected: "Document rejected",
};

export function timelineLabel(type: string): string {
  return TIMELINE_LABELS[type] ?? type.replace(/_/g, " ");
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "size unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Long-form date for review notes and timeline rows. */
export function fullDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

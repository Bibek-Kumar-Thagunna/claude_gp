/**
 * How onboarding data is presented — labels, required document slots, and the
 * per-status copy.
 *
 * The API decides what is missing and what may be edited; this file only decides
 * what to call things. Where a rule is duplicated from the server (the required
 * document set, the upload ceiling) it is a *pre-check* that saves a round trip,
 * never the authority: the server refuses again on its own terms, and its answer
 * is what the UI displays.
 */

import type { ApplicationStatus, DocumentKind, PayoutMethod } from "./api/types";

/**
 * `EDITABLE_FIELDS` from the API's `application-state.ts`, in human words.
 *
 * Reached only through `fieldLabel` below, so a screen cannot half-use the table:
 * every name the API hands back — including one added server-side that this build
 * has never seen — goes through the same fallback and is shown either way.
 */
const FIELD_LABELS: Record<string, string> = {
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
  deliveryRadiusKm: "Delivery coverage",
  hours: "Opening hours",
  soloMode: "Solo mode",
  ownerName: "Owner's full name",
  ownerNameNp: "Owner's name in Nepali",
  citizenshipNo: "Citizenship number",
  registrationNo: "Business registration number",
  panNo: "PAN number",
  vatNo: "VAT number",
  payoutMethod: "How you want to be paid",
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

export type DocumentSlot = {
  kind: DocumentKind;
  label: string;
  hint: string;
};

const DOCUMENT_META: Record<DocumentKind, { label: string; hint: string }> = {
  CITIZENSHIP_FRONT: {
    label: "Citizenship — front",
    hint: "The side with your photo and citizenship number.",
  },
  CITIZENSHIP_BACK: {
    label: "Citizenship — back",
    hint: "The reverse side, showing the issue details.",
  },
  SHOP_PHOTO: {
    label: "Photo of the shop",
    hint: "A clear photo of the shopfront, taken from outside.",
  },
  BANK_PROOF: {
    label: "Bank account proof",
    hint: "A cheque photo, passbook page or statement header showing the account number and name.",
  },
  PAN_CERTIFICATE: { label: "PAN certificate", hint: "If your business is registered for PAN." },
  VAT_CERTIFICATE: { label: "VAT certificate", hint: "Only if you are VAT registered." },
  BUSINESS_LICENCE: {
    label: "Business registration",
    hint: "Ward or department registration certificate, if you have one.",
  },
  OWNER_PHOTO: { label: "Photo of the owner", hint: "Helps our team recognise you on a visit." },
  OTHER: { label: "Anything else", hint: "Any other document you think supports your application." },
};

export function documentLabel(kind: DocumentKind): string {
  return DOCUMENT_META[kind].label;
}

export function documentSlot(kind: DocumentKind): DocumentSlot {
  return { kind, ...DOCUMENT_META[kind] };
}

/**
 * The document slots the API will insist on, mirroring `ALWAYS_REQUIRED_DOCUMENTS`
 * plus the conditional bank proof. Shown as required slots up front so a seller
 * can see the whole job before starting it, rather than discovering the fourth
 * one only when submit is refused.
 */
export function requiredDocumentKinds(payoutMethod: PayoutMethod | null): DocumentKind[] {
  const base: DocumentKind[] = ["CITIZENSHIP_FRONT", "CITIZENSHIP_BACK", "SHOP_PHOTO"];
  return payoutMethod === "BANK" ? [...base, "BANK_PROOF"] : base;
}

export const OPTIONAL_DOCUMENT_KINDS: DocumentKind[] = [
  "PAN_CERTIFICATE",
  "VAT_CERTIFICATE",
  "BUSINESS_LICENCE",
  "OWNER_PHOTO",
  "OTHER",
];

/** Mirrors `upload-rules.ts`. The server sniffs magic bytes; this is just the picker filter. */
export const ACCEPTED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const ACCEPT_ATTRIBUTE = ".jpg,.jpeg,.png,.webp,.pdf";
/** `UPLOAD_MAX_DOCUMENT_BYTES` default — 10 MiB. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** `sizeBytes` is nullable on the API's `DocumentView`, so this accepts null. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "size unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type StatusTone = "crimson" | "green" | "marigold" | "blue" | "ink" | "red";

export type StatusPresentation = {
  tone: StatusTone;
  title: string;
  /** What is true right now, and what the seller should do about it. */
  description: string;
};

/**
 * Copy for all seven `ApplicationStatus` values. No promise of a review time is
 * made anywhere — GoPasal does not commit to turnaround, and inventing one here
 * would be the same mistake as promising a delivery ETA.
 */
export function statusPresentation(status: ApplicationStatus): StatusPresentation {
  switch (status) {
    case "DRAFT":
      return {
        tone: "ink",
        title: "Draft — not sent yet",
        description:
          "Nobody at GoPasal can see this yet. Fill in the details, attach your documents, then send it for review.",
      };
    case "SUBMITTED":
      return {
        tone: "blue",
        title: "Sent for review",
        description:
          "Your application is in the queue. You cannot edit it while it is being looked at — if something needs fixing, our team will ask you for it here.",
      };
    case "UNDER_REVIEW":
      return {
        tone: "blue",
        title: "Being reviewed",
        description:
          "Someone from GoPasal has opened your application and is checking your details and documents.",
      };
    case "CHANGES_REQUESTED":
      return {
        tone: "marigold",
        title: "Changes needed",
        description:
          "Our team has asked you to fix something before they can decide. Make the changes below, then send it again.",
      };
    case "APPROVED":
      return {
        tone: "green",
        title: "Approved",
        description: "Your shop has been created. You can open your dashboard and start setting it up.",
      };
    case "REJECTED":
      return {
        tone: "red",
        title: "Not approved",
        description:
          "This application was not approved. The reason is below. You can start a new application once you have sorted it out.",
      };
    case "WITHDRAWN":
      return {
        tone: "ink",
        title: "Withdrawn",
        description: "You withdrew this application. You can start a new one whenever you are ready.",
      };
  }
}

/** Timeline entry types the onboarding module writes, in plain words. */
const TIMELINE_LABELS: Record<string, string> = {
  created: "Application started",
  submitted: "Sent for review",
  resubmitted: "Sent again after changes",
  withdrawn: "Withdrawn",
  picked_up: "Opened by a reviewer",
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

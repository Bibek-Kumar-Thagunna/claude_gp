"use client";

import * as React from "react";
import { Badge, type Tone } from "@/components/primitives";
import { useLang } from "@/components/providers";
import type { Lang } from "@/lib/i18n";

/**
 * Single source of truth for how every backend enum value is presented.
 * Keeps colour/label consistent across dashboard, tables and detail panels.
 */
type Entry = { en: string; np: string; tone: Tone };

const MAP: Record<string, Entry> = {
  /* ShopStatus */
  PENDING: { en: "Pending", np: "प्रतीक्षारत", tone: "marigold" },
  ACTIVE: { en: "Active", np: "सक्रिय", tone: "green" },
  SUSPENDED: { en: "Suspended", np: "निलम्बित", tone: "red" },
  REJECTED: { en: "Rejected", np: "अस्वीकृत", tone: "ink" },

  /* UserStatus extras */
  DELETED: { en: "Deleted", np: "हटाइएको", tone: "ink" },
  INVITED: { en: "Invited", np: "निमन्त्रित", tone: "blue" },

  /* ApplicationStatus — the onboarding queue. `UNDER_REVIEW` is shared with
     DisputeStatus below and means the same thing, so it is not repeated. */
  DRAFT: { en: "Draft", np: "मस्यौदा", tone: "ink" },
  SUBMITTED: { en: "Submitted", np: "पेश भयो", tone: "blue" },
  CHANGES_REQUESTED: { en: "Changes requested", np: "सुधार माग", tone: "marigold" },
  APPROVED: { en: "Approved", np: "स्वीकृत", tone: "green" },
  WITHDRAWN: { en: "Withdrawn", np: "फिर्ता लिइयो", tone: "ink" },

  /* DocumentReviewState — `PENDING` is shared with ShopStatus above. */
  ACCEPTED: { en: "Accepted", np: "स्वीकार", tone: "green" },

  /* DisputeStatus */
  OPEN: { en: "Open", np: "खुला", tone: "crimson" },
  UNDER_REVIEW: { en: "Under review", np: "समीक्षामा", tone: "marigold" },
  RESOLVED_CUSTOMER: { en: "Resolved — customer", np: "ग्राहकको पक्षमा", tone: "green" },
  RESOLVED_SHOP: { en: "Resolved — shop", np: "पसलको पक्षमा", tone: "blue" },

  /* FraudStatus */
  REVIEWING: { en: "Reviewing", np: "अनुसन्धानमा", tone: "marigold" },
  CONFIRMED: { en: "Confirmed", np: "पुष्टि भयो", tone: "red" },
  DISMISSED: { en: "Dismissed", np: "खारेज", tone: "ink" },

  /* TicketStatus */
  RESOLVED: { en: "Resolved", np: "समाधान", tone: "green" },
  CLOSED: { en: "Closed", np: "बन्द", tone: "ink" },

  /* TicketPriority */
  LOW: { en: "Low", np: "कम", tone: "ink" },
  NORMAL: { en: "Normal", np: "सामान्य", tone: "blue" },
  HIGH: { en: "High", np: "उच्च", tone: "marigold" },
  URGENT: { en: "Urgent", np: "अत्यावश्यक", tone: "red" },

  /* Severity */
  low: { en: "Low risk", np: "कम जोखिम", tone: "ink" },
  medium: { en: "Medium risk", np: "मध्यम जोखिम", tone: "marigold" },
  high: { en: "High risk", np: "उच्च जोखिम", tone: "red" },

  /* SettlementStatus */
  DUE: { en: "Due", np: "बाँकी", tone: "marigold" },
  PROCESSING: { en: "Processing", np: "प्रक्रियामा", tone: "blue" },
  PAID: { en: "Paid", np: "भुक्तानी", tone: "green" },
  HELD: { en: "Held", np: "रोकिएको", tone: "red" },

  /* CouponStatus */
  SCHEDULED: { en: "Scheduled", np: "तय भएको", tone: "blue" },
  PAUSED: { en: "Paused", np: "रोकिएको", tone: "ink" },
  EXPIRED: { en: "Expired", np: "समाप्त", tone: "ink" },

  /* Order statuses (dashboard breakdown) */
  PLACED: { en: "Placed", np: "अर्डर भयो", tone: "blue" },
  PREPARING: { en: "Preparing", np: "तयारीमा", tone: "marigold" },
  OUT_FOR_DELIVERY: { en: "Out for delivery", np: "डेलिभरीमा", tone: "crimson" },
  DELIVERED: { en: "Delivered", np: "पुग्यो", tone: "green" },
  CANCELLED: { en: "Cancelled", np: "रद्द", tone: "ink" },
  RETURNED: { en: "Returned", np: "फिर्ता", tone: "red" },
};

export function statusLabel(value: string, lang: Lang = "en"): string {
  const e = MAP[value];
  if (!e) return value.replace(/_/g, " ").toLowerCase();
  return lang === "np" ? e.np : e.en;
}

export function statusTone(value: string): Tone {
  return MAP[value]?.tone ?? "ink";
}

export function StatusBadge({
  value,
  dot = true,
  className,
}: {
  value: string;
  dot?: boolean;
  className?: string;
}) {
  const { lang } = useLang();
  return (
    <Badge tone={statusTone(value)} dot={dot} className={className}>
      {statusLabel(value, lang)}
    </Badge>
  );
}

export default StatusBadge;

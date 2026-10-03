import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomerMessages } from "@/components/messages/CustomerMessages";

export const metadata: Metadata = { title: "Shop messages", robots: { index: false, follow: false } };

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="gp-container py-16 text-ink-500">Opening messages…</div>}>
      <CustomerMessages />
    </Suspense>
  );
}

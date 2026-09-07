import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/content/LegalPage";

export const metadata: Metadata = {
  title: "Return & Refund Policy",
  description:
    "How returns and refunds work on GoPasal — handled directly with the shop, with GoPasal mediating disputes fairly.",
};

export default function RefundPage() {
  return (
    <LegalPage
      title="Return & Refund Policy"
      updated="20 August 2026"
      intro="Because independent shops fulfil your orders, returns and refunds are handled with the shop. GoPasal is here to help — if something goes wrong, we mediate to reach a fair outcome."
    >
      <p>
        This policy explains what to do if an item arrives damaged, wrong or missing, how perishable
        and sealed goods are treated differently, and how refunds work for Cash on Delivery orders.
      </p>

      <Section id="how-it-works" title="1. How returns work on GoPasal">
        <p>
          Each shop is the seller of record, so it is responsible for the goods it sells and for
          honouring valid return or refund requests. GoPasal facilitates communication and, where you
          and a shop cannot agree, steps in as a good-faith mediator. Please always contact the shop
          first — most issues are resolved quickly and directly.
        </p>
      </Section>

      <Section id="perishable" title="2. Perishable goods">
        <p>
          Perishable items — such as vegetables, fruit, meat, fish, dairy and freshly baked goods —
          cannot generally be returned once accepted, for hygiene and food-safety reasons. However, if
          a perishable item arrives spoiled, of clearly poor quality, or not as described, you are
          entitled to a replacement or refund.
        </p>
        <ul>
          <li>Check perishable items at the door, before the delivery person leaves where possible.</li>
          <li>Report any quality issue with photos as soon as you notice it (see timeframe below).</li>
        </ul>
      </Section>

      <Section id="sealed" title="3. Sealed & non-perishable goods">
        <p>
          Sealed, packaged and non-perishable goods (for example packaged groceries, household items,
          stationery or unopened pharmacy products where returnable) may be returned if they are
          unused, unopened and in their original packaging, subject to the shop&rsquo;s return window.
          Certain items — such as opened medicines or personal-care products — may be non-returnable
          for safety reasons or by law.
        </p>
      </Section>

      <Section id="damaged-wrong" title="4. Damaged, wrong or missing items">
        <p>You are entitled to a replacement or refund if:</p>
        <ul>
          <li>an item arrives <strong>damaged</strong> or in unsafe condition;</li>
          <li>you received the <strong>wrong</strong> item, size, or quantity;</li>
          <li>an item you paid for is <strong>missing</strong> from your order.</li>
        </ul>
        <p>
          Keep the item and its packaging, take a photo, and report the issue to the shop through the
          Platform. If the item was part of a Cash on Delivery order, you can decline the affected
          item at the door and pay only for what you accept.
        </p>
      </Section>

      <Section id="timeframe" title="5. Timeframe to raise an issue">
        <p>
          Please raise any issue promptly. For perishable goods, report on the same day of delivery.
          For sealed and non-perishable goods, report within <strong>48 hours</strong> of delivery
          unless the shop states a longer window. Reporting quickly helps us and the shop verify and
          resolve the issue fairly.
        </p>
      </Section>

      <Section id="cod-refunds" title="6. Cash on Delivery refunds">
        <p>
          With COD, you pay only when your order is handed over, so the simplest resolution is to
          decline or return the affected item at the door and pay for the rest. If a refund is due
          after payment — for example an item was already paid for and later found faulty — the shop
          arranges the refund directly with you, typically in cash or by an agreed method such as
          eSewa or Khalti.
        </p>
        <p>
          Refund timing depends on the shop and the method used. Where a shop is unresponsive or the
          two of you cannot agree, contact GoPasal support and we will mediate.
        </p>
      </Section>

      <Section id="how-to-raise" title="7. How to raise a return or refund">
        <ol>
          <li>Open the order in the GoPasal app and message the shop, describing the issue with photos.</li>
          <li>Give the shop a reasonable opportunity to offer a replacement or refund.</li>
          <li>
            If it is not resolved, escalate to GoPasal support at{" "}
            <a href="mailto:hello@gopasal.com">hello@gopasal.com</a> or{" "}
            <a href="tel:+97716000000">+977 1 6000000</a> with your order number.
          </li>
        </ol>
      </Section>

      <Section id="mediation" title="8. GoPasal mediation">
        <p>
          GoPasal reviews the order details, messages and any evidence, and works with you and the
          shop to reach a fair outcome consistent with this policy and recognised consumer protection
          norms in Nepal. Our goal is a resolution that is prompt and reasonable for everyone.
        </p>
      </Section>

      <Section id="contact" title="9. Contact us">
        <p>
          Need help with a return or refund? Email{" "}
          <a href="mailto:hello@gopasal.com">hello@gopasal.com</a> or call{" "}
          <a href="tel:+97716000000">+977 1 6000000</a>. See also our{" "}
          <a href="/legal/delivery">Delivery Policy</a> and <a href="/support">Help &amp; Support</a>.
        </p>
      </Section>
    </LegalPage>
  );
}

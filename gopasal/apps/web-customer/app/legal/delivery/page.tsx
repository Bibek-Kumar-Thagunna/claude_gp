import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/content/LegalPage";

export const metadata: Metadata = {
  title: "Delivery Policy",
  description:
    "How delivery works on GoPasal — each shop delivers within its own area, on its own schedule. No platform speed promise; just neighbourhood shops you can talk to directly.",
};

export default function DeliveryPage() {
  return (
    <LegalPage
      title="Delivery Policy"
      updated="20 August 2026"
      intro="On GoPasal, the shop you order from also delivers your order. Every shop serves its own neighbourhood, on its own schedule — and you can talk to the shopkeeper directly, any time."
    >
      <p>
        GoPasal is a marketplace that connects you with independent shops near you. We do{" "}
        <strong>not</strong> operate a delivery fleet, and we do not promise any specific delivery
        time or speed. This page explains how delivery works so you know exactly what to expect.
      </p>

      <Section id="who-delivers" title="1. Who delivers your order">
        <p>
          Delivery is performed by <strong>each shop</strong>, using the shop owner or its authorised
          staff, within the shop&rsquo;s own coverage area. The shop decides how and when it delivers.
          This is what keeps GoPasal genuinely local: you are buying from — and being served by — a
          neighbourhood shop you can trust.
        </p>
      </Section>

      <Section id="timing" title="2. Delivery timing">
        <p>
          <strong>
            Delivery timing is set entirely by the shop, and GoPasal makes no guarantee about how fast
            an order will arrive.
          </strong>{" "}
          A shop may deliver within its opening hours, batch nearby orders, or agree a convenient time
          with you. If timing matters for your order, simply message the shop to confirm before or
          after ordering.
        </p>
      </Section>

      <Section id="coverage" title="3. Coverage areas">
        <p>
          Each shop sets the area it can serve. When you set your location, the Platform shows shops
          that deliver to your neighbourhood. If a shop you like does not yet serve your area, it may
          in future — coverage grows steadily as more shops join GoPasal across the Kathmandu valley
          and beyond.
        </p>
      </Section>

      <Section id="fees" title="4. Delivery fees">
        <p>
          Delivery fees are set by each shop and are always shown before you confirm your order. Some
          shops offer <strong>free delivery above a minimum order value</strong>; others may charge a
          small flat fee that reflects the distance within their area. A shop may also set a minimum
          order value.
        </p>
        <ul>
          <li>The applicable delivery fee (or &ldquo;Free&rdquo;) is displayed in your order summary.</li>
          <li>Any minimum order value is shown on the shop&rsquo;s page.</li>
        </ul>
      </Section>

      <Section id="coordinate" title="5. Coordinating with the shopkeeper">
        <p>
          You can contact the shop owner or their staff directly through the Platform to share
          directions, add a landmark, or agree a delivery time. To protect your privacy, calls and
          messages are masked or routed through GoPasal where technically possible, so your personal
          phone number is not exposed unnecessarily.
        </p>
      </Section>

      <Section id="proof-cod" title="6. Proof of delivery & Cash on Delivery">
        <p>
          Most orders can be paid by Cash on Delivery — you pay the shop directly, in Nepali Rupees
          (रु), when the order is handed over. Please keep the amount ready. At handover you may check
          your items, and for COD you can decline any item that is damaged or wrong and pay only for
          what you accept. The shop may confirm delivery in its dashboard as proof of a completed
          order.
        </p>
      </Section>

      <Section id="missed" title="7. Missed or unreachable deliveries">
        <p>
          If a delivery cannot be completed because you are unreachable or not available, the shop may
          attempt to reach you through the Platform to rearrange. Repeatedly refusing valid COD
          deliveries may affect your account, as set out in our{" "}
          <a href="/legal/terms">Terms of Service</a>.
        </p>
      </Section>

      <Section id="issues" title="8. Problems with a delivery">
        <p>
          If something is wrong with your order, contact the shop first, then escalate to GoPasal if
          needed. See our <a href="/legal/refund">Return &amp; Refund Policy</a> for damaged, wrong or
          missing items.
        </p>
      </Section>

      <Section id="future" title="9. A note on the future">
        <p>
          Shop-led delivery keeps things local and personal today. A shared, platform-supported
          delivery option may be introduced in a future phase; if and when it is, we will update this
          policy and make the option clear at checkout.
        </p>
      </Section>

      <Section id="contact" title="10. Contact us">
        <p>
          Questions about delivery? Email <a href="mailto:hello@gopasal.com">hello@gopasal.com</a> or
          call <a href="tel:+97716000000">+977 1 6000000</a>.
        </p>
      </Section>
    </LegalPage>
  );
}

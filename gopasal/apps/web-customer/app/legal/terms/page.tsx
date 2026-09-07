import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/content/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of GoPasal — the hyperlocal marketplace connecting customers with independent neighbourhood shops across Nepal.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="20 August 2026"
      intro="These Terms govern your access to and use of GoPasal, a marketplace that connects you with independent neighbourhood shops. Please read them carefully — by using GoPasal you agree to them."
    >
      <p>
        GoPasal is operated by <strong>Velayon Dynamics Pvt. Ltd.</strong>, a company registered in
        Nepal (&ldquo;GoPasal&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo; or &ldquo;our&rdquo;). These
        Terms of Service (&ldquo;Terms&rdquo;) form a binding agreement between you and GoPasal. If you
        do not agree with any part of these Terms, please do not use the platform.
      </p>

      <Section id="acceptance" title="1. Acceptance of these Terms">
        <p>
          By creating an account, browsing the app or website, placing an order, or otherwise using
          any part of GoPasal (collectively, the &ldquo;Platform&rdquo;), you confirm that you have
          read, understood and agree to be bound by these Terms and by our{" "}
          <a href="/legal/privacy">Privacy Policy</a>. If you use the Platform on behalf of a
          household or another person, you confirm that you are authorised to do so.
        </p>
        <p>
          We may update these Terms from time to time. Continued use of the Platform after an update
          takes effect means you accept the revised Terms.
        </p>
      </Section>

      <Section id="definitions" title="2. Definitions">
        <ul>
          <li>
            <strong>Shop</strong> — an independent business (kirana, pharmacy, vegetable seller,
            bakery and similar) that lists its products and fulfils orders on the Platform.
          </li>
          <li>
            <strong>Shop Staff</strong> — people a Shop authorises to manage its catalogue, orders
            and deliveries.
          </li>
          <li>
            <strong>Customer</strong> — a person who browses shops and places orders through the
            Platform.
          </li>
          <li>
            <strong>Order</strong> — a request you submit to a Shop to purchase one or more products.
          </li>
          <li>
            <strong>COD</strong> — Cash on Delivery, where you pay the Shop when your Order is handed
            over.
          </li>
        </ul>
      </Section>

      <Section id="eligibility" title="3. Eligibility & accounts">
        <p>
          You must be at least 18 years old, or the age of legal majority in Nepal, to create an
          account and place Orders. You are responsible for keeping your account credentials
          confidential and for all activity that occurs under your account.
        </p>
        <p>
          You agree to provide accurate contact and delivery information. Inaccurate details (for
          example an unreachable phone number or an incomplete address) may prevent a Shop from
          fulfilling your Order.
        </p>
      </Section>

      <Section id="marketplace-role" title="4. Our role — an intermediary, not the seller">
        <p>
          GoPasal is a <strong>marketplace and technology platform</strong>. We connect you with
          independent Shops; we do not own, stock, or sell the products listed. Each Shop is the
          seller of record for the products it lists and is solely responsible for their quality,
          accuracy of description, pricing, packaging, lawful sale, and delivery.
        </p>
        <p>
          The contract of sale for any product is formed directly between you and the Shop. GoPasal
          facilitates discovery, ordering and communication, and — where a dispute arises — acts as a
          good-faith mediator, but is not a party to that contract of sale.
        </p>
      </Section>

      <Section id="orders-cod" title="5. Orders & Cash on Delivery">
        <p>
          When you place an Order, it is sent to the relevant Shop for acceptance. An Order is
          confirmed only once the Shop accepts it. A Shop may decline or partially fulfil an Order —
          for example, if an item is out of stock or falls outside its coverage area.
        </p>
        <p>
          Cash on Delivery is available on most Orders. With COD, you pay the Shop (or its Staff)
          directly, in Nepali Rupees (रु), when your Order is handed over. Please keep the exact
          amount ready where possible. Online payment options such as eSewa and Khalti may be offered
          as they become available.
        </p>
      </Section>

      <Section id="pricing-taxes" title="6. Pricing & taxes">
        <p>
          Prices are set by each Shop and are shown in Nepali Rupees. Prices, offers and product
          availability can change at any time. Where Value Added Tax (VAT) or other government levies
          apply to a product, the applicable amount is the responsibility of the selling Shop and may
          be included in or added to the displayed price in accordance with Nepali law.
        </p>
        <p>
          A Shop may set a minimum order value and a delivery fee. Any such charges are shown before
          you confirm your Order. See our <a href="/legal/delivery">Delivery Policy</a> for details.
        </p>
      </Section>

      <Section id="delivery" title="7. Delivery is performed by the Shop">
        <p>
          <strong>
            Delivery is carried out by each Shop within its own coverage area, on its own schedule.
          </strong>{" "}
          GoPasal does not operate a delivery fleet and does not promise any specific delivery time or
          speed. Delivery timing, availability and coverage are determined solely by the Shop.
        </p>
        <p>
          You can contact the Shop or its Staff directly through the Platform to coordinate your
          delivery. Please see our <a href="/legal/delivery">Delivery Policy</a> for the full details
          of how fulfilment works.
        </p>
      </Section>
      <Section id="cancellations" title="8. Cancellations">
        <p>
          You may cancel an Order before the Shop has accepted it or begun preparing it, at no cost.
          Once a Shop has started preparing or dispatching your Order — particularly for perishable
          goods such as vegetables, meat or bakery items — cancellation may no longer be possible.
          The Shop&rsquo;s cancellation window is at its reasonable discretion; contact the Shop
          promptly if you need to cancel.
        </p>
      </Section>

      <Section id="returns" title="9. Returns & refunds">
        <p>
          Because Shops fulfil Orders directly, returns and refunds are handled with the Shop, and
          GoPasal helps mediate where needed. Please read our{" "}
          <a href="/legal/refund">Return &amp; Refund Policy</a> for how to raise a damaged, wrong or
          missing-item issue, the timeframe for doing so, and how COD refunds are processed.
        </p>
      </Section>

      <Section id="prohibited" title="10. Prohibited use">
        <p>You agree not to use the Platform to:</p>
        <ul>
          <li>break any applicable Nepali law or regulation, or facilitate unlawful activity;</li>
          <li>
            place fraudulent, fake or abusive Orders, or repeatedly refuse to accept legitimate COD
            deliveries;
          </li>
          <li>
            harass, threaten or abuse Shop owners, Shop Staff, other customers, or our support team;
          </li>
          <li>
            interfere with, probe or disrupt the Platform, its security, or its underlying
            infrastructure;
          </li>
          <li>
            scrape, copy or resell content, listings or data without our written permission;
          </li>
          <li>impersonate another person or misrepresent your affiliation with anyone.</li>
        </ul>
        <p>
          We may suspend or terminate access to accounts that breach these Terms, without prior
          notice where the breach is serious.
        </p>
      </Section>

      <Section id="ip" title="11. Intellectual property">
        <p>
          The GoPasal name, logo, the &ldquo;Aankhijhyal&rdquo; window mark, the Platform&rsquo;s
          design, software and content (other than Shop-supplied content) are owned by Velayon
          Dynamics Pvt. Ltd. and protected by applicable intellectual-property laws. You are granted a
          limited, personal, non-transferable licence to use the Platform for its intended purpose.
        </p>
        <p>
          Product names, images and descriptions supplied by Shops remain the responsibility of, and
          where applicable the property of, those Shops or their respective rights-holders.
        </p>
      </Section>

      <Section id="disclaimers" title="12. Disclaimers & limitation of liability">
        <p>
          The Platform is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. To
          the fullest extent permitted by law, GoPasal does not warrant that the Platform will be
          uninterrupted or error-free, nor does it warrant the quality, safety or legality of products
          sold by Shops.
        </p>
        <p>
          Because GoPasal is an intermediary, we are not liable for the acts or omissions of Shops,
          including the condition, freshness or timeliness of any Order. To the maximum extent
          permitted by Nepali law, GoPasal&rsquo;s aggregate liability arising out of or relating to
          your use of the Platform is limited to the value of the Order giving rise to the claim. We
          are not liable for indirect, incidental or consequential losses. Nothing in these Terms
          excludes liability that cannot be excluded under applicable law.
        </p>
      </Section>

      <Section id="indemnity" title="13. Indemnity">
        <p>
          You agree to indemnify and hold harmless GoPasal, Velayon Dynamics Pvt. Ltd., and its
          officers and employees from any claim, loss or expense arising out of your misuse of the
          Platform, your breach of these Terms, or your violation of any law or the rights of a third
          party.
        </p>
      </Section>

      <Section id="governing-law" title="14. Governing law & disputes">
        <p>
          These Terms are governed by the laws of Nepal. We encourage you to raise any concern with us
          first so we can help resolve it quickly and fairly, consistent with recognised consumer
          protection norms in Nepal. Any dispute that cannot be resolved amicably shall be subject to
          the jurisdiction of the competent courts of Kathmandu, Nepal.
        </p>
      </Section>

      <Section id="changes" title="15. Changes to these Terms">
        <p>
          We may revise these Terms to reflect changes to the Platform, our services, or the law. When
          we make material changes, we will update the &ldquo;Last updated&rdquo; date above and,
          where appropriate, notify you in the app. Please review this page periodically.
        </p>
      </Section>

      <Section id="contact" title="16. Contact us">
        <p>
          Questions about these Terms? Reach us at{" "}
          <a href="mailto:hello@gopasal.com">hello@gopasal.com</a> or{" "}
          <a href="tel:+97716000000">+977 1 6000000</a>. GoPasal is operated by Velayon Dynamics Pvt.
          Ltd., Kathmandu, Nepal.
        </p>
      </Section>
    </LegalPage>
  );
}

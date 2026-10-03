import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/content/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How GoPasal collects, uses and protects your personal information — and how your details are shared with shops only to fulfil your orders.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="19 September 2026"
      intro="Your trust matters to us. This policy explains what information GoPasal collects, why we collect it, and the choices you have. We only share what a shop needs to prepare and deliver your order."
    >
      <p>
        GoPasal is operated by <strong>Velayon Dynamics Pvt. Ltd.</strong>, registered in Nepal. This
        Privacy Policy applies to the GoPasal app and website (the &ldquo;Platform&rdquo;).
      </p>

      <Section id="what-we-collect" title="1. Information we collect">
        <ul>
          <li>
            <strong>Account information</strong> — your name, phone number, and (optionally) email
            address when you register.
          </li>
          <li>
            <strong>Location information</strong> — your delivery area, address and, with your
            permission, your device location, so we can show shops that serve your neighbourhood.
          </li>
          <li>
            <strong>Order information</strong> — the items you order, order history, delivery notes,
            and payment method (for example COD).
          </li>
          <li>
            <strong>Device &amp; usage information</strong> — device type, app version, approximate IP
            location, and how you interact with the Platform, used to keep it secure and improve it.
          </li>
          <li>
            <strong>Communications</strong> — messages you send to shops, the support assistant or
            our human support team through the Platform.
          </li>
        </ul>
      </Section>

      <Section id="maps" title="Maps and delivery locations">
        <p>
          GoPasal uses Baato to display Nepal maps and calculate delivery routes. Where enabled,
          Google Maps and Google Places help you search for an address and position its pin. Opening
          those maps or searching a place sends the request and approximate location context to the
          respective provider. We ask for your device location only when you choose to share it;
          you can revoke browser location permission at any time or enter a location manually.
        </p>
        <p>
          Google&rsquo;s use of information is governed by the{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.
          We save the delivery pin and address you confirm for your account and orders so you do not
          have to search again for every purchase. We do not build a directory from place-search results.
        </p>
      </Section>

      <Section id="how-we-use" title="2. How we use your information">
        <ul>
          <li>to create and manage your account;</li>
          <li>to show you nearby shops and route your orders to the right shop;</li>
          <li>to enable delivery and Cash on Delivery collection by the shop;</li>
          <li>to provide customer support and help mediate disputes;</li>
          <li>to detect, prevent and investigate fraud, abuse and security issues;</li>
          <li>to improve the Platform and, where you have consented, to send you updates.</li>
        </ul>
      </Section>

      <Section id="sharing" title="3. Sharing with shops & staff for fulfilment">
        <p>
          When you place an order, we share the details a shop needs to fulfil it — your name,
          delivery address, order contents and delivery notes — with that shop and its authorised
          staff. We share only what is necessary, and only with the shop handling your order.
        </p>
        <p>
          Your phone number may be shared with the fulfilling shop when it is needed to coordinate
          delivery. In-app shop messaging is available, but GoPasal does not currently provide
          telecom-number masking for calls.
        </p>
        <p>
          We do not sell your personal information. We may share limited data with service providers
          (such as hosting or SMS providers) who act on our behalf under confidentiality obligations,
          or where required by Nepali law.
        </p>
      </Section>

      <Section id="support-assistant" title="4. Support assistant & human review">
        <p>
          When you use the GoPasal support assistant, we process the question and a limited recent
          conversation history to provide an answer from approved GoPasal guidance. Depending on our
          configured service, this processing may be performed by GoPasal&rsquo;s systems or by a
          contracted AI service provider acting on our behalf.
        </p>
        <p>
          The assistant does not make refund, payment, account, dispute or enforcement decisions. If
          you request a person or the assistant cannot provide a supported answer, the conversation
          is attached to a support ticket so authorised GoPasal staff can continue without asking you
          to repeat it. Do not include OTPs, passwords, wallet PINs, card details or identity-document
          numbers in a support question.
        </p>
      </Section>

      <Section id="cookies" title="5. Cookies & similar technologies">
        <p>
          Our website uses cookies and similar technologies to keep you signed in, remember your
          preferences, and understand how the site is used. You can control cookies through your
          browser settings. See our <a href="/legal/cookies">Cookie Policy</a> for more.
        </p>
      </Section>

      <Section id="retention" title="6. How long we keep your information">
        <p>
          We keep your information for as long as your account is active and as needed to provide the
          Platform, comply with legal and tax obligations, resolve disputes, and enforce our
          agreements. When information is no longer needed, we delete or anonymise it.
        </p>
      </Section>

      <Section id="security" title="7. How we protect your information">
        <p>
          We use administrative, technical and organisational safeguards — including encryption in
          transit, access controls and role-restricted access to sensitive records — to protect your
          information. No method
          of transmission or storage is completely secure, but we work continuously to protect your
          data and to respond promptly to any incident.
        </p>
      </Section>

      <Section id="your-rights" title="8. Your choices & rights">
        <ul>
          <li>access and update your account details in the app;</li>
          <li>request a copy or correction of your personal information;</li>
          <li>request deletion of your account and associated data, subject to legal retention;</li>
          <li>manage location and notification permissions on your device;</li>
          <li>opt out of non-essential marketing messages at any time.</li>
        </ul>
        <p>
          To exercise any of these, contact us at <a href="mailto:hello@gopasal.com">hello@gopasal.com</a>.
        </p>
      </Section>

      <Section id="children" title="9. Children">
        <p>
          The Platform is intended for people aged 18 and over. We do not knowingly collect personal
          information from children. If you believe a child has provided us information, please contact
          us and we will delete it.
        </p>
      </Section>

      <Section id="changes" title="10. Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. We will revise the &ldquo;Last
          updated&rdquo; date above and, for material changes, notify you within the app.
        </p>
      </Section>

      <Section id="contact" title="11. Contact us">
        <p>
          For any privacy question or request, email{" "}
          <a href="mailto:hello@gopasal.com">hello@gopasal.com</a>, open a ticket in the{" "}
          <a href="/support">Help &amp; Support centre</a>, or write to GoPasal (Velayon Dynamics Pvt.
          Ltd.), Kathmandu, Nepal.
        </p>
      </Section>
    </LegalPage>
  );
}

import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/content/LegalPage";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "How GoPasal uses cookies and similar technologies on its website, and how you can control them.",
};

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated="20 August 2026"
      intro="This policy explains how GoPasal uses cookies and similar technologies on its website, and the choices you have."
    >
      <p>
        GoPasal is operated by <strong>Velayon Dynamics Pvt. Ltd.</strong>, registered in Nepal.
        Cookies are small text files stored on your device that help a website work and remember your
        preferences.
      </p>

      <Section id="types" title="1. Types of cookies we use">
        <ul>
          <li>
            <strong>Essential cookies</strong> — required for the site to function, such as keeping
            you signed in and remembering the items in your cart. These cannot be switched off.
          </li>
          <li>
            <strong>Preference cookies</strong> — remember choices such as your language (English or
            नेपाली) and your delivery area.
          </li>
          <li>
            <strong>Analytics cookies</strong> — help us understand, in aggregate, how the site is used
            so we can improve it. These do not identify you personally.
          </li>
        </ul>
      </Section>

      <Section id="why" title="2. Why we use them">
        <p>
          We use cookies to keep the site secure, to remember your preferences, and to measure and
          improve performance. We do not use cookies to sell your personal information.
        </p>
      </Section>

      <Section id="control" title="3. Controlling cookies">
        <p>
          You can accept or reject non-essential cookies through your browser settings, and delete
          cookies already stored. Most browsers let you block cookies entirely, though some parts of
          the site may not work correctly if you do. Blocking essential cookies may prevent you from
          signing in or placing an order.
        </p>
      </Section>

      <Section id="more" title="4. Related policies">
        <p>
          For more on how we handle your information, see our{" "}
          <a href="/legal/privacy">Privacy Policy</a>.
        </p>
      </Section>

      <Section id="contact" title="5. Contact us">
        <p>
          Questions about cookies? Email <a href="mailto:hello@gopasal.com">hello@gopasal.com</a>.
        </p>
      </Section>
    </LegalPage>
  );
}

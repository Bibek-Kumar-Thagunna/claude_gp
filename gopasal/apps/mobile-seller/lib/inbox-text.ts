/**
 * The words on an inbox row, in the reader's language where the app can.
 *
 * Notifications are written by the API, in English, at the moment the event
 * happens — so a shopkeeper reading the app in Nepali got a Nepali inbox full
 * of English rows. For the kinds whose meaning is fully in `type` + `data` the
 * app writes its own sentence; anything a person wrote (a customer's message, a
 * reviewer's note) and any kind the app does not know stays exactly as sent.
 *
 * One override is about content rather than language: the approval notice told
 * the new seller to "open the seller console" — on the phone, the shelf is
 * where products are added.
 */
type T = (key: string, vars?: Record<string, string | number>, fallback?: string) => string;
type Row = {
  type?: string | null;
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
};

const str = (v: unknown) => (typeof v === "string" ? v : null);

export function inboxText(n: Row, t: T): { title: string; body: string | null } {
  const data = n.data ?? {};
  const code = str(data.code);
  const reference = str(data.reference);
  const body = n.body ?? null;

  switch (n.type) {
    case "order.incoming":
      return code
        ? { title: t("inbox.t.newOrder"), body: t("inbox.b.newOrder", { code }) }
        : { title: n.title, body };
    case "conversation.incoming":
      return { title: t("inbox.t.customerMessage"), body };
    case "invite.accepted":
      return { title: t("inbox.t.inviteAccepted"), body };
    case "application.submitted":
      return {
        title: t("inbox.t.applicationReceived"),
        body: reference ? t("inbox.b.applicationReceived", { reference }) : body,
      };
    case "application.under_review":
      return {
        title: t("inbox.t.underReview"),
        body: reference ? t("inbox.b.underReview", { reference }) : body,
      };
    case "application.changes_requested":
      return { title: t("inbox.t.changes"), body };
    case "application.rejected":
      return { title: t("inbox.t.rejected"), body };
    case "application.approved":
      return {
        title: t("inbox.t.approved"),
        body:
          !body || body.startsWith("Your application was approved.") ? t("inbox.b.approved") : body,
      };
    default:
      return { title: n.title, body };
  }
}

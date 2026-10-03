export type PaymentAction = {
  redirectUrl?: string;
  actionUrl?: string;
  formFields?: Record<string, string>;
};

export function continuePayment(payment: PaymentAction): boolean {
  if (payment.redirectUrl) {
    const destination = safePaymentUrl(payment.redirectUrl);
    window.location.assign(destination.toString());
    return true;
  }
  if (!payment.actionUrl || !payment.formFields) return false;
  const action = safePaymentUrl(payment.actionUrl);
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action.toString();
  form.hidden = true;
  for (const [name, value] of Object.entries(payment.formFields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  return true;
}

function safePaymentUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("The payment gateway URL is not secure");
  }
  return url;
}

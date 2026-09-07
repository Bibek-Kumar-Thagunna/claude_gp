import { redirect } from "next/navigation";

// GoPasal has no separate "create account" flow — customers use one unified
// entry: enter phone → verify OTP → (new numbers are asked for a name once).
// Any old /signup links land on that single flow.
export default function SignupPage() {
  redirect("/login");
}

import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to GoPasal to order from local shops, track deliveries and chat with shopkeepers.",
};

export default function LoginPage() {
  return <AuthForm />;
}

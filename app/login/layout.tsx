import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your TabsPro account to manage your Guitar Pro tabs.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

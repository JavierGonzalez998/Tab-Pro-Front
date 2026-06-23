import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create a free TabsPro account and start uploading your Guitar Pro tabs. No credit card required.",
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}

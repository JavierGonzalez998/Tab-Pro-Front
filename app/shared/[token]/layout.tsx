import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shared Tab",
  description: "View and download a shared Guitar Pro tab on TabsPro.",
  robots: { index: false, follow: false },
};

export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return children;
}

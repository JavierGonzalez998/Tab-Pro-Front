import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tab Detail",
  description: "View, edit and play your Guitar Pro tab.",
  robots: { index: false, follow: false },
};

export default function TabLayout({ children }: { children: React.ReactNode }) {
  return children;
}

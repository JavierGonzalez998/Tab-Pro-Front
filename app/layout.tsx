import type { Metadata } from "next";
import { Poppins, Righteous, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./providers";
import Navbar from "./navbar";
import ServiceWorker from "./service-worker";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const righteous = Righteous({
  variable: "--font-righteous",
  subsets: ["latin"],
  weight: "400",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tabspro.app";
const SITE_NAME = "TabsPro";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Guitar Pro Tab Manager`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Upload, view, edit and share Guitar Pro tablatures (.gp, .gp3, .gp4, .gp5, .gpx) from any browser. Cloud tab manager with built-in player, AlphaTex editor, MIDI export and share links.",
  keywords: [
    "guitar pro", "tab manager", "guitar tabs", "tablature",
    "alphatab", "gpx viewer", "guitar pro online", "share tabs",
    "midi export", "alphatex editor", "guitar tab cloud",
  ],
  applicationName: SITE_NAME,
  category: "music",
  creator: SITE_NAME,
  publisher: SITE_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Guitar Pro Tab Manager`,
    description:
      "Upload, view, edit and share Guitar Pro tablatures from any browser. Built for musicians who want their library always accessible.",
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — Guitar Pro Tab Manager`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Guitar Pro Tab Manager`,
    description:
      "Upload, view, edit and share Guitar Pro tablatures from any browser.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${righteous.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg-primary text-text-primary">
        <AuthProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
        </AuthProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}

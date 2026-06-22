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

export const metadata: Metadata = {
  title: "TabsPro — Guitar Pro Tab Manager",
  description: "Upload, manage and share your Guitar Pro tabs in the cloud.",
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

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const viewport: Viewport = {
  themeColor: "#66B2B2",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "NexTask — NexVision Innovations",
  description:
    "Local-first internal office submission and compliance management system.",
  applicationName: "NexTask",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "NexTask",
  },
  other: {
    // Non-deprecated equivalent of apple-mobile-web-app-capable
    "mobile-web-app-capable": "yes",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: "/brand/ntlogo.jpg",
    apple: "/brand/ntlogo.jpg",
    shortcut: "/brand/ntlogo.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-surface-subtle font-sans antialiased text-ink">
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{ style: { fontFamily: "var(--font-inter)" } }}
        />
        <ServiceWorkerRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}

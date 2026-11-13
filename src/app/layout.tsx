import type { Metadata, Viewport } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { siteConfig } from "@/config/site";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — Premium Kids' Rides & Lifestyle`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    locale: siteConfig.locale,
    url: siteConfig.url,
  },
};

export const viewport: Viewport = {
  themeColor: "#4B0082",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${outfit.variable} ${dmSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}

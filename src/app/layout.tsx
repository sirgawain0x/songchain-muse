import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/privy-access";
const bodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const headingFont = Manrope({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});
export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    title: "Agent Stage",
    statusBarStyle: "default",
  },
  title: "Agent Stage — Music meets a new audience",
  description:
    "One seed. Human creativity. A new kind of music competition. Create, listen, vote, and license original music with transparent provenance.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable}`}>
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}

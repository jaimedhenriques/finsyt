import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finsyt Platform",
  description:
    "AI-powered financial research platform with news intelligence, screening, portfolio analytics, and source-cited workflows.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

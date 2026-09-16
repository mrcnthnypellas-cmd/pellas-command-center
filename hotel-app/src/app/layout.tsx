import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pellas Grand Hotel",
  description: "Hotel Booking & Management System — local sample",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink-50 text-ink-900 antialiased">{children}</body>
    </html>
  );
}

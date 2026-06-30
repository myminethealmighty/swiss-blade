import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Swiss Blade",
  description: "A lightweight Chrome ad blocker."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

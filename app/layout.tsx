import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SVGdio — SVG & CSS Canvas Studio",
  description:
    "Visual studio for layer-based SVG composition and CSS motion. Draw, style, sequence, export clean SVG + CSS.",
  applicationName: "SVGdio",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#0b0a0e" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

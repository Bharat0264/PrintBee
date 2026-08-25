import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrintBee | Upload. Print. Delivered.",
  description: "Simple A4 document printing in black-and-white or colour, delivered to your door.",
  icons: {
    icon: "/printbee-logo.png",
    shortcut: "/printbee-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

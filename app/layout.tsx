import type { Metadata } from "next";
import "./globals.css";
import "./experience.css";
import "./order-motion.css";
import "./liquid-glass.css";
import "./cinematic.css";
import { FloatingBackground, GlassInteractionSystem, PageTransition } from "./components/LiquidGlass";
import CinematicMotion from "./components/cinematic/CinematicMotion";
import TouchFeedback from "./components/cinematic/TouchFeedback";

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
        <FloatingBackground />
        <GlassInteractionSystem />
        <CinematicMotion />
        <TouchFeedback />
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}

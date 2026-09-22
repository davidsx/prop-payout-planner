import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Prop Payout Planner",
    template: "%s · Prop Payout Planner",
  },
  applicationName: "Prop Payout Planner",
  description:
    "Plan prop-firm evaluation phases and daily profit targets, track your actual results, and see a live calendar of progress and take-home payouts.",
  appleWebApp: {
    capable: true,
    title: "Payout Planner",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

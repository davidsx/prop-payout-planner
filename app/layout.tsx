import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prop Payout Planner",
  description:
    "Plan prop-firm evaluation phases and daily profit targets, and see a calendar of progress and take-home payouts.",
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

import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Research Workbench",
  description:
    "A local, file-based workbench for news research, classification and structured extraction.",
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

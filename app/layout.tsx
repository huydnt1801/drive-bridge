import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Driver Bridge",
  description: "Manage media across Google Drive accounts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "drive bridge — your visual archive",
  description: "Lưu trữ, tuyển chọn và ghép ảnh từ Google Drive trong một không gian trực quan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi" className="bg-background"><body>{children}</body></html>;
}

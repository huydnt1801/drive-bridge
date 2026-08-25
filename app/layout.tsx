import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nhà Kỷ Niệm — Huy & Linh",
  description: "Nơi Huy và Linh cùng cất giữ những bức ảnh, thước phim và kỷ niệm thương mến.",
  icons: {
    icon: "/brand/nha-ky-niem-huy-linh.png",
    apple: "/brand/nha-ky-niem-huy-linh.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi" className="bg-background"><body>{children}</body></html>;
}

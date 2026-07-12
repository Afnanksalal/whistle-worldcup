import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "../components/Providers";
import { Nav } from "../components/Nav";
import { NotificationToasts } from "../components/NotificationToasts";

export const metadata: Metadata = {
  title: "Whistle — World Cup prediction markets",
  description:
    "Parimutuel World Cup pools with live match data, full-time settlement, and private squads.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="pitch-grid" style={{ minHeight: "100vh" }}>
            <Nav />
            {children}
            <NotificationToasts />
          </div>
        </Providers>
      </body>
    </html>
  );
}

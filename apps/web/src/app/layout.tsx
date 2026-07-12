import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "../components/Providers";
import { Nav } from "../components/Nav";

export const metadata: Metadata = {
  title: "Whistle — World Cup Predictions",
  description:
    "Take a side. Watch live. Get paid at the whistle. Tournament prediction pools powered by TxLINE.",
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
          </div>
        </Providers>
      </body>
    </html>
  );
}

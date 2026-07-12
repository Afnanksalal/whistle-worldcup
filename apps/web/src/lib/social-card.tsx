import { ImageResponse } from "next/og";

export const socialImageAlt = "Whistle — World Cup 2026 match prediction pools";
export const socialImageSize = { width: 1200, height: 630 };
export const socialImageContentType = "image/png";

export function renderSocialCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "58px 68px",
          background: "#EEF1EB",
          color: "#10271F",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <svg width="76" height="76" viewBox="0 0 64 64">
              <rect x="2" y="2" width="60" height="60" rx="14" fill="#173F33" />
              <path
                fill="#FBFCF8"
                d="M13 23h18.5l5.5-5h7v7h3a11.5 11.5 0 1 1 0 23H32l-6 7H15l6-7h-8a6 6 0 0 1-6-6V29a6 6 0 0 1 6-6Z"
              />
              <circle cx="47" cy="36.5" r="4.5" fill="#173F33" />
              <rect x="10" y="10" width="16" height="4" rx="2" fill="#DF5A40" />
              <rect x="5" y="16" width="13" height="4" rx="2" fill="#DF5A40" />
            </svg>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-1.5px" }}>
                Whistle
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "3.5px", color: "#607069" }}>
                WORLD CUP 2026
              </span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              padding: "12px 18px",
              border: "2px solid #B9C2BC",
              borderRadius: 999,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "1.6px",
              color: "#173F33",
            }}
          >
            MATCHDAY POOLS
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", maxWidth: 800, flexDirection: "column" }}>
            <span style={{ marginBottom: 16, color: "#DF5A40", fontSize: 18, fontWeight: 800, letterSpacing: "4px" }}>
              FROM KICKOFF TO FINAL WHISTLE
            </span>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: 96,
                fontWeight: 900,
                letterSpacing: "-6px",
                lineHeight: 0.9,
              }}
            >
              <span>Every match.</span>
              <span>One clear call.</span>
            </div>
          </div>
          <div
            style={{
              width: 210,
              height: 210,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #BDA15B",
              borderRadius: 999,
              color: "#173F33",
            }}
          >
            <span style={{ fontSize: 82, fontWeight: 900, lineHeight: 0.85 }}>26</span>
            <span style={{ marginTop: 14, color: "#DF5A40", fontSize: 16, fontWeight: 800, letterSpacing: "3px" }}>
              WORLD CUP
            </span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 22, borderTop: "2px solid #C9D0CB", color: "#607069", fontSize: 17 }}>
          <span>Fixtures · parimutuel pools · live match context</span>
          <span style={{ color: "#173F33", fontWeight: 700 }}>whistle</span>
        </div>
      </div>
    ),
    socialImageSize,
  );
}

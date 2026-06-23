import { ImageResponse } from "next/og";

export const alt = "TabsPro — Guitar Pro Tab Manager";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Pick icon (matches the favicon) as a data URI so Satori renders it reliably.
const pick = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <defs><linearGradient id="b" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6366F1"/><stop offset="100%" stop-color="#3730A3"/></linearGradient></defs>
    <rect width="32" height="32" rx="7" fill="url(#b)"/>
    <path d="M16 7C20.2 7 24 9 24 13.5C24 18.8 19.4 23.6 16 25.5C12.6 23.6 8 18.8 8 13.5C8 9 11.8 7 16 7Z" fill="#fff"/>
    <circle cx="16" cy="12.5" r="1.5" fill="#4338CA"/>
    <circle cx="16" cy="16.5" r="1.5" fill="#4338CA"/>
    <circle cx="16" cy="20.5" r="1.5" fill="#4338CA"/>
  </svg>`
)}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "90px",
          background: "linear-gradient(135deg, #0F0F23 0%, #312E81 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img width={168} height={168} src={pick} alt="" />
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 44 }}>
            <div style={{ fontSize: 104, fontWeight: 700, color: "#ffffff", letterSpacing: -3, lineHeight: 1 }}>
              TabsPro
            </div>
            <div style={{ fontSize: 36, color: "#A5B4FC", marginTop: 12 }}>
              Guitar Pro Tab Manager
            </div>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 56, fontSize: 32, color: "#C7D2FE", maxWidth: 980 }}>
          Upload, view, edit &amp; share .gp · .gp3 · .gp4 · .gp5 · .gpx tablatures from any browser.
        </div>
      </div>
    ),
    { ...size }
  );
}

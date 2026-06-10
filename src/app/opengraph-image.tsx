import { ImageResponse } from "next/og";

export const alt = "A fragrance that's yours";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#FAF8F2",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 120px",
          fontFamily: "serif",
          color: "#1A1614",
        }}
      >
        <div
          style={{
            fontSize: 24,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#8A8278",
            marginBottom: 40,
          }}
        >
          A fragrance project
        </div>
        <div
          style={{
            fontSize: 96,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginBottom: 32,
            maxWidth: 900,
          }}
        >
          A fragrance that&apos;s yours.
        </div>
        <div
          style={{
            fontSize: 32,
            color: "#4A4640",
            lineHeight: 1.4,
            maxWidth: 800,
          }}
        >
          Tell us five things. We&apos;ll suggest scents worth your skin.
        </div>
      </div>
    ),
    { ...size }
  );
}

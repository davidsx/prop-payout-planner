import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icon: a green calendar with a gold payout-day coin on the dark
// tile — the same motif as the favicon, rendered as PNG for iOS/Android.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0f14",
        }}
      >
        <div
          style={{
            width: 104,
            height: 98,
            border: "11px solid #34d399",
            borderRadius: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
          }}
        >
          <div style={{ width: 42, height: 42, borderRadius: 42, background: "#f5c451" }} />
        </div>
      </div>
    ),
    size,
  );
}

import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["@contentauth/c2pa-node", "ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/stage/*": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;

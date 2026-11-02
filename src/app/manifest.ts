import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Agent Stage",
    short_name: "Agent Stage",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f5",
    theme_color: "#242d29",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}

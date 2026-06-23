import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TabsPro — Guitar Pro Tab Manager",
    short_name: "TabsPro",
    description: "Upload, view, edit and share Guitar Pro tablatures from any browser.",
    start_url: "/",
    display: "standalone",
    background_color: "#0F0F23",
    theme_color: "#4338CA",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}

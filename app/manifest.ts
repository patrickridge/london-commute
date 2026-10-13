import type { MetadataRoute } from "next";

// Lets the planner be added to a phone's home screen and open like an app. On iPhone, that's also
// what allows it to send commute alerts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "London commute planner",
    short_name: "Commute",
    description: "Journey time, whether you'll get a seat, and alerts when your commute is disrupted.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

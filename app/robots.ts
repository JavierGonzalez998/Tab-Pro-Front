import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tabspro.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/tabs/", "/api/", "/oauth/", "/reset-password/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

import fs from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  let keys: string[] = [];
  try {
    const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "static", "en.json"), "utf8"));
    keys = Object.values(data.champions as Record<string, { key: string }>).map((c) => c.key);
  } catch {
    // data not generated yet: list the fixed pages only
  }
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/draft/`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/meta/`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    ...keys.map((key) => ({ url: `${SITE_URL}/champion/${key}/`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 })),
  ];
}

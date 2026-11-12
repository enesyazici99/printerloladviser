/** Public address of the site (no trailing slash), used for the sitemap and robots.txt. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://ygappstudio.com") + (process.env.NEXT_PUBLIC_BASE_PATH || "");

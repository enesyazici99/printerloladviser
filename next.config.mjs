/** @type {import('next').NextConfig} */
// The site is a fully static export (GitHub Pages). NEXT_PUBLIC_BASE_PATH is
// "/lol-advisor" on Pages and empty for local development / a custom domain.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;

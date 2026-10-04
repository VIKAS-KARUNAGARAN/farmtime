/** @type {import('next').NextConfig} */
const preview = process.env.NEXT_PUBLIC_HASH_ROUTER === "1";

const nextConfig = {
  // Static export so the site can be hosted anywhere.
  // Remove `output` when you add a real backend (API routes, middleware, sessions).
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Preview builds load assets relative to index.html.
  ...(preview ? { assetPrefix: "." } : {}),
};
export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export so the site can be previewed or hosted anywhere.
  // Remove `output` when you add a real backend (API routes, middleware, sessions).
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;

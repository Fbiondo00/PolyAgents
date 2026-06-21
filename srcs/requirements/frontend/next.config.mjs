/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output: Next bundles only the needed node_modules into
  // `.next/standalone`, giving a minimal production server image.
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

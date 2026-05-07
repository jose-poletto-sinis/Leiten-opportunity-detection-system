/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  env: {
    NEXT_PUBLIC_INTEL_API_URL:
      process.env.NEXT_PUBLIC_INTEL_API_URL || "http://localhost:8080",
  },
};

module.exports = nextConfig;

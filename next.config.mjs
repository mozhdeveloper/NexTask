/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: {
    // All images are local — no external domains needed
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;

import os from "os";
import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: {
    // All images are local — no external domains needed
    formats: ["image/avif", "image/webp"],
  },
  webpack(config, { dev }) {
    if (dev) {
      // Store webpack cache in the system temp directory so OneDrive sync
      // never touches it. This permanently fixes the ENOENT / hasStartTime
      // errors that occur when the project lives inside an OneDrive folder.
      config.cache = {
        type: "filesystem",
        cacheDirectory: path.join(os.tmpdir(), "nextask-webpack-cache"),
        buildDependencies: { config: [import.meta.url] },
      };
    }
    return config;
  },
};

export default nextConfig;

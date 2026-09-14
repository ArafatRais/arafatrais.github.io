import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GitHub Pages serves static files only, so Next exports to plain HTML.
  output: "export",
  // No server means no on-demand image optimisation.
  images: { unoptimized: true },
  // Pages serves /about as /about/index.html, so emit trailing-slash dirs.
  trailingSlash: true,
};

export default nextConfig;

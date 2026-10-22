import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  async redirects() {
    // A person's gift ideas now live on their Personas page (one screen, not two).
    return [{ source: "/regalos/:personId", destination: "/personas/:personId", permanent: false }];
  },
};

export default nextConfig;

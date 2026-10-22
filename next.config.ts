import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  /*
   * Lifetimes of Marc's private data (lib/cache/reads.ts, 'use cache: private': never stored on
   * the server across requests; `stale` is how long the client router reuses it). Any write
   * action clears the client cache at once, so these only bound how late writes made elsewhere
   * (Siri, the extension, another device) show up without a reload.
   *   userData: item lists, people, settings. stale ≥ 5 min puts them in the prefetched App Shell.
   *   calendar: Google Calendar and the screens that show it (Agenda, Hoy, Semana).
   */
  cacheLife: {
    userData: { stale: 300, revalidate: 300, expire: 3600 },
    calendar: { stale: 60, revalidate: 60, expire: 300 },
  },
  async redirects() {
    // A person's gift ideas now live on their Personas page (one screen, not two).
    return [{ source: "/regalos/:personId", destination: "/personas/:personId", permanent: false }];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necessário para Prisma no Vercel (evita erro de bundling)
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necessário para Prisma no Vercel (evita erro de bundling)
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // Aumenta o limite de body para upload de PDFs (padrão é 4MB)
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;

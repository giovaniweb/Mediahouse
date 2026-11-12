import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necessário para Prisma no Vercel (evita erro de bundling)
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  // A arte dos avisos do WhatsApp (lib/avisos-arte-imagem.tsx) lê as cenas e a
  // fonte do disco na hora de mandar. O envio roda no after() de qualquer rota de
  // API e no cron, então as cenas vão junto das funções de API.
  outputFileTracingIncludes: {
    "/api/**/*": ["./public/avisos/cenas/*.jpg", "./public/fonts/montserrat/montserrat-700.ttf"],
  },
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

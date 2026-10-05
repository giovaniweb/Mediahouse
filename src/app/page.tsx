import type { Metadata } from "next"
import Landing from "@/components/landing/Landing"
import "@/components/layout/Montserrat.css"
import { SLUG_ORG_PADRAO } from "@/lib/org"

export const metadata: Metadata = {
  title: "NuFlow — Mais tempo para criar",
  description: "Organize demandas, agenda, equipe e aprovações num só lugar. Avisos pelo WhatsApp na hora certa. Conheça o flow do NuFlow.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "NuFlow — Mais tempo para criar",
    description: "Jobs, prazos e aprovações em um só lugar. Mais espaço para ser criativo.",
    url: "/",
  },
}

export default function RootPage() {
  // O número de vendas vem só da configuração: nada de telefone pessoal como
  // reserva no código. Sem ele, "Conversar" leva ao formulário de interesse.
  const phone = (process.env.NUFLOW_SALES_WHATSAPP ?? "").replace(/\D/g, "")
  const contactUrl = /^\d{10,15}$/.test(phone)
    ? `https://wa.me/${phone}?text=${encodeURIComponent("Olá! Quero conhecer o NuFlow.")}`
    : null
  // "Sou cliente": quem veio pedir um vídeo vai para a área da empresa padrão.
  return <Landing contactUrl={contactUrl} areaCliente={`/c/${SLUG_ORG_PADRAO}`} />
}

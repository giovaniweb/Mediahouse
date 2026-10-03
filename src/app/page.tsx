import type { Metadata } from "next"
import Boreal from "@/components/landing/Boreal"

export const metadata: Metadata = {
  title: "NuFlow — Mais tempo para criar",
  description: "Organize demandas, acompanhe seus jobs e encontre mais tempo para ser criativo. Conheça o flow do NuFlow.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "NuFlow — Mais tempo para criar",
    description: "Jobs, prazos e aprovações em um só lugar. Mais espaço para ser criativo.",
    url: "/",
  },
}

export default function RootPage() {
  // O número de vendas vem só da configuração: nada de telefone pessoal como
  // reserva no código. Sem ele, a conversa leva ao formulário de interesse.
  const phone = (process.env.NUFLOW_SALES_WHATSAPP ?? "").replace(/\D/g, "")
  const contactUrl = /^\d{10,15}$/.test(phone)
    ? `https://wa.me/${phone}?text=${encodeURIComponent("Olá! Quero conhecer o NuFlow.")}`
    : null
  return <main><Boreal contactUrl={contactUrl} /></main>
}

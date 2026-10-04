"use client"
// Passagem depois do login pela área da empresa: deixa esta empresa ativa e vai
// ao painel. Quem decide se a pessoa pode é /api/me/organizacoes, que confere o
// vínculo no banco antes de gravar a escolha — aqui só se pede.
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import SystemState from "@/components/system/SystemState"

type Empresa = { id: string; nome: string; slug: string }

export default function PainelDaEmpresa() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const [semVinculo, setSemVinculo] = useState<string | null>(null)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await fetch("/api/me/organizacoes")
      if (r.status === 401) return router.replace(`/c/${slug}/entrar`)
      if (!r.ok) throw new Error(String(r.status))
      const { organizacoes } = (await r.json()) as { organizacoes: Empresa[] }
      const alvo = organizacoes.find(o => o.slug === slug)
      if (!alvo) {
        const nome = await fetch(`/api/publico/empresa?org=${encodeURIComponent(slug)}`).then(x => x.ok ? x.json() : null).then(d => d?.empresa?.nome ?? null).catch(() => null)
        if (vivo) setSemVinculo(nome ?? slug)
        return
      }
      const escolha = await fetch("/api/me/organizacoes", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizacaoId: alvo.id }),
      })
      if (!escolha.ok) throw new Error(String(escolha.status))
      // Recarrega de verdade: o painel lê a empresa ativa do cookie recém-gravado,
      // e uma navegação do roteador reaproveitaria o que já estava em memória.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/dashboard")
    })().catch(() => { if (vivo) setFalhou(true) })
    return () => { vivo = false }
  }, [slug, router])

  if (semVinculo) {
    return <SystemState label="ACESSO À EMPRESA" title={`Sua conta não faz parte de ${semVinculo}.`} description="Você entrou, mas esta conta não tem acesso a esta empresa. Peça acesso a quem administra a equipe, ou siga para os espaços em que você já está.">
      <a href="/dashboard">Ir para o meu painel</a><a href={`/c/${slug}`}>Voltar à área da empresa</a>
    </SystemState>
  }
  if (falhou) {
    return <SystemState label="ACESSO À EMPRESA" title="Não foi possível abrir o espaço da empresa." description="Confira sua conexão e tente de novo. Se continuar, entre pelo painel e escolha a empresa no menu.">
      <a href={`/c/${slug}/painel`}>Tentar de novo</a><a href="/dashboard">Ir para o meu painel</a>
    </SystemState>
  }
  return <SystemState label="ACESSO À EMPRESA" title="Abrindo o espaço da empresa…" description="Conferindo seu acesso.">
    <p role="status"><Loader2 className="animate-spin" aria-hidden="true" /> Um instante.</p>
  </SystemState>
}

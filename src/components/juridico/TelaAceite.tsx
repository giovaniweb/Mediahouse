"use client"
// Tela de aceite no primeiro acesso, e de novo a cada versão nova dos termos.
// Ocupa o lugar do painel (ver o layout do dashboard): a URL fica a mesma, então
// o link de job que chegou pelo WhatsApp abre direto depois do aceite.
import { useState } from "react"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { Loader2 } from "lucide-react"
import { LogoNuFlow } from "@/components/marca/Marca"
import { DOCUMENTOS, MINUTA, marcaDeVersao, type SlugDocumento } from "@/lib/juridico/documentos"
import { fraseDoAceite } from "@/lib/juridico/aceite"
import "@/components/layout/Montserrat.css"
import s from "./TelaAceite.module.css"

export function TelaAceite({ pendentes, organizacaoId, empresa, emNomeDaEmpresa, versaoNova }: {
  pendentes: SlugDocumento[]
  organizacaoId: string
  empresa: string
  emNomeDaEmpresa: boolean
  versaoNova: boolean
}) {
  const router = useRouter()
  const [marcado, setMarcado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function aceitar() {
    if (!marcado || enviando) return
    setEnviando(true)
    setErro(null)
    try {
      const r = await fetch("/api/aceite-termos", {
        method: "POST", headers: { "Content-Type": "application/json" },
                // O que a tela MOSTROU: a empresa e cada documento com a versão lida.
        // A API recusa se a empresa ativa ou a versão atual mudaram desde então.
        body: JSON.stringify({ aceito: true, organizacaoId, documentos: pendentes.map(marcaDeVersao) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Não foi possível registrar o aceite. Tente de novo.")
      router.refresh()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar o aceite. Tente de novo.")
      setEnviando(false)
    }
  }

  return (
    <main className={s.tela}>
      <div className={s.cartao}>
        <LogoNuFlow className={s.marca} />
        <h1>{versaoNova ? "Atualizamos os termos" : "Antes de começar"}</h1>
        <p className={s.lead}>
          {versaoNova
            ? "Alguns documentos mudaram desde o seu último acesso. Leia a versão nova e confirme para continuar."
            : emNomeDaEmpresa
              ? `Como administrador de ${empresa}, você aceita estes documentos em nome da empresa.`
              : `Para usar o NuFlow em ${empresa}, leia e aceite os documentos abaixo.`}
        </p>

        <ul className={s.docs}>
          {pendentes.map(slug => (
            <li key={slug}>
              <a href={DOCUMENTOS[slug].caminho} target="_blank" rel="noopener">{DOCUMENTOS[slug].titulo}</a>
              <span>versão {DOCUMENTOS[slug].versao}</span>
            </li>
          ))}
        </ul>
        {MINUTA && <p className={s.minuta}>Estes documentos ainda são minuta, em revisão jurídica.</p>}

        <label className={s.caixa}>
          <input type="checkbox" checked={marcado} onChange={e => setMarcado(e.target.checked)} />
          <span>{fraseDoAceite(pendentes)}{emNomeDaEmpresa && !versaoNova ? ` Declaro que posso representar ${empresa}.` : ""}</span>
        </label>

        {erro && <p role="alert" className={s.erro}>{erro}</p>}

        <button type="button" className={s.botao} disabled={!marcado || enviando} onClick={aceitar}>
          {enviando ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Registrando…</> : "Aceitar e continuar"}
        </button>
        <p className={s.rodape}>
          Registramos a data, a versão e um código do seu acesso como prova do aceite.{" "}
          <button type="button" className={s.sair} onClick={() => signOut({ callbackUrl: "/login" })}>Sair sem aceitar</button>
        </p>
      </div>
    </main>
  )
}

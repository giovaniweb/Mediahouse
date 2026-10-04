"use client"
// Quem recebe este formulário público.
//
// Os formulários eram genéricos: "NuFlow" no topo e nenhuma pista de para qual
// empresa o pedido ia. Com mais de uma empresa no sistema, isso mandava pedido
// para o lugar errado sem ninguém perceber. Aqui o topo passa a dizer o nome (e
// o logo) da empresa de destino, o "Voltar" leva à área dela, e um link com slug
// que não existe vira aviso em vez de envio silencioso para a empresa padrão.
import { useEffect, useState } from "react"
import Link from "next/link"
import { slugDaPagina, urlComOrg } from "@/lib/org-publica-cliente"
import styles from "./EmpresaDestino.module.css"

export type EmpresaPublica = { nome: string; slug: string; logoUrl: string | null }
export type DestinoDoFormulario =
  | { estado: "carregando"; inicio: string }
  | { estado: "pronto"; empresa: EmpresaPublica; inicio: string }
  | { estado: "inexistente" | "falha"; inicio: string }

export function useEmpresaDestino(): DestinoDoFormulario {
  const [destino, setDestino] = useState<DestinoDoFormulario>({ estado: "carregando", inicio: "/sobre" })
  useEffect(() => {
    const controle = new AbortController()
    const slug = slugDaPagina()
    const inicio = slug ? `/c/${slug}` : "/sobre"
    fetch(urlComOrg("/api/publico/empresa"), { signal: controle.signal })
      .then(async r => {
        if (r.status === 404) return setDestino({ estado: "inexistente", inicio })
        if (!r.ok) return setDestino({ estado: "falha", inicio })
        const { empresa } = await r.json()
        setDestino({ estado: "pronto", empresa, inicio })
      })
      .catch(e => { if ((e as Error).name !== "AbortError") setDestino({ estado: "falha", inicio }) })
    return () => controle.abort()
  }, [])
  return destino
}

function iniciais(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("")
}

/** Logo (ou iniciais) e nome da empresa de destino, com o "via NuFlow" discreto. */
export function MarcaEmpresa({ destino }: { destino: DestinoDoFormulario }) {
  const empresa = destino.estado === "pronto" ? destino.empresa : null
  return (
    <Link href={destino.inicio} className={styles.marca} aria-label={empresa ? `Área de ${empresa.nome}` : "Início"}>
      <span className={styles.logo} aria-hidden="true">
        {empresa?.logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={empresa.logoUrl} alt="" />
          : <span>{empresa ? iniciais(empresa.nome) : "N"}</span>}
      </span>
      <span className={styles.nome}>
        <strong>{empresa?.nome ?? (destino.estado === "carregando" ? "Carregando…" : "NuFlow")}</strong>
        <small>via NuFlow</small>
      </span>
    </Link>
  )
}

/** Aviso para link com empresa que não existe, ou API fora do ar. */
export function AvisoDestino({ destino }: { destino: DestinoDoFormulario }) {
  if (destino.estado === "inexistente") {
    return <p role="alert" className={styles.aviso}>Este link não aponta para nenhuma empresa ativa no NuFlow. Confira o endereço com quem enviou antes de preencher.</p>
  }
  if (destino.estado === "falha") {
    return <p role="status" className={styles.aviso}>Não foi possível confirmar para qual empresa este formulário envia. Confira sua conexão e recarregue a página.</p>
  }
  return null
}

"use client"
// Quem pediu para conhecer o NuFlow pela landing (/comecar). Lista para
// trabalhar: achar um contato, abrir o WhatsApp ou o e-mail, levar para a
// planilha. Antes eram cartões de 320 px com datas em 11 px — bonitos com
// cinco contatos, impraticáveis com cem.
import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { Download, Mail, MessageCircle, Search } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { PageIntro } from "@/components/layout/PageIntro"
import { fetcher } from "@/lib/fetcher"
import { hojeEmSaoPaulo } from "@/lib/datas"
import { csvDeInteressados, linkWhatsapp } from "@/lib/interessados"
import styles from "./Interessados.module.css"

export type Interessado = { id: string; nome: string; email: string; telefone: string; empresa: string; mensagem: string | null; origem: string | null; campanha: string | null; createdAt: string }

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })

export function ListaInteressados() {
  const { data, error, isLoading, mutate } = useSWR<{ leads: Interessado[] }>("/api/admin/leads", fetcher)
  const [busca, setBusca] = useState("")
  const todos = useMemo(() => data?.leads ?? [], [data])
  const lista = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR")
    if (!q) return todos
    return todos.filter(l => [l.nome, l.email, l.empresa, l.telefone, l.origem ?? "", l.campanha ?? ""].some(v => v.toLocaleLowerCase("pt-BR").includes(q)))
  }, [todos, busca])

  function baixar() {
    const url = URL.createObjectURL(new Blob([csvDeInteressados(lista)], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `interessados-nuflow-${hojeEmSaoPaulo()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return <>
    <Header title="Interessados no NuFlow" />
    <PageIntro eyebrow="PLATAFORMA / INTERESSADOS" title="Novas conversas começam aqui." description="Os 100 contatos mais recentes que pediram para conhecer o NuFlow pela página de captura.">
      <div className={styles.atalhos}><Link href="/comecar">Abrir página de captura ↗</Link><Link href="/admin/organizacoes">Empresas do SaaS →</Link></div>
    </PageIntro>
    <main className={styles.pagina}>
      <div className={styles.barra}>
        <label className={styles.busca}>
          <Search size={16} aria-hidden="true" />
          <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, e-mail, empresa ou campanha" aria-label="Buscar interessados" />
        </label>
        <span className={styles.total} role="status">{data ? (busca ? `${lista.length} de ${todos.length}` : `${todos.length} ${todos.length === 1 ? "contato" : "contatos"}`) : ""}</span>
        <button type="button" className={styles.baixar} onClick={baixar} disabled={!lista.length}><Download size={16} aria-hidden="true" />Baixar CSV</button>
      </div>

      {isLoading && <p role="status" className={styles.aviso}>Carregando contatos…</p>}
      {error && <div role="alert" className={styles.erro}>Não foi possível abrir os interessados. <button type="button" onClick={() => void mutate()}>Tentar de novo</button></div>}
      {data && !todos.length && <p className={styles.vazio}>Nenhum contato ainda. Use o link da página de captura nas campanhas.</p>}
      {data && todos.length > 0 && !lista.length && <p className={styles.vazio}>Nenhum contato com “{busca}”.</p>}

      {lista.length > 0 && <div className={styles.tabela} role="table" aria-label="Interessados">
        <div className={styles.cabeca} role="row">
          <span role="columnheader">Quando</span><span role="columnheader">Pessoa e empresa</span><span role="columnheader">Contato</span><span role="columnheader">Origem</span>
        </div>
        {lista.map(l => {
          const zap = linkWhatsapp(l.telefone)
          return <article key={l.id} className={styles.linha} role="row">
            <span role="cell" className={styles.data}>{quando(l.createdAt)}</span>
            <span role="cell" className={styles.pessoa}>
              <strong>{l.nome}</strong>
              <span>{l.empresa}</span>
              {l.mensagem && <details><summary>Mensagem</summary><p>{l.mensagem}</p></details>}
            </span>
            <span role="cell" className={styles.contato}>
              <a href={`mailto:${l.email}`}><Mail size={14} aria-hidden="true" />{l.email}</a>
              {zap ? <a href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} aria-hidden="true" />{l.telefone}</a> : <span>{l.telefone}</span>}
            </span>
            <span role="cell" className={styles.origem}>{l.origem || "Não informada"}{l.campanha ? <small>{l.campanha}</small> : null}</span>
          </article>
        })}
      </div>}
    </main>
  </>
}

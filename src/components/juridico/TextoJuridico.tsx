// Lê o texto dos documentos jurídicos (um markdown pequeno) e devolve JSX.
//
// Só o que os documentos usam: "## " título de seção, parágrafo, lista com "- "
// ou "1. ", **negrito**, [texto](/caminho) e a marca [PREENCHER ...], que sai
// destacada para ninguém confundir minuta com versão final. Sem HTML cru: o
// texto é nosso, mas virar JSX elemento a elemento dispensa dangerouslySetInnerHTML.
import Link from "next/link"
import type { ReactNode } from "react"
import s from "./Juridico.module.css"

export type Secao = { id: string; titulo: string }

type Bloco =
  | { tipo: "h2"; texto: string; id: string }
  | { tipo: "p"; texto: string }
  | { tipo: "ul" | "ol"; itens: string[] }

export function idDeSecao(titulo: string): string {
  return titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export function blocosDoTexto(texto: string): Bloco[] {
  const blocos: Bloco[] = []
  let lista: Extract<Bloco, { tipo: "ul" | "ol" }> | null = null
  for (const linhaBruta of texto.split("\n")) {
    const linha = linhaBruta.trim()
    const ul = /^- (.*)$/.exec(linha)
    const ol = /^\d+\. (.*)$/.exec(linha)
    if (ul || ol) {
      const tipo = ul ? "ul" : "ol"
      if (!lista || lista.tipo !== tipo) { lista = { tipo, itens: [] }; blocos.push(lista) }
      lista.itens.push((ul ?? ol)![1])
      continue
    }
    lista = null
    if (!linha) continue
    if (linha.startsWith("## ")) {
      const t = linha.slice(3)
      blocos.push({ tipo: "h2", texto: t, id: idDeSecao(t) })
    } else blocos.push({ tipo: "p", texto: linha })
  }
  return blocos
}

export function secoesDoTexto(texto: string): Secao[] {
  return blocosDoTexto(texto).flatMap(b => b.tipo === "h2" ? [{ id: b.id, titulo: b.texto }] : [])
}

const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\[PREENCHER[^\]]*\])/g

export function Inline({ texto }: { texto: string }): ReactNode {
  return texto.split(INLINE).map((parte, i) => {
    if (!parte) return null
    if (parte.startsWith("**")) return <strong key={i}>{parte.slice(2, -2)}</strong>
    if (parte.startsWith("[PREENCHER")) return <mark key={i} className={s.preencher}>{parte}</mark>
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(parte)
    if (link) return link[2].startsWith("/") ? <Link key={i} href={link[2]}>{link[1]}</Link> : <a key={i} href={link[2]}>{link[1]}</a>
    return parte
  })
}

export function TextoJuridico({ texto }: { texto: string }) {
  return (
    <div className={s.texto}>
      {blocosDoTexto(texto).map((b, i) => {
        if (b.tipo === "h2") return <h2 key={i} id={b.id}>{b.texto}</h2>
        if (b.tipo === "p") return <p key={i}><Inline texto={b.texto} /></p>
        const Tag = b.tipo
        return <Tag key={i}>{b.itens.map((t, j) => <li key={j}><Inline texto={t} /></li>)}</Tag>
      })}
    </div>
  )
}

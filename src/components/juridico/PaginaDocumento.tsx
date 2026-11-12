// Página pública de um documento jurídico: título, versão e data, a faixa de
// minuta, o resumo em linguagem simples, o índice e o texto.
import type { Metadata } from "next"
import Link from "next/link"
import { LogoNuFlow } from "@/components/marca/Marca"
import { DOCUMENTOS, MINUTA, ORDEM_DOCUMENTOS, dataPorExtenso, type SlugDocumento } from "@/lib/juridico/documentos"
import { TEXTOS } from "@/lib/juridico/textos"
import { TextoJuridico, secoesDoTexto } from "./TextoJuridico"
import { LinksJuridicos } from "./LinksJuridicos"
import "@/components/layout/Montserrat.css"
import s from "./Juridico.module.css"

export function metadataDoDocumento(slug: SlugDocumento): Metadata {
  const d = DOCUMENTOS[slug]
  return {
    title: `${d.titulo} — NuFlow`,
    description: TEXTOS[slug].resumo[0],
    alternates: { canonical: d.caminho },
    // Minuta não vai para buscador: o texto ainda muda e tem campos em aberto.
    robots: MINUTA ? { index: false, follow: false } : undefined,
  }
}

export function PaginaDocumento({ slug }: { slug: SlugDocumento }) {
  const d = DOCUMENTOS[slug]
  const { resumo, texto } = TEXTOS[slug]
  const secoes = secoesDoTexto(texto)
  return (
    <div className={s.pagina}>
      <header className={s.topo}>
        <div className={s.topoInterno}>
          <Link href="/" aria-label="NuFlow — início"><LogoNuFlow className={s.marca} /></Link>
          <nav aria-label="Documentos" className={s.outros}>
            {ORDEM_DOCUMENTOS.filter(o => o !== slug).map(o => (
              <Link key={o} href={DOCUMENTOS[o].caminho}>{DOCUMENTOS[o].curto}</Link>
            ))}
          </nav>
        </div>
      </header>

      <main className={s.corpo}>
        {MINUTA && (
          <p className={s.minuta} role="note"><strong>Minuta — revisar com advogado antes de publicar.</strong> Este texto ainda não vale como contrato. Os trechos em amarelo aguardam preenchimento.</p>
        )}
        <p className={s.rotulo}>Documento jurídico</p>
        <h1>{d.titulo}</h1>
        <p className={s.versao}>Versão {d.versao} · {dataPorExtenso(d.data)}</p>

        <section className={s.resumo} aria-labelledby="resumo-titulo">
          <h2 id="resumo-titulo">Em poucas palavras</h2>
          <ul>{resumo.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <p>O resumo ajuda a ler, mas o que vale é o texto completo abaixo.</p>
        </section>

        <nav className={s.indice} aria-label="Índice">
          <p>Índice</p>
          <ol>{secoes.map(x => <li key={x.id}><a href={`#${x.id}`}>{x.titulo.replace(/^\d+\.\s*/, "")}</a></li>)}</ol>
        </nav>

        <TextoJuridico texto={texto} />
      </main>

      <footer className={s.rodape}>
        <div className={s.rodapeInterno}>
          <span>{d.titulo} · versão {d.versao}</span>
          <LinksJuridicos />
        </div>
      </footer>
    </div>
  )
}

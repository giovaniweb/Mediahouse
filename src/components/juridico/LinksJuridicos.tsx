// Links de rodapé para os documentos jurídicos. Arquivo à parte da página do
// documento de propósito: a landing, o login e a área da empresa usam só isto,
// e não devem levar o texto dos contratos junto para o navegador.
import Link from "next/link"
import { DOCUMENTOS, ORDEM_DOCUMENTOS, type SlugDocumento } from "@/lib/juridico/documentos"
import s from "./Juridico.module.css"

export function LinksJuridicos({ className, apenas }: { className?: string; apenas?: SlugDocumento[] }) {
  const lista = apenas ?? ORDEM_DOCUMENTOS
  return (
    <nav aria-label="Termos e privacidade" className={className ? `${s.links} ${className}` : s.links}>
      {lista.map(o => <Link key={o} href={DOCUMENTOS[o].caminho}>{DOCUMENTOS[o].curto}</Link>)}
    </nav>
  )
}

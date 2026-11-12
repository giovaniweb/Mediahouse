// Quem precisa aceitar o quê. Regras puras, sem banco: o servidor
// (aceite-servidor.ts) e os testes usam as mesmas.
import { DOCUMENTOS, marcaDeVersao, type SlugDocumento } from "@/lib/juridico/documentos"

export type OrigemAceite = "cadastro_videomaker" | "cadastro_designer" | "primeiro_acesso" | "nova_versao" | "convite_videomaker"

/** O que a pessoa é NA EMPRESA ativa — o vínculo, não o cadastro global. */
export type PerfilDoAceite = { papel: string | null; categoria: string | null }

/**
 * - Profissional externo (videomaker, designer): Termos do Profissional e Privacidade.
 * - Administrador: aceita em nome da empresa os Termos (que são o contrato de
 *   assinatura), o Acordo de Tratamento de Dados e a Privacidade.
 * - Toda a equipe: Termos de Uso, na parte do usuário, e Privacidade.
 */
export function documentosExigidos(p: PerfilDoAceite): SlugDocumento[] {
  if (p.categoria === "externo" || p.papel === "videomaker" || p.papel === "designer") return ["profissionais", "privacidade"]
  if (p.papel === "admin") return ["termos", "dpa", "privacidade"]
  return ["termos", "privacidade"]
}

/** Os exigidos cuja versão ATUAL ainda não aparece em nenhum aceite da pessoa. */
export function documentosPendentes(exigidos: SlugDocumento[], aceites: { documentos: string[] }[]): SlugDocumento[] {
  const aceitos = new Set(aceites.flatMap(a => a.documentos))
  return exigidos.filter(slug => !aceitos.has(marcaDeVersao(slug)))
}

/** Quem já aceitou alguma vez e volta a ver a tela está aceitando versão nova. */
export function origemDoAceiteNoPainel(aceitesAnteriores: number): OrigemAceite {
  return aceitesAnteriores > 0 ? "nova_versao" : "primeiro_acesso"
}

/** A frase da caixa: "Li e aceito os Termos de Uso e a Política de Privacidade." */
export function fraseDoAceite(slugs: SlugDocumento[]): string {
  const nomes = slugs.map(s => `${artigo(s)} ${DOCUMENTOS[s].curto}`)
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : nomes[0]
  return `Li e aceito ${lista}.`
}

function artigo(slug: SlugDocumento): string {
  if (slug === "privacidade" || slug === "avaliacoes") return "a"
  return slug === "dpa" ? "o" : "os" // os Termos de Uso, os Termos do Profissional
}

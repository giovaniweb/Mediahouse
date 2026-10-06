import { useEffect, useState } from "react"
import type { AnexoIdeia } from "@/lib/social-quadro"

// O formulário de demanda aberto pelo quadro da social (/social).
//
// É o MESMO formulário de nova demanda do Audiovisual e do Growth, com dois
// botões: "Salvar como ideia" grava a ideia (o formulário inteiro vai junto, e
// reabre igual) sem acionar a equipe; "Enviar para a equipe" grava a ideia e
// cria a demanda pelo caminho de sempre, com o id da ideia — o servidor liga as
// duas e marca o pedido como da social.

export type OrigemSocial = {
  /** Ideia já existente; sem ela, o primeiro salvamento cria a ideia. */
  ideiaId?: string
  linhaProjetoId: string
  linhaNome: string
  titulo?: string
  descricao?: string | null
  linkReferencia?: string | null
  /** "YYYY-MM-DD". No formulário, é o campo de data (o prazo do pedido). */
  dataPostagem?: string | null
  /** O formulário como ela deixou na última vez que salvou como ideia. */
  formulario?: Record<string, unknown> | null
  /** Gestor olhando: abre o formulário sem os botões de salvar. */
  somenteLeitura?: boolean
  aoTerminar: (r: { tipo: "ideia" | "pedido"; codigo?: string }) => void
}

export type DadosIdeia = {
  titulo: string
  descricao: string
  linkReferencia: string | null
  area: "audiovisual" | "design"
  dataPostagem: string | null
  formulario: Record<string, unknown>
}

/** Grava a ideia (cria ou atualiza) e devolve o id. Lança Error com a mensagem da API. */
export async function salvarIdeiaSocial(social: OrigemSocial, ideiaId: string | undefined, dados: DadosIdeia): Promise<string> {
  const res = await fetch(ideiaId ? `/api/social/ideias/${ideiaId}` : "/api/social/ideias", {
    method: ideiaId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...dados, linhaProjetoId: social.linhaProjetoId }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Não foi possível salvar a ideia.")
  return json.id ?? ideiaId
}

/** Valores iniciais do formulário a partir da ideia. A data da ideia vence a do formulário salvo. */
export function valoresDaIdeia<T extends object>(social: OrigemSocial, campoData: keyof T): Partial<T> {
  const salvo = (social.formulario ?? {}) as Partial<T>
  return {
    ...salvo,
    titulo: (salvo as { titulo?: string }).titulo || social.titulo || "",
    descricao: (salvo as { descricao?: string }).descricao || social.descricao || "",
    referencias: (salvo as { referencias?: string[] }).referencias?.length
      ? (salvo as { referencias?: string[] }).referencias
      : social.linkReferencia ? [social.linkReferencia] : [],
    [campoData]: social.dataPostagem ?? (salvo[campoData] as unknown) ?? "",
  } as Partial<T>
}

/**
 * O formulário mudou desde que a ideia foi carregada? Fechar sem mudar nada não
 * deve perguntar "fechar sem salvar?". `carregado` vira true no mesmo passo em
 * que a ideia é aplicada, então a foto de base já sai com os valores dela.
 */
export function useMudouDesdeAbrir(carregado: boolean, valores: unknown): boolean {
  const atual = JSON.stringify(valores)
  const [base, setBase] = useState<string | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- foto do formulário logo depois de carregar a ideia
    if (carregado && base === null) setBase(atual)
  }, [carregado, base, atual])
  return base !== null && base !== atual
}

/** "Salvar como ideia" pede título OU descrição: sem título, vale a 1ª linha da descrição. */
export function tituloDaIdeia(titulo: string, descricao: string): string {
  return titulo.trim() || descricao.trim().split("\n")[0].trim().slice(0, 120)
}

function lerAnexos(formulario: unknown): AnexoIdeia[] {
  const lista = (formulario as { anexosIdeia?: unknown } | null | undefined)?.anexosIdeia
  return Array.isArray(lista)
    ? lista.flatMap((a) => typeof a?.url === "string" ? [{ url: a.url, nome: typeof a.nome === "string" ? a.nome : "arquivo" }] : [])
    : []
}

/** Sobe os arquivos de referência para o caminho da ideia. Devolve os que subiram e os que não. */
export async function subirAnexosDaIdeia(ideiaId: string, arquivos: File[]): Promise<{ anexos: AnexoIdeia[]; falhas: string[] }> {
  const anexos: AnexoIdeia[] = []
  const falhas: string[] = []
  for (const arquivo of arquivos) {
    try {
      const tipo = arquivo.type || "application/octet-stream"
      const res = await fetch(`/api/social/ideias/${ideiaId}/anexo?contentType=${encodeURIComponent(tipo)}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.uploadUrl) throw new Error(json.error ?? "sem URL")
      const envio = await fetch(json.uploadUrl, { method: "PUT", headers: { "Content-Type": tipo }, body: arquivo })
      if (!envio.ok) throw new Error(`HTTP ${envio.status}`)
      anexos.push({ url: json.url, nome: arquivo.name })
    } catch {
      falhas.push(arquivo.name)
    }
  }
  return { anexos, falhas }
}

/**
 * A ideia por trás do formulário: o id (nasce no primeiro "Salvar como ideia")
 * e os arquivos de referência já guardados nela. `gravar` salva o formulário,
 * sobe os arquivos novos e grava a lista — dois PATCH quando há arquivo,
 * porque o caminho do arquivo leva o id da ideia.
 */
export function useIdeiaSocial(social: OrigemSocial | undefined) {
  const [ideiaId, setIdeiaId] = useState(social?.ideiaId)
  const [anexosIdeia, setAnexosIdeia] = useState<AnexoIdeia[]>(() => lerAnexos(social?.formulario))

  async function gravar(dados: DadosIdeia, arquivos: File[]): Promise<{ id: string; falhas: string[] }> {
    const id = await salvarIdeiaSocial(social!, ideiaId, { ...dados, formulario: { ...dados.formulario, anexosIdeia } })
    setIdeiaId(id)
    if (arquivos.length === 0) return { id, falhas: [] }
    const { anexos, falhas } = await subirAnexosDaIdeia(id, arquivos)
    if (anexos.length > 0) {
      const todos = [...anexosIdeia, ...anexos]
      await salvarIdeiaSocial(social!, id, { ...dados, formulario: { ...dados.formulario, anexosIdeia: todos } })
      setAnexosIdeia(todos)
    }
    return { id, falhas }
  }

  return { anexosIdeia, setAnexosIdeia, gravar }
}

// Mídia privada — briefings, vídeos, notas fiscais, thumbnails.
//
// O bucket `uploads` é PÚBLICO: qualquer pessoa com a URL baixa o arquivo, sem
// login, para sempre. Verificado em 24/08/2026 com HTTP 200 num PDF de briefing
// real. Enquanto havia um cliente só, era um risco aceito; com o SaaS, é
// briefing e nota fiscal de cliente pagante abertos na internet.
//
// O bucket novo `midia` é PRIVADO. Nada nele é acessível direto: a leitura passa
// por `/api/midia/...`, que confere quem está pedindo e só então gera uma URL
// assinada de curta duração.
//
// O caminho carrega a organização — `org/{organizacaoId}/{tipo}/{id}/arquivo` —
// para a checagem de acesso não depender de consultar o banco a cada byte, e
// para o dia da RLS o dono do arquivo já estar explícito no próprio caminho.
import { createClient, SupabaseClient } from "@supabase/supabase-js"

export const BUCKET_PRIVADO = "midia"

/** Quanto tempo a URL assinada vive. Curto: ela vaza tão fácil quanto a antiga. */
export const VALIDADE_URL_SEGUNDOS = 60 * 10

let _cliente: SupabaseClient | null = null
function cliente(): SupabaseClient | null {
  if (_cliente) return _cliente
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("[midia] NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes.")
    return null
  }
  _cliente = createClient(url, key)
  return _cliente
}

/**
 * Garante o bucket privado. Diferente do código antigo, que chamava
 * `createBucket` a CADA upload (uma ida ao Supabase desperdiçada por requisição),
 * aqui o resultado fica em memória depois do primeiro acerto.
 */
let _bucketPronto = false
async function garantirBucket(): Promise<boolean> {
  if (_bucketPronto) return true
  const sb = cliente()
  if (!sb) return false
  const { error } = await sb.storage.createBucket(BUCKET_PRIVADO, { public: false })
  if (error && !error.message.toLowerCase().includes("already exist")) {
    console.error("[midia] Falha ao criar bucket:", error.message)
    return false
  }
  _bucketPronto = true
  return true
}

export type TipoMidia = "docs" | "videos" | "thumbnails" | "nf" | "coberturas" | "depoimentos"

/** `org/{organizacaoId}/{tipo}/{id}/{timestamp}.{ext}` — o dono vem no caminho. */
export function caminhoMidia(p: {
  organizacaoId: string
  tipo: TipoMidia
  id: string
  ext: string
}): string {
  return `org/${p.organizacaoId}/${p.tipo}/${p.id}/${Date.now()}.${p.ext.replace(/^\./, "")}`
}

/** A URL que vai para o banco. É do NOSSO app, não do Supabase: as telas que já
 *  usam `<img src>` e `<video src>` continuam funcionando sem mudar nada, e o
 *  controle de acesso passa a existir onde antes não havia nenhum. */
export function urlDaMidia(caminho: string): string {
  return `/api/midia/${caminho}`
}

/** Extrai o caminho de uma URL nossa. `null` se não for do bucket privado —
 *  é assim que o código distingue o acervo antigo (público) do novo. */
export function caminhoDaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/^\/api\/midia\/(.+)$/)
  return m ? m[1] : null
}

/** Organização dona do arquivo, lida do próprio caminho. */
export function organizacaoDoCaminho(caminho: string): string | null {
  const m = caminho.match(/^org\/([^/]+)\//)
  return m ? m[1] : null
}

/** URL assinada para SUBIR. O cliente sobe direto para o Supabase com ela. */
export async function urlDeUpload(caminho: string): Promise<{ uploadUrl: string; url: string } | null> {
  if (!(await garantirBucket())) return null
  const sb = cliente()
  if (!sb) return null
  const { data, error } = await sb.storage.from(BUCKET_PRIVADO).createSignedUploadUrl(caminho)
  if (error || !data?.signedUrl) {
    console.error("[midia] Falha ao gerar URL de upload:", error?.message)
    return null
  }
  return { uploadUrl: data.signedUrl, url: urlDaMidia(caminho) }
}

/** Sobe um buffer direto (uploads feitos no servidor, como a nota fiscal). */
export async function subirArquivo(
  caminho: string,
  corpo: Buffer | ArrayBuffer,
  contentType: string
): Promise<string | null> {
  if (!(await garantirBucket())) return null
  const sb = cliente()
  if (!sb) return null
  const { error } = await sb.storage.from(BUCKET_PRIVADO).upload(caminho, corpo, { contentType, upsert: false })
  if (error) {
    console.error("[midia] Falha no upload:", error.message)
    return null
  }
  return urlDaMidia(caminho)
}

/**
 * Validade longa, para consumidor que é MÁQUINA: worker de transcode, cópia
 * para o Drive, montagem de ZIP. Dez minutos bastam para um navegador começar a
 * tocar o vídeo, mas não para um worker baixar 2 GB e converter.
 */
export const VALIDADE_MAQUINA_SEGUNDOS = 60 * 120

/** URL assinada para LER. Curta por padrão: quem recebe já passou pela checagem. */
export async function urlAssinadaDeLeitura(
  caminho: string,
  segundos: number = VALIDADE_URL_SEGUNDOS
): Promise<string | null> {
  const sb = cliente()
  if (!sb) return null
  const { data, error } = await sb.storage
    .from(BUCKET_PRIVADO)
    .createSignedUrl(caminho, segundos)
  if (error || !data?.signedUrl) {
    console.error("[midia] Falha ao assinar leitura:", error?.message)
    return null
  }
  return data.signedUrl
}

/**
 * Anexa o token a uma URL nossa de mídia, para páginas por token (aprovação de
 * vídeo, acompanhamento público). Deixa qualquer outra URL intacta — o acervo
 * antigo continua público e não precisa de token.
 *
 * A alternativa seria a página passar o token; isso obrigaria a mexer em toda
 * tela pública. Resolvendo aqui, no servidor, a página não muda.
 */
export function comToken(url: string | null | undefined, token: string): string | null {
  if (!url) return null
  if (!caminhoDaUrl(url)) return url
  return `${url}?token=${encodeURIComponent(token)}`
}

/**
 * Resolve uma URL nossa para uma assinada, pronta para consumo direto.
 *
 * É o que a galeria pública usa: ela não tem token, mas o próprio endpoint já
 * decidiu que aquele item é público — então assina no servidor e entrega. URL
 * que não é do bucket privado passa direto.
 */
export async function resolverParaAssinada(
  url: string | null | undefined,
  segundos: number = VALIDADE_URL_SEGUNDOS
): Promise<string | null> {
  if (!url) return null
  const caminho = caminhoDaUrl(url)
  if (!caminho) return url
  return (await urlAssinadaDeLeitura(caminho, segundos)) ?? null
}

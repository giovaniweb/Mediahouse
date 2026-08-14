// Autorização temporária para anexar arquivo a uma demanda recém-criada pelo
// formulário PÚBLICO.
//
// O problema: o upload é por demandaId, e a demanda só existe depois do envio do
// formulário. Quem preenche não tem sessão, e a rota de upload normal exige uma.
//
// Por que não reusar o `publicToken` da demanda: aquele é o link de
// acompanhamento — read-only, de vida longa e feito para ser compartilhado.
// Dar poder de ESCRITA a ele significaria que qualquer pessoa com o link de
// acompanhamento poderia subir arquivo na demanda.
//
// Este token é assinado (HMAC), some sozinho e vale para UMA demanda:
//   - não precisa de coluna nova nem de migration
//   - não pode ser forjado sem o segredo do servidor
//   - expira em 30 minutos, tempo de anexar logo após enviar o formulário
//
// Continua sendo uma porta sem autenticação: quem chama a rota de upload aplica
// limite por IP, teto de tamanho, lista de tipos e máximo de arquivos.
import { createHmac, timingSafeEqual } from "node:crypto"

const VALIDADE_MS = 30 * 60 * 1000

function segredo(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("NEXTAUTH_SECRET ausente — não é possível assinar o token de anexo")
  return s
}

function assinar(corpo: string): string {
  return createHmac("sha256", segredo()).update(corpo).digest("base64url")
}

/** Token de anexo para uma demanda, válido por 30 minutos. */
export function gerarTokenAnexo(demandaId: string, agora = Date.now()): string {
  const corpo = `${demandaId}.${agora + VALIDADE_MS}`
  return `${Buffer.from(corpo).toString("base64url")}.${assinar(corpo)}`
}

/**
 * Devolve o demandaId quando o token é autêntico e não expirou; null caso
 * contrário. Nunca lança — token malformado é só token inválido.
 */
export function lerTokenAnexo(token: string, agora = Date.now()): string | null {
  try {
    const [corpoB64, assinatura] = token.split(".")
    if (!corpoB64 || !assinatura) return null

    const corpo = Buffer.from(corpoB64, "base64url").toString("utf8")
    const esperada = assinar(corpo)

    // Comparação de tempo constante, mesmo padrão dos outros segredos do projeto.
    const a = Buffer.from(assinatura)
    const b = Buffer.from(esperada)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null

    const [demandaId, expiraEm] = corpo.split(".")
    if (!demandaId || !expiraEm) return null
    if (Number(expiraEm) <= agora) return null

    return demandaId
  } catch {
    return null
  }
}

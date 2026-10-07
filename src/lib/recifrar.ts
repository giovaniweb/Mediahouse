// Recifra, de uma vez, todo dado sensível que ainda está no formato antigo
// (ligado ao segredo do login) com a chave própria CHAVE_CIFRA_DADOS.
//
// Por que existe: o código novo já regrava com a chave nova cada dado que é
// salvo, mas PIX de quem não mexe no cadastro fica para sempre no formato
// antigo. Enquanto houver um só, trocar o segredo do login o perde. Isto passa
// tudo e diz quantos ficaram para trás.
//
// Seguro de repetir: só toca no que está no formato antigo, e o UPDATE confere
// que o valor não mudou desde a leitura (quem salvou no meio ganha). Dado que
// não abre com nenhuma chave não é tocado: entra em "ilegiveis".
//
// Sem `aplicar`, só conta (o "conferir"). Roda pela conexão de administração,
// porque passa por todas as empresas — quem chama tem que ser super-admin.
import type { PrismaClient } from "@prisma/client"
import { chaveNovaAtiva, cifradoNoFormatoAntigo, decryptSecret, encryptSecret } from "@/lib/secret-crypto"

/** Toda coluna cifrada por lib/secret-crypto. Nomes fixos: nada vem de fora. */
export const COLUNAS_CIFRADAS = [
  { tabela: "videomaker_dados_fiscais", colunas: ["chavePix", "dadosBancarios"] },
  { tabela: "editor_dados_fiscais", colunas: ["chavePix", "dadosBancarios"] },
  { tabela: "designer_dados_fiscais", colunas: ["chavePix", "dadosBancarios"] },
  { tabela: "config_whatsapp", colunas: ["webhookSecret"] },
  { tabela: "config_email_entrada", colunas: ["refreshTokenCriptografado"] },
  { tabela: "inbox_whatsapp", colunas: ["conteudoCifrado"] },
  { tabela: "saidas_whatsapp", colunas: ["telefoneCifrado", "conteudoCifrado"] },
] as const

export type ResultadoRecifrar = {
  aplicado: boolean
  pendentes: number
  recifrados: number
  ilegiveis: number
  porTabela: Record<string, { pendentes: number; recifrados: number; ilegiveis: number }>
}

const LOTE = 200

export async function recifrarTudo(db: Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">, opcoes: { aplicar: boolean }): Promise<ResultadoRecifrar> {
  if (!chaveNovaAtiva()) throw new Error("CHAVE_CIFRA_DADOS não está configurada (ou tem menos de 32 caracteres).")
  const r: ResultadoRecifrar = { aplicado: opcoes.aplicar, pendentes: 0, recifrados: 0, ilegiveis: 0, porTabela: {} }

  for (const { tabela, colunas } of COLUNAS_CIFRADAS) {
    const t = (r.porTabela[tabela] = { pendentes: 0, recifrados: 0, ilegiveis: 0 })
    for (const coluna of colunas) {
      let ultimo = ""
      for (;;) {
        const linhas = await db.$queryRawUnsafe<{ id: string; valor: string }[]>(
          `SELECT id, "${coluna}" AS valor FROM "${tabela}"
            WHERE "${coluna}" IS NOT NULL AND "${coluna}" <> '' AND "${coluna}" NOT LIKE 'v2.%' AND id > $1
            ORDER BY id LIMIT ${LOTE}`, ultimo)
        if (!linhas.length) break
        ultimo = linhas[linhas.length - 1].id
        for (const { id, valor } of linhas) {
          if (!cifradoNoFormatoAntigo(valor)) continue
          t.pendentes++
          let claro: string
          try { claro = decryptSecret(valor) } catch { t.ilegiveis++; continue }
          if (!opcoes.aplicar) continue
          const n = await db.$executeRawUnsafe(
            `UPDATE "${tabela}" SET "${coluna}" = $1 WHERE id = $2 AND "${coluna}" = $3`, encryptSecret(claro), id, valor)
          if (n) t.recifrados++
        }
      }
    }
    r.pendentes += t.pendentes
    r.recifrados += t.recifrados
    r.ilegiveis += t.ilegiveis
  }
  return r
}

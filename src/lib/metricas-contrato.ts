import { z } from "zod"
const n = z.number().finite().nonnegative()
export const snapshotOperacionalSchema = z.object({
  versao: z.literal(1),
  recorte: z.object({ versao: z.literal(1), area: z.enum(["audiovisual", "design"]), fuso: z.literal("America/Sao_Paulo"), tipo: z.string(), de: z.string(), ate: z.string(), inicio: z.iso.datetime(), fim: z.iso.datetime() }).strict(),
  geradoEm: z.iso.datetime(), criadas: n, concluidas: n, ativas: n, entregaveis: n, publicacoes: n.nullable(), finalizadasSemData: n,
  tempoMedioDias: n.nullable(), noPrazoPercentual: n.max(100).nullable(),
  manual: z.object({ fonte: z.literal("lancamento_mensal"), lancamentos: z.array(z.object({ competencia: z.number().int(), grupo: z.string(), categoria: z.string(), quantidade: z.number().int() })), total: z.number().int(), totalCombinado: z.null(), aviso: z.string() }),
}).strict()

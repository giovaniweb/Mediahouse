// Texto de cada documento. Importado só pelas páginas públicas (servidor).
import type { SlugDocumento } from "@/lib/juridico/documentos"
import * as termos from "./termos"
import * as privacidade from "./privacidade"
import * as dpa from "./dpa"
import * as profissionais from "./profissionais"
import * as avaliacoes from "./avaliacoes"

export const TEXTOS: Record<SlugDocumento, { resumo: string[]; texto: string }> = {
  termos, privacidade, dpa, profissionais, avaliacoes,
}

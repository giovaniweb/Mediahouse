// O kit do videomaker das Gravações Externas, em regras puras (sem banco): o
// que é cada material, o que vale para cada tipo de gravação e a colinha do dia.
//
// Pedido do Giovani (29/10/2026): o "Guia Operacional de Captação" (PDF) e os
// vídeos de referência vão para o videomaker na primeira gravação, ficam para
// ele consultar na página do convite e podem ser reenviados pelo card. No dia
// da gravação, uma colinha curta no WhatsApp.

export type TipoDeMaterial = "guia" | "referencia" | "colinha"

export const TIPOS_DE_MATERIAL: { id: TipoDeMaterial; rotulo: string }[] = [
  { id: "guia", rotulo: "Guia" },
  { id: "referencia", rotulo: "Referência" },
  { id: "colinha", rotulo: "Colinha do dia" },
]

export function ehTipoDeMaterial(v: unknown): v is TipoDeMaterial {
  return TIPOS_DE_MATERIAL.some((t) => t.id === v)
}

export type Material = {
  id: string
  titulo: string
  tipo: string
  url?: string | null
  texto?: string | null
  tipoGravacao?: string | null
  ordem?: number
}

/** O que vale para esta gravação: o do tipo dela e o que vale para todos. */
export function materiaisDaGravacao<M extends Material>(lista: M[], tipoGravacao: string | null | undefined): M[] {
  return lista
    .filter((m) => !m.tipoGravacao || m.tipoGravacao === tipoGravacao)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.titulo.localeCompare(b.titulo))
}

/** A colinha da gravação: a do tipo dela vence a geral. */
export function colinhaDaGravacao(lista: Material[], tipoGravacao: string | null | undefined): Material | null {
  const colinhas = lista.filter((m) => m.tipo === "colinha" && m.texto?.trim())
  return colinhas.find((m) => m.tipoGravacao && m.tipoGravacao === tipoGravacao) ?? colinhas.find((m) => !m.tipoGravacao) ?? null
}

/** Troca {cliente}, {hora}, {endereco} e {link} pelos dados da gravação. */
export function preencherColinha(texto: string, d: { cliente: string; hora?: string | null; endereco?: string | null; link?: string | null }): string {
  return texto
    .replaceAll("{cliente}", d.cliente)
    .replaceAll("{hora}", d.hora ?? "")
    .replaceAll("{endereco}", d.endereco ?? "")
    .replaceAll("{link}", d.link ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Sugestão de colinha para entrega de equipamento, tirada do Guia Operacional
 * de Captação da Contourline: as duas peças, o setup e os quatro blocos do
 * roteiro. Editável no kit.
 */
export const COLINHA_ENTREGA_DE_EQUIPAMENTO = `🎬 Colinha de hoje — {cliente}, {hora}
{endereco}

Entrega: 1 hype (até 40s) + 1 depoimento (até 60s). 4K vertical 9:16, takes de 5 a 10s, lapela no médico.

1. Clínica (antes da caixa chegar): fachada, recepção, estrutura, médico e equipe, detalhes.
2. Chegada: caixa entrando, descarregamento, desembalando, montagem, detalhes, tela ligando (2x), médico conhecendo. Peça 30s antes de abrirem a caixa.
3. Aplicação: preparo do paciente, configuração, aplicador, equipamento funcionando, aplicação (aberto, médio e close), reação.
4. Depoimento, por último. Uma pergunta de cada:
• O que faltava na clínica antes desse equipamento?
• O que mais te surpreendeu?
• O que confirmou que foi a decisão certa?
• Que conselho daria a outro médico?
Resposta genérica? "Mas por quê?", "O que exatamente você percebeu?", "Me dá um exemplo." Nunca fale por cima.

Depois: limpe o material e entregue os brutos pelo link:
{link}`

import type { EdicaoDaGravacao, SituacaoDaNota } from "@/lib/etapas-da-gravacao"

// As etiquetas da gravação externa — quem grava, quem edita, a nota — no MESMO
// desenho das do card de Demandas (DemandaCard.tsx: "📷 Sem VM", "⏳ Aguardando
// VM", "Social"): texto de 10px, fundo e borda do mesmo tom. Nada de estilo
// novo; o card do quadro e a ficha do card aberto usam estas mesmas.
const base = "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap"

export const TAG = {
  alerta: `${base} font-bold bg-orange-500/15 text-orange-400 border-orange-500/30`,
  espera: `${base} font-bold bg-amber-500/15 text-amber-400 border-amber-500/30`,
  roxo: `${base} font-medium bg-purple-500/15 text-purple-300 border-purple-500/30`,
  azul: `${base} font-medium bg-sky-500/15 text-sky-300 border-sky-500/30`,
  verde: `${base} font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30`,
  vermelho: `${base} font-bold bg-red-500/20 text-red-300 border-red-500/40`,
  neutro: `${base} bg-zinc-700/50 text-zinc-400 border-zinc-600/50`,
}

export const TAG_DA_NOTA: Record<SituacaoDaNota["tom"], string> = {
  falta: TAG.espera,
  andamento: TAG.azul,
  ok: TAG.verde,
  alerta: TAG.vermelho,
}

export const TAG_DA_EDICAO: Record<EdicaoDaGravacao, { classe: string; icone: string }> = {
  equipe: { classe: TAG.roxo, icone: "✂️" },
  videomaker: { classe: TAG.azul, icone: "🎬" },
  sem_edicao: { classe: TAG.neutro, icone: "📦" },
}

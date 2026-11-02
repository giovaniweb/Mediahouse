"use client"

// O momento do vídeo no texto do ajuste: "[1:07] cortar a fala".
//
// Quem pede ajuste marca o instante com "Marcar este momento"; o editor, do
// outro lado, precisa ir direto ao ponto. Aqui o "[1:07]" vira botão que leva
// o player até lá — no link do cliente, no detalhe e no aviso do topo.

/** Segundos → "1:07". O formato que a equipe de edição já usa para se localizar. */
export function timecode(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

const MARCA = /\[(\d{1,2}(?::\d{2}){1,2})\]/g

/** "1:07" ou "1:02:07" → segundos. */
export function segundosDe(marca: string): number {
  return marca.split(":").map(Number).reduce((total, parte) => total * 60 + parte, 0)
}

/** Leva o player ao instante e dá play, sem roubar a rolagem de quem não está vendo o vídeo. */
export function irPara(video: HTMLVideoElement | null | undefined, segundos: number) {
  if (!video) return
  video.currentTime = segundos
  video.scrollIntoView({ behavior: "smooth", block: "center" })
  void video.play().catch(() => null)
}

export function TextoComMomentos({ texto, onIr, className }: {
  texto: string
  /** Sem ele (nenhum player na tela), a marca aparece como texto. */
  onIr?: (segundos: number) => void
  className?: string
}) {
  const partes: React.ReactNode[] = []
  let ultimo = 0
  for (const m of texto.matchAll(MARCA)) {
    const i = m.index ?? 0
    if (i > ultimo) partes.push(texto.slice(ultimo, i))
    partes.push(onIr ? (
      <button
        key={i}
        type="button"
        onClick={() => onIr(segundosDe(m[1]))}
        title={`Ir para ${m[1]} no vídeo`}
        className="inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-px font-mono text-[0.9em] font-semibold text-amber-200 hover:bg-amber-500/30 underline-offset-2 hover:underline"
      >
        {m[1]}
      </button>
    ) : <b key={i} className="font-mono">{m[1]}</b>)
    ultimo = i + m[0].length
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo))
  return <span className={className} style={{ whiteSpace: "pre-wrap" }}>{partes}</span>
}

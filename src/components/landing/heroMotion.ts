// A animação do topo da landing, aprovada pelo Giovani em 02/10: as mensagens
// soltas do WhatsApp viram um card organizado, o card percorre as etapas do
// quadro com um aviso a cada passo, e no fim aparece a marca.
//
// O movimento é o mesmo do protótipo (palco fixo de 440×500 que escala para a
// coluna); só saiu do runtime antigo da landing para este módulo. Quem pede
// menos movimento vê o card já organizado, parado.

type Opcoes = { palco: HTMLElement; moldura: HTMLElement; botao?: HTMLButtonElement | null; fase?: HTMLElement | null }

export function iniciarMotionDoHero({ palco: stage, moldura: outer, botao: toggle, fase: phaseEl }: Opcoes): () => void {
  const W = 440, T = 11
  const reduce = !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const prog = (t: number, s: number, d: number) => clamp((t - s) / d)
  const io = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
  const out = (x: number) => 1 - Math.pow(1 - x, 3)
  const back = (x: number) => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2) }
  const el = (cls: string, html?: string, parent: HTMLElement = stage) => {
    const d = document.createElement("div"); d.className = cls; if (html) d.innerHTML = html; parent.appendChild(d); return d
  }
  const put = (n: HTMLElement, x: number, y: number, s = 1, r = 0, o = 1) => {
    n.style.transform = `translate(${x}px,${y}px) rotate(${r}deg) scale(${s})`
    n.style.opacity = String(o)
    n.style.visibility = o <= 0.001 ? "hidden" : "visible"
  }

  // linha do card de destino: 0 briefing · 1 captação · 2 brutos · 3 prazo · 4 aprovação
  const MSGS = [
    { who: "Cliente", c: "#f5a97f", text: "Cadê o vídeo do Dr. Paulo?", x: 18, y: 54, r: -4, row: 3 },
    { who: "Gestão", c: "#a6e3a1", text: "Quem grava amanhã às 9h?", x: 215, y: 78, r: 5, row: 1 },
    { who: "Rafael", c: "#89b4fa", audio: "0:47", x: 34, y: 140, r: 3, row: 1 },
    { who: "Ana · edição", c: "#cba6f7", text: "Manda o link dos brutos de novo?", x: 222, y: 168, r: -6, row: 2 },
    { who: "Cliente", c: "#f5a97f", text: "O prazo não era ontem?", x: 14, y: 236, r: -3, row: 3 },
    { who: "Ana · edição", c: "#cba6f7", text: "Qual é a final? v3 ou v3_final?", x: 196, y: 266, r: 4, row: 4 },
    { who: "Gestão", c: "#a6e3a1", text: "Alguém aprovou?", x: 42, y: 334, r: 6, row: 4 },
    { who: "Atendimento", c: "#f9e2af", text: "O briefing tá no e-mail, acho", x: 214, y: 352, r: -5, row: 0 },
    { who: "Ana · edição", c: "#cba6f7", text: "Tô sem os brutos", x: 120, y: 420, r: 2, row: 2 },
  ]
  const clock = ["09:12", "09:14", "09:15", "09:21", "09:22", "09:30", "09:31", "09:33", "09:40"]
  const bubbles = MSGS.map((m, i) => el("nm-bubble",
    `<span class="nm-who" style="color:${m.c}">${m.who}</span>` +
    (m.audio ? `<span class="nm-audio"><span class="nm-play"></span><span class="nm-wave"></span><span>${m.audio}</span></span>` : m.text) +
    `<span class="nm-meta">${clock[i]}<i>✓✓</i></span>`))
  const unread = el("nm-unread", "<b>0</b> não lidas"), countEl = unread.querySelector("b")!
  const ROWS = [["Briefing", "anexado"], ["Captação", "Rafael · qui 09:00"], ["Brutos", "na pasta do job"], ["Prazo", "sex 14:00"], ["Aprovação", "v3 enviada"]]
  const card = el("nm-card", "<small>VOP-26-1042 · Audiovisual</small><h3>Filme de lançamento</h3>")
  const CARD = { x: 50, y: 90 }, ROW_Y0 = 92, ROW_H = 40
  const rows = ROWS.map(([a, b], i) => {
    const r = el("nm-row", `<span>${a}</span><em>${b}</em><b>✓</b>`, card); r.style.top = ROW_Y0 + i * ROW_H + "px"
    return { node: r, tick: r.querySelector("b")!, em: r.querySelector("em")! }
  })
  const ORG0 = 3.65, ORG_STEP = 0.13, FLY = 0.55, order = [7, 1, 2, 3, 8, 0, 4, 5, 6]
  const flyStart = (i: number) => ORG0 + order.indexOf(i) * ORG_STEP
  const rowDone = ROWS.map((_, r) => Math.max(...MSGS.map((m, i) => (m.row === r ? flyStart(i) + FLY : 0))))
  const COLS = [["Entrada", "#a8a2b8"], ["Produção", "#6a9bff"], ["Edição", "#b980fc"], ["Aprovação", "#edac56"], ["Concluído", "#75c99d"]]
  const colX = (k: number) => 8 + k * 86
  const cols = COLS.map(([n, c], k) => { const d = el("nm-col", `<b>${n}</b>`); d.style.setProperty("--c", c); d.style.left = colX(k) + "px"; return d })
  const mini = el("nm-mini", "<strong>Filme de lançamento</strong><span><i></i><em>Entrada</em></span>")
  const miniStage = mini.querySelector("em")!, miniDot = mini.querySelector("i")!
  const HOP0 = 6.05, HOP = 0.68
  const TOASTS = ["Rafael, você foi escalado para Filme de lançamento. Captação qui, 09:00.", "Brutos recebidos. Ana começou a edição.", "Versão v3 pronta. Toque para revisar e aprovar.", "Aprovado pelo cliente. Entrega concluída."]
  const TOAST_T = ["09:00", "11:42", "16:05", "17:20"]
  const toast = el("nm-toast", "<strong><span>WhatsApp · NuFlow</span><time></time></strong><p></p>")
  const toastP = toast.querySelector("p")!, toastTime = toast.querySelector("time")!
  const brand = el("nm-brand", "<div>NuFlow<i>.</i></div><p>O Flow devolve.</p>"), brandP = brand.querySelector("p")!
  const PHASES: [string, number][] = [["Caos", 0], ["Organiza", 3.55], ["Flui", 5.45], ["NuFlow", 8.8]]

  function render(t: number) {
    MSGS.forEach((m, i) => {
      const b = bubbles[i], pop = back(prog(t, 0.2 + i * 0.3, 0.38)), fs = flyStart(i), f = io(prog(t, fs, FLY))
      if (t < fs) {
        const shake = t > 3.05 ? Math.sin(t * 46 + i) * 1.6 * prog(t, 3.05, 0.4) : 0, float = Math.sin(t * 1.7 + i * 1.3) * 2.2
        put(b, m.x + shake, m.y + float, lerp(0.6, 1, pop), m.r * pop, prog(t, 0.2 + i * 0.3, 0.18))
      } else {
        const tx = CARD.x + 24, ty = CARD.y + ROW_Y0 + m.row * ROW_H + 6
        put(b, lerp(m.x, tx, f), lerp(m.y, ty, f), lerp(1, 0.32, f), lerp(m.r, 0, f), 1 - prog(f, 0.65, 0.35))
      }
    })
    const up = Math.round(48 * out(prog(t, 0.2, 3))), left = MSGS.filter((_, i) => t < flyStart(i) + FLY * 0.6).length
    countEl.textContent = String(t < ORG0 ? up : Math.round((up * left) / MSGS.length))
    put(unread, 0, 0, 1, 0, prog(t, 0.3, 0.3) * (1 - prog(t, 5, 0.25)))
    const cIn = out(prog(t, 3.5, 0.4)), cOut = io(prog(t, 5.4, 0.55))
    put(card, lerp(0, colX(0) + 5 - 50 - 135, cOut), lerp(0, 132 - 90 - 111, cOut), lerp(0.94, 1, cIn) * lerp(1, 0.21, cOut), 0, cIn * (1 - prog(t, 5.6, 0.35)))
    rows.forEach((r, i) => {
      r.tick.style.transform = `scale(${back(prog(t, rowDone[i] - 0.05, 0.3))})`
      r.node.style.opacity = String(0.35 + 0.65 * prog(t, rowDone[i] - 0.1, 0.2))
      r.em.style.opacity = String(prog(t, rowDone[i] - 0.05, 0.25))
    })
    const boardOut = prog(t, 8.8, 0.45)
    cols.forEach((c, k) => { const a = out(prog(t, 5.42 + k * 0.06, 0.4)); put(c, 0, lerp(16, 0, a), 1, 0, a * (1 - boardOut)) })
    let pos = 0
    for (let k = 1; k < COLS.length; k++) pos += io(prog(t, HOP0 + (k - 1) * HOP, 0.42))
    const k = Math.min(COLS.length - 1, Math.round(pos))
    miniStage.textContent = COLS[k][0]; miniDot.style.background = COLS[k][1]
    put(mini, lerp(colX(0) + 5, colX(COLS.length - 1) + 5, pos / (COLS.length - 1)), Math.sin(Math.PI * (pos % 1)) * -14, 1 + Math.sin(Math.PI * (pos % 1)) * 0.06, 0, prog(t, 5.75, 0.25) * (1 - boardOut))
    const hop = Math.floor((t - HOP0 - 0.38) / HOP)
    if (hop >= 0 && hop < TOASTS.length && t < 8.8) {
      const local = t - HOP0 - 0.38 - hop * HOP, a = out(clamp(local / 0.22))
      toastP.textContent = TOASTS[hop]; toastTime.textContent = TOAST_T[hop]
      put(toast, 0, lerp(26, 0, a), 1, 0, hop === TOASTS.length - 1 ? a : a * (1 - prog(local, HOP - 0.12, 0.12)))
    } else if (t >= 8.8) put(toast, 0, 0, 1, 0, 1 - boardOut)
    else put(toast, 0, 26, 1, 0, 0)
    const bIn = out(prog(t, 9, 0.6))
    put(brand, 0, lerp(18, 0, bIn), lerp(0.94, 1, bIn), 0, bIn * (1 - prog(t, 10.6, 0.4)))
    brandP.style.opacity = String(prog(t, 9.35, 0.5))
    if (phaseEl) phaseEl.textContent = PHASES.reduce((acc, p) => (t >= p[1] ? p[0] : acc), PHASES[0][0])
  }

  // Começa com as mensagens já na tela; quem pede menos movimento vê o card organizado, parado.
  let now = reduce ? 5.4 : 2.4, playing = !reduce, visible = true, raf = 0, last: number | null = null
  function frame(ts: number) {
    raf = 0
    if (last !== null) now = (now + Math.min(0.05, (ts - last) / 1000)) % T
    last = ts; render(now)
    if (playing && visible && !document.hidden) raf = requestAnimationFrame(frame); else last = null
  }
  function run() { if (!raf && playing && visible && !document.hidden) { last = null; raf = requestAnimationFrame(frame) } }
  function setPlaying(v: boolean) {
    playing = v
    if (toggle) { toggle.textContent = v ? "Pausar animação" : "Tocar animação"; toggle.setAttribute("aria-pressed", String(v)) }
    run()
  }
  const onToggle = () => setPlaying(!playing), onVis = () => run()
  toggle?.addEventListener("click", onToggle)
  document.addEventListener("visibilitychange", onVis)
  const io2 = globalThis.IntersectionObserver ? new IntersectionObserver(e => { visible = e[0].isIntersecting; run() }, { threshold: 0.15 }) : null
  io2?.observe(outer)
  const fit = () => stage.style.setProperty("--nm-s", String(outer.clientWidth / W))
  const ro = globalThis.ResizeObserver ? new ResizeObserver(fit) : null
  ro?.observe(outer); fit()
  setPlaying(playing); render(now)
  return () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0; playing = false
    toggle?.removeEventListener("click", onToggle)
    document.removeEventListener("visibilitychange", onVis)
    io2?.disconnect(); ro?.disconnect()
    stage.textContent = ""
  }
}

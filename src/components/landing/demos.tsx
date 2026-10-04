"use client"
// As demonstrações da landing. Dados de exemplo, nada é enviado nem gravado:
// cada bloco só anima quando está na tela, e quem pede menos movimento vê o
// estado final direto.
import { useEffect, useRef, useState } from "react"
import { Check, RotateCcw } from "lucide-react"
import { useEmVista, useMovimentoReduzido, useSequencia } from "./useDemo"
import s from "./Landing.module.css"

/* ─── Uma demanda, do início ao fim ─────────────────────────────────────── */

const ETAPAS = [
  { nome: "Entrada", cor: "#a8a2b8" },
  { nome: "Produção", cor: "#6a9bff" },
  { nome: "Edição", cor: "#b980fc" },
  { nome: "Aprovação", cor: "#edac56" },
  { nome: "Para postar", cor: "#5ec8d8" },
  { nome: "Concluído", cor: "#75c99d" },
]

const LEGENDAS: [string, string, string][] = [
  ["A ideia chegou.", "O flow começou.", "Um pedido vira card com briefing, responsável e prazo. O trabalho começa organizado."],
  ["Cada job com alguém.", "Cada pessoa com contexto.", "O profissional é escalado e recebe o aviso. Menos mensagens para descobrir quem faz o quê."],
  ["Foco na criação.", "O andamento fica visível.", "O card avança para edição e o solicitante é avisado. A equipe se concentra no trabalho."],
  ["Pronto para revisar.", "Sem caçar a última versão.", "A entrega chega à aprovação, e quem precisa revisar recebe o aviso para conferir."],
  ["Aprovado.", "Falta colocar no mundo.", "A decisão fica registrada. O job entra em Para postar, com o próximo passo claro."],
  ["Job concluído.", "Espaço para a próxima ideia.", "O trabalho chega ao fim e a equipe recebe a atualização. Um flow inteiro, organizado."],
]

const AVISOS = [
  "Sua demanda foi recebida: Filme de lançamento (VOP-26-1042).",
  "Rafael, você foi escalado para Filme de lançamento. Confirme sua participação.",
  "Filme de lançamento entrou em edição. Avisamos quando ficar pronto.",
  "Seu vídeo está pronto para revisão. Assista e aprove Filme de lançamento.",
  "O cliente aprovou Filme de lançamento. O job está pronto para publicação.",
  "Filme de lançamento foi publicado. Mais uma entrega concluída!",
]

// Os outros cards do quadro: dão a sensação de operação de verdade.
const OUTROS: { cod: string; titulo: string; pessoa: string; prazo: string }[][] = [
  [{ cod: "VOP-26-1051", titulo: "Depoimento · Dr. Paulo", pessoa: "MA", prazo: "12 set" }],
  [{ cod: "VOP-26-1038", titulo: "Institucional · Grupo Vita", pessoa: "BR", prazo: "10 set" }],
  [{ cod: "VOP-26-1029", titulo: "Treinamento · Nova linha", pessoa: "AN", prazo: "09 set" }, { cod: "VOP-26-1033", titulo: "Aftermovie · Congresso", pessoa: "AN", prazo: "11 set" }],
  [{ cod: "VOP-26-1024", titulo: "Teaser · Lançamento", pessoa: "MA", prazo: "08 set" }],
  [{ cod: "VOP-26-1019", titulo: "Reels · Bastidores", pessoa: "RA", prazo: "08 set" }],
  [{ cod: "VOP-26-1012", titulo: "Entrevista · Diretoria", pessoa: "BR", prazo: "05 set" }, { cod: "VOP-26-1007", titulo: "Vídeo manual · Equipamento", pessoa: "RA", prazo: "04 set" }],
]

export function FluxoDemo() {
  const [ref, emVista] = useEmVista<HTMLDivElement>(0.3)
  const reduzido = useMovimentoReduzido()
  const [etapa, setEtapa] = useState(0)
  const [manual, setManual] = useState(false)
  const trilho = useRef<HTMLDivElement>(null)

  // Avança sozinho enquanto ninguém mexe; um clique numa etapa assume o controle.
  useEffect(() => {
    if (!emVista || reduzido || manual) return
    const t = setInterval(() => setEtapa(e => (e + 1) % ETAPAS.length), 2800)
    return () => clearInterval(t)
  }, [emVista, reduzido, manual])

  // No celular o quadro rola de lado: mantém a coluna do card à vista sem mexer na rolagem da página.
  useEffect(() => {
    const t = trilho.current
    const col = t?.children[etapa] as HTMLElement | undefined
    if (!t || !col || t.scrollWidth <= t.clientWidth) return
    t.scrollTo({ left: col.offsetLeft - 12, behavior: reduzido ? "auto" : "smooth" })
  }, [etapa, reduzido])

  const [l1, l2, texto] = LEGENDAS[etapa]
  return (
    <div ref={ref} className={s.fluxo}>
      <div className={s.fluxoLegenda} aria-live="polite">
        <p className={s.fluxoPasso}>{String(etapa + 1).padStart(2, "0")} · {ETAPAS[etapa].nome}</p>
        <h3 key={etapa} className={s.surge}>{l1} <span>{l2}</span></h3>
        <p className={s.fluxoTexto}>{texto}</p>
      </div>

      <div className={s.app} aria-hidden="true">
        <div className={s.appBarra}>
          <span className={s.bolinhas}><i /><i /><i /></span>
          <span>Audiovisual / Demandas</span>
          <span className={s.appBarraFim}>6 abertas · 1 em aprovação</span>
        </div>
        <div ref={trilho} className={s.quadro}>
          {ETAPAS.map((e, i) => (
            <div key={e.nome} className={s.coluna} style={{ "--cor": e.cor } as React.CSSProperties}>
              <div className={s.colunaTopo}><b>{e.nome}</b><span>{OUTROS[i].length + (i === etapa ? 1 : 0)}</span></div>
              {i === etapa && (
                <div key={etapa} className={`${s.cartao} ${s.cartaoAtivo} ${s.surge}`}>
                  <small>VOP-26-1042</small>
                  <strong>Filme de lançamento</strong>
                  <span className={s.cartaoRodape}><em className={s.avatar}>RA</em><span>qui 09:00</span></span>
                </div>
              )}
              {OUTROS[i].map(c => (
                <div key={c.cod} className={s.cartao}>
                  <small>{c.cod}</small>
                  <strong>{c.titulo}</strong>
                  <span className={s.cartaoRodape}><em className={s.avatar}>{c.pessoa}</em><span>{c.prazo}</span></span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div key={etapa} className={`${s.zap} ${s.zapNoQuadro} ${s.surge}`}>
          <strong><span>WhatsApp · NuFlow</span><time>agora</time></strong>
          <p>{AVISOS[etapa]}</p>
        </div>
      </div>

      <div className={s.passos} role="group" aria-label="Etapas da demanda">
        {ETAPAS.map((e, i) => (
          <button key={e.nome} type="button" aria-pressed={i === etapa} onClick={() => { setManual(true); setEtapa(i) }} style={{ "--cor": e.cor } as React.CSSProperties}>
            <span>{String(i + 1).padStart(2, "0")}</span>{e.nome}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── Agenda + WhatsApp ─────────────────────────────────────────────────── */

const DIAS = [
  { dia: "Seg", n: "07", eventos: [{ h: "10:00", t: "Reunião de pauta", tipo: "pauta" }] },
  { dia: "Ter", n: "08", eventos: [{ h: "14:00", t: "Captação · Depoimento", tipo: "captacao" }] },
  { dia: "Qua", n: "09", eventos: [] as { h: string; t: string; tipo: string }[] },
  { dia: "Qui", n: "10", eventos: [{ h: "09:00", t: "Edição · Treinamento", tipo: "edicao" }] },
  { dia: "Sex", n: "11", eventos: [{ h: "16:00", t: "Entrega · Teaser", tipo: "entrega" }] },
]

export function AgendaDemo() {
  const [ref, emVista] = useEmVista<HTMLDivElement>()
  const reduzido = useMovimentoReduzido()
  const [passo, setPasso] = useState(0)
  const [rodada, setRodada] = useState(0)
  const fim = reduzido ? 3 : passo
  useSequencia(emVista && !reduzido, [[0, () => setPasso(0)], [700, () => setPasso(1)], [1800, () => setPasso(2)], [3800, () => setPasso(3)]], rodada)

  return (
    <div ref={ref} className={s.demo}>
      <div className={s.painel} aria-hidden="true">
        <div className={s.painelTopo}><b>Agenda</b><span>Setembro 2026</span></div>
        <div className={s.semana}>
          {DIAS.map(d => (
            <div key={d.dia} className={s.dia}>
              <p><span>{d.dia}</span> {d.n}</p>
              {d.eventos.map(e => <div key={e.t} className={s.evento} data-tipo={e.tipo}><small>{e.h}</small>{e.t}</div>)}
              {d.dia === "Qua" && fim >= 1 && (
                <div className={`${s.evento} ${s.eventoNovo} ${s.surge}`}><small>09:00 · Captação</small>Filme de lançamento<span>Rafael · confirmado</span></div>
              )}
              {d.dia === "Qua" && fim === 0 && <div className={s.reservando}>Reservando horário…</div>}
            </div>
          ))}
        </div>
        <div className={s.painelRodape}>
          {fim >= 2 && (
            <div key={fim >= 3 ? "lembrete" : "confirmada"} className={`${s.zap} ${s.surge}`}>
              <strong><span>WhatsApp · {fim >= 3 ? "Lembrete de agenda" : "Captação confirmada"}</span><time>{fim >= 3 ? "08:00" : "agora"}</time></strong>
              <p>{fim >= 3 ? "Sua captação começa em 1 hora. Confira o local e os detalhes no NuFlow." : "Rafael, sua gravação está marcada para qua 9 set, às 09:00. O briefing está no card."}</p>
            </div>
          )}
        </div>
      </div>
      <button type="button" className={s.rever} onClick={() => { setPasso(0); setRodada(r => r + 1) }}><RotateCcw size={14} aria-hidden="true" />Ver o agendamento de novo</button>
    </div>
  )
}

/* ─── Avisos no WhatsApp ────────────────────────────────────────────────── */

const MENSAGENS: [string, string, string][] = [
  ["Novo job para você", "Você foi escalado para Filme de lançamento. Briefing, responsável e prazo estão no card.", "08:12"],
  ["Sua agenda te chama", "Captação amanhã, às 09:00. Confira o local antes de sair.", "18:30"],
  ["O flow avançou", "O filme entrou em aprovação. A próxima decisão já tem responsável.", "16:05"],
]

export function AvisosDemo() {
  const [ref, emVista] = useEmVista<HTMLDivElement>()
  const reduzido = useMovimentoReduzido()
  const [qtd, setQtd] = useState(0)
  useSequencia(emVista && !reduzido, [[0, () => setQtd(0)], [400, () => setQtd(1)], [1600, () => setQtd(2)], [2800, () => setQtd(3)]])
  const visiveis = reduzido ? 3 : qtd
  return (
    <div ref={ref} className={s.demo}>
      <div className={`${s.painel} ${s.celular}`} aria-hidden="true">
        <div className={s.celularTopo}><span className={s.celularFoto}>N</span><div><b>NuFlow</b><small>conta comercial</small></div></div>
        <div className={s.conversa}>
          {MENSAGENS.slice(0, visiveis).map(([t, m, h]) => (
            <div key={t} className={`${s.balao} ${s.surge}`}><strong>{t}</strong><p>{m}</p><time>{h}</time></div>
          ))}
        </div>
      </div>
      <p className={s.notaDemo}>Exemplos demonstrativos. Nenhuma mensagem é enviada.</p>
    </div>
  )
}

/* ─── Aprovações ────────────────────────────────────────────────────────── */

const PEDIDOS = ["Carrossel · Nova linha", "Filme de apresentação", "Campanha de setembro", "E-mail · Boas-vindas", "Landing page · Lançamento", "Post · Bastidores"]

export function AprovacoesDemo() {
  const [ref, emVista] = useEmVista<HTMLDivElement>()
  const reduzido = useMovimentoReduzido()
  const [aprovados, setAprovados] = useState(0)
  const [rodada, setRodada] = useState(0)
  const nomes = [0, 1, 2].map(i => PEDIDOS[(rodada * 3 + i) % PEDIDOS.length])
  useSequencia(emVista && !reduzido, [[0, () => setAprovados(0)], [1300, () => setAprovados(1)], [2500, () => setAprovados(2)], [3700, () => setAprovados(3)]], rodada)
  const feitos = reduzido ? 3 : aprovados
  return (
    <div ref={ref} className={s.demo}>
      <div className={s.painel} aria-hidden="true">
        <div className={s.painelTopo}><b>Aprovações · Growth</b><span className={s.contador}>{3 - feitos} {3 - feitos === 1 ? "pedido" : "pedidos"} para decidir</span></div>
        <div className={s.pedidos}>
          {nomes.map((n, i) => (
            <div key={n} className={`${s.pedido} ${i < feitos ? s.pedidoAprovado : ""}`}>
              <div><small>VOP-26-{6105 + i + rodada * 3} · {i === 1 ? "Audiovisual" : "Growth"}</small><strong>{n}</strong><p>Briefing, objetivo e referências reunidos.</p></div>
              <span className={s.pedidoAcao}>{i < feitos ? <><Check size={14} /> Virou job</> : "Aprovar como job"}</span>
            </div>
          ))}
        </div>
      </div>
      <button type="button" className={s.rever} onClick={() => { setAprovados(0); setRodada(r => r + 1) }}><RotateCcw size={14} aria-hidden="true" />Ver outros pedidos chegando</button>
    </div>
  )
}

/* ─── Equipe ────────────────────────────────────────────────────────────── */

const PESSOAS = [
  { nome: "Rafael", concluidas: 5, ativas: 4, atrasadas: 1 },
  { nome: "Marina", concluidas: 4, ativas: 3, atrasadas: 1 },
  { nome: "Bruno", concluidas: 3, ativas: 1, atrasadas: 0 },
]

export function EquipeDemo() {
  const [ref, emVista] = useEmVista<HTMLDivElement>()
  const reduzido = useMovimentoReduzido()
  const [cheio, setCheio] = useState(false)
  const [livre, setLivre] = useState(false)
  useSequencia(emVista && !reduzido, [[0, () => { setCheio(false); setLivre(false) }], [150, () => setCheio(true)], [3000, () => setLivre(true)]])
  const barras = reduzido || cheio
  const alertaLivre = reduzido || livre
  return (
    <div ref={ref} className={s.demo}>
      <div className={s.painel} aria-hidden="true">
        <div className={s.painelTopo}><b>Equipe audiovisual</b><span>Últimos 30 dias</span></div>
        <div className={s.kpis}>
          <div><strong>8</strong><span>em andamento</span></div>
          <div data-tom="alerta"><strong>2</strong><span>atrasadas</span></div>
          <div data-tom="ok"><strong>12</strong><span>concluídas</span></div>
        </div>
        <div className={s.pessoas}>
          {PESSOAS.map(p => (
            <div key={p.nome} className={s.pessoa}>
              <p><b>{p.nome}</b><span>{p.ativas} {p.ativas === 1 ? "ativa" : "ativas"}{p.atrasadas ? ` · ${p.atrasadas} atrasada` : ""}</span></p>
              <div className={s.barra}><i style={{ width: barras ? `${(p.concluidas / 5) * 100}%` : "0%" }} /></div>
              <small>{p.concluidas} concluídas</small>
            </div>
          ))}
        </div>
        <div key={alertaLivre ? "livre" : "carga"} className={`${s.alerta} ${s.surge}`} data-tom={alertaLivre ? "ok" : "alerta"}>
          {alertaLivre ? "Bruno tem 1 job ativo. Avalie passar a próxima demanda para ele." : "Atenção à carga: Rafael está com 4 jobs ativos e 1 atrasado."}
        </div>
      </div>
      <p className={s.notaDemo}>Dados de exemplo.</p>
    </div>
  )
}

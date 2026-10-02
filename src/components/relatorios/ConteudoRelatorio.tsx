import type { ApresentacaoRelatorio } from "@/lib/relatorio-contrato"

const rotulos: Record<string, string> = {
  resumo_executivo: "Resumo executivo", resumo_financeiro: "Resumo financeiro", kpis: "Indicadores",
  score_produtividade: "Avaliação de produtividade", saude_geral_sistema: "Avaliação geral",
  total_periodo: "Custo total (R$)", custo_medio_video: "Custo médio por vídeo (R$)",
  pontos_atencao: "Pontos de atenção", acoes_recomendadas: "Ações recomendadas", insights_equipe: "Análise da equipe",
  otimizacoes_contratacao: "Melhorias na contratação", previsao_proximo_periodo: "Previsão do próximo período",
}
function rotulo(chave: string) { return rotulos[chave] ?? chave.replaceAll("_", " ").replace(/^./, c => c.toUpperCase()) }
function Valor({ valor }: { valor: unknown }) {
  if (typeof valor === "string" || typeof valor === "number") return <span className="whitespace-pre-wrap break-words">{valor}</span>
  if (Array.isArray(valor)) return <ul className="space-y-3">{valor.map((v, i) => <li key={i} className="border-l-2 border-zinc-700 pl-3"><Valor valor={v} /></li>)}</ul>
  if (valor && typeof valor === "object") return <dl className="space-y-2">{Object.entries(valor).map(([k,v]) => <div key={k}><dt className="text-xs text-zinc-500">{rotulo(k)}</dt><dd><Valor valor={v} /></dd></div>)}</dl>
  return <span>Não medido</span>
}
/** React escapa todos os textos; não interpreta HTML vindo de relatórios/IA. */
export function ConteudoRelatorio({ apresentacao, referencia }: { apresentacao: ApresentacaoRelatorio; referencia: string }) {
  return <div className="space-y-4 text-sm text-zinc-300">
    <p className="text-xs text-zinc-500">{apresentacao.origem === "legado" ? "Relatório legado preservado" : apresentacao.origem === "agente" ? "Relatório automático" : "Relatório solicitado"}</p>
    {apresentacao.metadados && <p className="text-xs text-zinc-500">Período: {apresentacao.metadados.periodo} · {apresentacao.metadados.area === "nao_separada" ? "Sem filtro de área" : apresentacao.metadados.area === "design" ? "Growth" : "Audiovisual"}</p>}
    {apresentacao.estado === "invalido" ? <div role="alert" className="rounded-lg border border-amber-700 p-4">{apresentacao.aviso}</div> : apresentacao.estado === "texto" ? <p className="whitespace-pre-wrap break-words leading-relaxed">{apresentacao.texto}</p> : Object.entries(apresentacao.dados ?? {}).map(([k,v]) => (
      <section key={k} className="rounded-lg border border-zinc-800 p-4"><h3 className="mb-2 font-medium text-zinc-100">{rotulo(k)}</h3><Valor valor={v} /></section>
    ))}
    {apresentacao.snapshot && <details className="rounded-lg border border-zinc-800 p-3"><summary className="cursor-pointer">Dados preservados na geração</summary><p className="my-2 text-xs text-zinc-500">Indicadores calculados pelo recorte vigente na data de geração.</p><Valor valor={Object.fromEntries(Object.entries(apresentacao.snapshot).map(([k,v]) => [k.replace(/([A-Z])/g, " $1"),v]))} /></details>}
    <p className="text-xs text-zinc-500 break-all">Referência: {referencia}</p>
  </div>
}

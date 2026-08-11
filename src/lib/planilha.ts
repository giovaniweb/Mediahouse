// Leitura de planilha para virar demanda.
//
// O caminho é de MÃO ÚNICA, de propósito: planilha vira card, e o card volta como
// exportação da visão Tabela. Sincronizar nos dois sentidos é o que quebra na
// prática — os dois lados editam a mesma linha e não há resposta certa para o
// conflito.
//
// Dois formatos, sem dependência nova: TSV (o que o Excel põe na área de
// transferência quando você copia células) e CSV com "," ou ";". Arquivo .xlsx
// é binário e exigiria uma biblioteca — quem tiver um, cola as células ou salva
// como CSV.

export interface LinhaPlanilha {
  linha: number
  titulo: string
  descricao: string
  tipoVideo: string
  departamento: string
  produto: string
  responsavel: string
  prazo: string
  prioridade: string
}

/** Nomes de coluna aceitos, em português e sem depender de acento ou caixa. */
const SINONIMOS: Record<keyof Omit<LinhaPlanilha, "linha">, string[]> = {
  titulo: ["titulo", "título", "nome", "demanda", "tarefa", "assunto"],
  descricao: ["descricao", "descrição", "briefing", "detalhes", "observacao", "observação"],
  tipoVideo: ["tipo", "tipo de video", "tipo de vídeo", "formato", "tipo de criativo"],
  departamento: ["departamento", "setor", "area solicitante", "área solicitante"],
  produto: ["produto", "equipamento", "linha"],
  responsavel: ["responsavel", "responsável", "executor", "designado"],
  prazo: ["prazo", "data", "entrega", "data limite", "vencimento", "deadline"],
  prioridade: ["prioridade", "urgencia", "urgência"],
}

function normalizar(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/**
 * Quebra o texto em células respeitando aspas — uma descrição com ponto e vírgula
 * ou quebra de linha dentro precisa continuar sendo uma célula só.
 */
function separarCelulas(texto: string, sep: string): string[][] {
  const linhas: string[][] = []
  let celula = ""
  let atual: string[] = []
  let dentroDeAspas = false

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (dentroDeAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { celula += '"'; i++ }  // aspas escapada
        else dentroDeAspas = false
      } else celula += c
      continue
    }
    if (c === '"') { dentroDeAspas = true; continue }
    if (c === sep) { atual.push(celula); celula = ""; continue }
    if (c === "\n") {
      atual.push(celula); celula = ""
      linhas.push(atual); atual = []
      continue
    }
    if (c === "\r") continue
    celula += c
  }
  atual.push(celula)
  if (atual.some((v) => v.trim())) linhas.push(atual)
  return linhas
}

/** Adivinha o separador pela primeira linha: tab (Excel colado), ";" (Excel BR) ou ",". */
function detectarSeparador(texto: string): string {
  const primeira = texto.split("\n")[0] ?? ""
  const tabs = (primeira.match(/\t/g) ?? []).length
  const pontoVirgula = (primeira.match(/;/g) ?? []).length
  const virgula = (primeira.match(/,/g) ?? []).length
  if (tabs >= pontoVirgula && tabs >= virgula && tabs > 0) return "\t"
  return pontoVirgula >= virgula ? ";" : ","
}

export interface ResultadoLeitura {
  linhas: LinhaPlanilha[]
  colunasReconhecidas: string[]
  colunasIgnoradas: string[]
  erro?: string
}

export function lerPlanilha(texto: string): ResultadoLeitura {
  const bruto = texto.replace(/^﻿/, "").trim()
  if (!bruto) return { linhas: [], colunasReconhecidas: [], colunasIgnoradas: [], erro: "Nada para importar." }

  const sep = detectarSeparador(bruto)
  const grade = separarCelulas(bruto, sep)
  if (grade.length < 2) {
    return { linhas: [], colunasReconhecidas: [], colunasIgnoradas: [], erro: "Inclua a linha de cabeçalho e pelo menos uma linha de dados." }
  }

  const cabecalho = grade[0].map(normalizar)
  const mapa = new Map<number, keyof Omit<LinhaPlanilha, "linha">>()
  const reconhecidas: string[] = []
  const ignoradas: string[] = []

  cabecalho.forEach((nome, i) => {
    const campo = (Object.keys(SINONIMOS) as (keyof Omit<LinhaPlanilha, "linha">)[])
      .find((k) => SINONIMOS[k].some((s) => normalizar(s) === nome))
    if (campo && !Array.from(mapa.values()).includes(campo)) {
      mapa.set(i, campo)
      reconhecidas.push(grade[0][i].trim())
    } else if (nome) {
      ignoradas.push(grade[0][i].trim())
    }
  })

  if (!Array.from(mapa.values()).includes("titulo")) {
    return {
      linhas: [], colunasReconhecidas: reconhecidas, colunasIgnoradas: ignoradas,
      erro: "Não encontrei a coluna de título. Renomeie a coluna para \"Título\" (ou Nome, Demanda, Tarefa).",
    }
  }

  const linhas: LinhaPlanilha[] = []
  for (let i = 1; i < grade.length; i++) {
    const celulas = grade[i]
    if (celulas.every((v) => !v.trim())) continue
    const item: LinhaPlanilha = {
      linha: i + 1,
      titulo: "", descricao: "", tipoVideo: "", departamento: "",
      produto: "", responsavel: "", prazo: "", prioridade: "",
    }
    mapa.forEach((campo, idx) => { item[campo] = (celulas[idx] ?? "").trim() })
    linhas.push(item)
  }

  return { linhas, colunasReconhecidas: reconhecidas, colunasIgnoradas: ignoradas }
}

/**
 * Datas de planilha vêm em vários formatos. Aceita dd/mm/aaaa, dd-mm-aaaa e
 * aaaa-mm-dd; devolve null quando não dá para ter certeza, em vez de chutar — um
 * prazo errado é pior do que um prazo em branco.
 */
export function interpretarData(valor: string): Date | null {
  const v = valor.trim()
  if (!v) return null

  const br = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (br) {
    const [, d, m, aRaw] = br
    const ano = aRaw.length === 2 ? 2000 + Number(aRaw) : Number(aRaw)
    const data = new Date(Date.UTC(ano, Number(m) - 1, Number(d), 12))
    return isNaN(data.getTime()) || ano < 2000 || ano > 2100 ? null : data
  }

  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const data = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12))
    return isNaN(data.getTime()) || Number(iso[1]) < 2000 || Number(iso[1]) > 2100 ? null : data
  }

  return null
}

export function interpretarPrioridade(valor: string): "urgente" | "alta" | "normal" {
  const v = normalizar(valor)
  if (/urgen|critic|asap/.test(v)) return "urgente"
  if (/alta|high|prioritari/.test(v)) return "alta"
  return "normal"
}

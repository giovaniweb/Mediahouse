import { createHash } from "node:crypto"
import { snapshotSchema, analisarInventario } from "./inventario-midia.mjs"

const segmento = s => typeof s === "string" && /^[a-zA-Z0-9_.-]+$/.test(s) && ![".", ".."].includes(s)
const digest = valor => createHash("sha256").update(JSON.stringify(valor)).digest("hex")

/** Storage list é paginado por offset, sem snapshot transacional. Duas passagens
 * iguais são evidência de estabilidade observada, nunca prova de atomicidade. */
export async function listarObjetosMidia({ listar, organizacaoId, tamanhoPagina = 100, maxPaginas = 2000, maxObjetos = 100000, signal = undefined }) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(organizacaoId) || !Number.isInteger(tamanhoPagina) || tamanhoPagina < 1 || tamanhoPagina > 1000 || !Number.isInteger(maxPaginas) || maxPaginas < 1 || !Number.isInteger(maxObjetos) || maxObjetos < 1) throw new Error("limites_invalidos")
  const fila = [`org/${organizacaoId}/videos`], pastas = new Set(fila), objetos = [], vistos = new Set()
  let paginas = 0
  try {
    for (let pos = 0; pos < fila.length; pos++) {
      const prefixo = fila[pos]
      if (prefixo.split("/").length > 12) throw new Error("profundidade_excedida")
      let ultimo = null
      for (let offset = 0; ; offset += tamanhoPagina) {
        signal?.throwIfAborted()
        if (++paginas > maxPaginas) throw new Error("limite_paginas")
        const rows = await listar(prefixo, { offset, limit: tamanhoPagina, signal })
        if (!Array.isArray(rows) || rows.length > tamanhoPagina) throw new Error("pagina_invalida")
        for (const row of rows) {
          if (!segmento(row.name) || (ultimo !== null && row.name <= ultimo)) throw new Error("pagina_fora_de_ordem_ou_repetida")
          ultimo = row.name
          const chave = `${prefixo}/${row.name}`
          if (row.id === null && row.metadata === null) {
            if (pastas.has(chave)) throw new Error("pasta_repetida")
            pastas.add(chave); fila.push(chave)
          } else {
            if (typeof row.id !== "string" || !row.id || !Number.isSafeInteger(row.metadata?.size) || row.metadata.size < 0 || !Number.isFinite(Date.parse(row.created_at))) throw new Error("metadados_invalidos")
            if (vistos.has(chave)) throw new Error("objeto_repetido")
            if (objetos.length >= maxObjetos) throw new Error("limite_objetos")
            vistos.add(chave)
            objetos.push({ bucket: "midia", chave, bytes: row.metadata.size, criadoEm: new Date(row.created_at).toISOString() })
          }
        }
        if (rows.length < tamanhoPagina) break
      }
    }
    return { objetos: objetos.sort((a,b) => a.chave.localeCompare(b.chave)), completo: true, paginas, motivo: null }
  } catch (e) {
    const motivos = new Set(["limite_paginas", "limite_objetos", "profundidade_excedida", "pagina_invalida", "pagina_fora_de_ordem_ou_repetida", "pasta_repetida", "metadados_invalidos", "objeto_repetido"])
    return { objetos, completo: false, paginas, motivo: signal?.aborted ? "cancelado" : motivos.has(e.message) ? e.message : "storage_indisponivel" }
  }
}

/** Adaptadores somente leitura. Não recebe provas externas de consistência. */
export async function coletarInventario({ banco, listar, organizacaoId, carenciaHoras, limites = {}, signal = undefined, agora = () => new Date() }) {
  snapshotSchema.shape.organizacaoId.parse(organizacaoId)
  snapshotSchema.shape.carenciaHoras.parse(carenciaHoras)
  const primeiro = await banco(organizacaoId, { signal })
  const um = await listarObjetosMidia({ listar, organizacaoId, ...limites, signal })
  const dois = um.completo ? await listarObjetosMidia({ listar, organizacaoId, ...limites, signal }) : null
  const segundo = await banco(organizacaoId, { signal })
  const bancoEstavel = digest(primeiro) === digest(segundo)
  const storageEstavel = !!dois?.completo && digest(um.objetos) === digest(dois.objetos)
  const snapshot = snapshotSchema.parse({ versao: 1, organizacaoId, observadoEm: agora().toISOString(), carenciaHoras,
    evidencia: { storageCompleto: um.completo && !!dois?.completo, referenciasCompletas: primeiro.referenciasCompletas && segundo.referenciasCompletas,
      jobsCompletos: primeiro.jobsCompletos && segundo.jobsCompletos,
      // Sem snapshot comum de storage/banco e reconciliação do volume dos workers,
      // não há evidência suficiente para promover objetos sem referências a candidatos.
      recibosConciliados: false, consistente: false },
    objetos: dois?.completo ? dois.objetos : um.objetos,
    referencias: [...new Map([...primeiro.referencias, ...segundo.referencias].map(r => [JSON.stringify(r), r])).values()], arquivos: primeiro.arquivos, jobs: primeiro.jobs })
  return { snapshot, relatorio: analisarInventario(snapshot), coleta: {
    bancoEstavel, storageEstavel, coberturaBanco: { primeira: primeiro.cobertura ?? null, segunda: segundo.cobertura ?? null }, paginas: um.paginas + (dois?.paginas ?? 0),
    motivoStorage: um.motivo ?? dois?.motivo ?? null,
    limitesDeProva: ["sem_snapshot_atomico_entre_banco_e_storage", "recibos_dos_workers_nao_conciliados"],
  } }
}

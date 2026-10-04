/** Caminhos antigos não podem inventar custos nem recuperar arquivos sem revisão. */
export async function backfillAuditado(tipo: "custos" | "arquivos") {
  if (tipo === "arquivos") throw new Error("Recuperação exige lote simulado e aplicação explícita")
  throw new Error("Custos históricos exigem fonte e competência confirmadas; diária atual não comprova valor passado")
}

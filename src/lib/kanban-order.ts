/** Aguarda todas as gravações: uma resposta HTTP negativa também é falha. */
export async function salvarOrdem(ids: string[], request: typeof fetch = fetch): Promise<void> {
  const resultados = await Promise.allSettled(ids.map(async (id, posicaoKanban) => {
    const res = await request(`/api/demandas/${encodeURIComponent(id)}/posicao`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ posicaoKanban }),
    })
    if (!res.ok) throw new Error(`Falha ao salvar posição (${res.status})`)
  }))
  if (resultados.some(r => r.status === "rejected")) {
    throw new Error("Não foi possível salvar toda a ordem. Algumas posições podem ter sido gravadas. Recarregue o quadro para conferir antes de ordenar novamente.")
  }
}

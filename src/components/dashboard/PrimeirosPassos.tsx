"use client"

// Primeiros passos do admin de empresa nova (Onda 2A). Lista curta, sem tour:
// cada item some quando é feito; a lista some quando acaba ou é dispensada.
import Link from "next/link"
import useSWR from "swr"
import { toast } from "sonner"
import { fetcher } from "@/lib/fetcher"
import type { EstadoPrimeirosPassos } from "@/lib/primeiros-passos"
import styles from "./PrimeirosPassos.module.css"

export function PrimeirosPassos() {
  const { data, mutate } = useSWR<EstadoPrimeirosPassos>("/api/primeiros-passos", fetcher, { shouldRetryOnError: false })
  if (!data?.mostrar) return null
  const faltam = data.itens.filter((i) => !i.feito)
  const feitos = data.itens.length - faltam.length

  async function registrar(acao: "dispensar" | "link-copiado") {
    const res = await fetch("/api/primeiros-passos", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }),
    })
    if (res.ok) mutate(await res.json(), { revalidate: false })
  }

  async function copiarLink() {
    if (!data?.linkPagina) return
    try {
      await navigator.clipboard.writeText(data.linkPagina)
      toast.success("Link copiado. Mande para clientes e profissionais.")
    } catch {
      // Navegador que bloqueia a área de transferência: o link está à vista no
      // cartão e no aviso. O passo conta como feito do mesmo jeito.
      toast.message(`Copie o link: ${data.linkPagina}`)
    }
    await registrar("link-copiado")
  }

  return (
    <section className={styles.card} aria-labelledby="primeiros-passos">
      <div className={styles.topo}>
        <div>
          <p className={styles.eyebrow}>PRIMEIROS PASSOS</p>
          <h2 id="primeiros-passos">Deixe a empresa pronta para o primeiro pedido</h2>
          <p>Cada item some quando estiver feito.</p>
        </div>
        <button type="button" className={styles.dispensar} onClick={() => registrar("dispensar")}>Dispensar</button>
      </div>
      <ul className={styles.lista}>
        {faltam.map((i) => (
          <li key={i.chave} className={styles.item}>
            <strong>{i.titulo}</strong>
            <span>{i.descricao}</span>
            {i.chave === "link" && data.linkPagina && <code className={styles.link}>{data.linkPagina}</code>}
            {i.chave === "link"
              ? <button type="button" className={styles.acao} onClick={copiarLink}>Copiar link</button>
              : i.href && <Link className={styles.acao} href={i.href}>{i.chave === "demanda" ? "Criar demanda" : "Abrir"}</Link>}
          </li>
        ))}
      </ul>
      {feitos > 0 && <p className={styles.progresso}>{feitos} de {data.itens.length} feitos.</p>}
    </section>
  )
}

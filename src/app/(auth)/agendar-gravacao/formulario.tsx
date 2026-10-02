"use client"
import { useRef, useState } from "react"
import { CheckCircle2, CalendarPlus } from "lucide-react"
import styles from "@/components/auth/AuthSurface.module.css"

export default function FormularioGravacao({ org, empresa }: { org: string; empresa: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [sent, setSent] = useState(false)
  const envioId = useRef("")
  const submitting = useRef(false)
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setBusy(true); setError("")
    if (!envioId.current) envioId.current = crypto.randomUUID()
    const fields = Object.fromEntries(new FormData(e.currentTarget))
    try {
      const res = await fetch(`/api/publico/jobs?org=${encodeURIComponent(org)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, envioId: envioId.current }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Não foi possível enviar. Tente novamente.")
      setSent(true)
    } catch (err) { setError(err instanceof Error ? err.message : "Falha de conexão. Tente novamente.") }
    finally { submitting.current = false; setBusy(false) }
  }
  return <section className={styles.panel}>
    <p className={styles.eyebrow}>{empresa} · GRAVAÇÕES</p>
    {sent ? <><CheckCircle2 className={styles.success} size={36}/><h1>Pedido recebido.</h1><p className={styles.description}>A gravação já está no quadro de Jobs de {empresa}, aguardando a atribuição de um videomaker. O envio ainda não confirma a disponibilidade da equipe.</p><button className={styles.primary} onClick={() => { envioId.current = ""; setSent(false) }}>Solicitar outra gravação</button></> : <>
      <h1>Onde vamos gravar?</h1><p className={styles.description}>Preencha os dados da visita. Seu pedido vai direto para a equipe organizar a gravação.</p>
      <form onSubmit={submit} className={styles.form} aria-busy={busy}>
        <div className={styles.field}><label htmlFor="cliente">Nome do cliente ou clínica</label><input name="cliente" id="cliente" autoComplete="organization" required minLength={2} maxLength={160}/></div>
        <div className={styles.field}><label htmlFor="endereco">Endereço completo</label><input name="endereco" id="endereco" placeholder="Rua, número, bairro e cidade" autoComplete="street-address" required minLength={5} maxLength={500}/></div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
          <div className={styles.field}><label htmlFor="data">Data</label><input style={{ minWidth: 0 }} type="date" name="data" id="data" required/></div>
          <div className={styles.field}><label htmlFor="hora">Horário</label><input style={{ minWidth: 0 }} type="time" name="hora" id="hora" required/></div>
        </div>
        <p className={styles.hint}>Horário de Brasília.</p>
        <div className={styles.field}><label htmlFor="consultora">Consultora que acompanhará a gravação</label><input name="consultora" id="consultora" autoComplete="name" required minLength={2} maxLength={120}/></div>
        <div hidden aria-hidden="true"><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off"/></div>
        <p className={styles.hint}>Esses dados serão usados por {empresa} para organizar esta gravação.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.primary} disabled={busy}><CalendarPlus size={18}/>{busy ? "Enviando…" : "Solicitar gravação"}</button>
      </form>
    </>}
  </section>
}

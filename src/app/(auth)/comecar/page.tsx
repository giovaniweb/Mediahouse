"use client"
// Formulário de interesse no NuFlow: para onde a landing leva quem quer
// conhecer o sistema. Não cria conta; registra o contato para a equipe do
// NuFlow responder.
import { useState } from "react"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import styles from "@/components/auth/AuthSurface.module.css"
import { erroDaResposta, erroDeEnvio } from "@/lib/erro-envio-publico"

const CAMPOS = [
  ["nome", "Seu nome", "text", "name"],
  ["email", "E-mail de trabalho", "email", "email"],
  ["telefone", "WhatsApp com DDD", "tel", "tel"],
  ["empresa", "Empresa ou nome do seu estúdio", "text", "organization"],
] as const

export default function Comecar() {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError("")
    const f = new FormData(e.currentTarget)
    const sp = new URLSearchParams(location.search)
    try {
      const r = await fetch("/api/publico/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(f),
          consentimento: f.get("consentimento") === "on",
          origem: sp.get("utm_source") || "comecar",
          campanha: sp.get("utm_campaign") || "",
        }),
      })
      if (!r.ok) throw new Error(await erroDaResposta(r))
      setSent(true)
    } catch (err) {
      setError(erroDeEnvio(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="comecar-titulo">
      <p className={styles.eyebrow}>SEU PRÓXIMO PASSO COM O NUFLOW</p>
      {sent ? (
        <>
          <CheckCircle2 size={36} className={styles.success} aria-hidden="true" />
          <h1 id="comecar-titulo">Vamos conversar sobre seu flow.</h1>
          <p className={styles.description}>Seu interesse foi registrado. A equipe do NuFlow vai falar com você pelo e-mail ou WhatsApp informado. Este envio ainda não cria uma conta.</p>
          <Link href="/" className={styles.primary}>Voltar ao início</Link>
        </>
      ) : (
        <>
          <h1 id="comecar-titulo">Menos desorganização.<br />Mais tempo para criar.</h1>
          <p className={styles.description}>Conheça o NuFlow para organizar pedidos, acompanhar prazos e reunir sua equipe. Conte um pouco sobre sua operação.</p>
          <form className={styles.form} onSubmit={submit} aria-busy={busy}>
            {CAMPOS.map(([name, label, type, auto]) => (
              <div className={styles.field} key={name}>
                <label htmlFor={name}>{label}</label>
                <input id={name} name={name} type={type} autoComplete={auto} required maxLength={name === "email" ? 254 : 160} />
              </div>
            ))}
            <div className={styles.field}>
              <label htmlFor="mensagem">O que você quer organizar? <span className={styles.hint}>(opcional)</span></label>
              <textarea id="mensagem" name="mensagem" rows={3} maxLength={1500} />
            </div>
            {/* Armadilha para robô: escondido de quem usa tela e leitor de tela. */}
            <div hidden aria-hidden="true"><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
            <label className={styles.consent}><input type="checkbox" name="consentimento" required />Autorizo a equipe do NuFlow a usar estes dados para falar comigo sobre o sistema. Posso pedir a interrupção do contato.</label>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <button className={styles.primary} disabled={busy}>{busy ? "Enviando…" : "Quero conhecer o NuFlow"}</button>
          </form>
        </>
      )}
      <div className={styles.links}><Link href="/login">Já tenho conta · Entrar</Link></div>
    </section>
  )
}

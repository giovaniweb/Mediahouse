"use client"
import {useState} from "react"
import Link from "next/link"
import {CheckCircle2} from "lucide-react"
import styles from "@/components/auth/AuthSurface.module.css"
export default function Comecar(){
 const [busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState("")
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setError("");const f=new FormData(e.currentTarget),sp=new URLSearchParams(location.search);try{const r=await fetch("/api/publico/leads",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...Object.fromEntries(f),consentimento:f.get("consentimento")==="on",origem:sp.get("utm_source")||"comecar",campanha:sp.get("utm_campaign")||""})});const d=await r.json();if(!r.ok)throw new Error(d.error);setSent(true)}catch(err){setError(err instanceof Error?err.message:"Falha de conexão. Tente novamente.")}finally{setBusy(false)}}
 return <section className={styles.panel}><p className={styles.eyebrow}>SEU PRÓXIMO PASSO COM O NUFLOW</p>{sent?<><CheckCircle2 size={36} className={styles.success}/><h1>Vamos conversar sobre seu flow.</h1><p className={styles.description}>Seu interesse foi registrado. Nossa equipe poderá entrar em contato pelo e-mail ou WhatsApp informado. Esta solicitação ainda não cria uma conta.</p><Link href="/" className={styles.primary}>Voltar ao início</Link></>:<><h1>Menos desorganização.<br/>Mais tempo para criar.</h1><p className={styles.description}>Conheça o NuFlow para organizar pedidos, acompanhar prazos e reunir sua equipe. Conte um pouco sobre sua operação.</p><form className={styles.form} onSubmit={submit} aria-busy={busy}>
 {[["nome","Seu nome","text","name"],["email","E-mail de trabalho","email","email"],["telefone","WhatsApp com DDD","tel","tel"],["empresa","Empresa ou nome do seu estúdio","text","organization"]].map(([name,label,type,auto])=><div className={styles.field} key={name}><label htmlFor={name}>{label}</label><input id={name} name={name} type={type} autoComplete={auto} required maxLength={name==="email"?254:160}/></div>)}
 <div className={styles.field}><label htmlFor="mensagem">O que você quer organizar? <span className={styles.hint}>(opcional)</span></label><textarea id="mensagem" name="mensagem" rows={3} maxLength={1500}/></div>
 <div hidden aria-hidden="true"><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off"/></div>
 <label className={styles.consent}><input type="checkbox" name="consentimento" required/>Autorizo a equipe NuFlow a usar estes dados para falar comigo sobre o sistema. Posso pedir a interrupção do contato.</label>
 {error&&<p role="alert" className={styles.error}>{error}</p>}<button className={styles.primary} disabled={busy}>{busy?"Enviando…":"Quero conhecer o NuFlow"}</button>
 </form></>}<div className={styles.links}><Link href="/login">Já tenho conta · Entrar</Link></div></section>
}

"use client"
import {use,useEffect,useState} from "react"
import Link from "next/link"
import {Eye,EyeOff,CheckCircle2} from "lucide-react"
import styles from "@/components/auth/AuthSurface.module.css"
export default function RedefinirSenhaPage({params}:{params:Promise<{token:string}>}){
 const {token}=use(params)
 const [state,setState]=useState<"loading"|"valid"|"invalid"|"error"|"success">("loading")
 const [password,setPassword]=useState("");const [confirm,setConfirm]=useState("");const [visible,setVisible]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [retry,setRetry]=useState(0)
 useEffect(()=>{const controller=new AbortController();fetch(`/api/auth/redefinir-senha?token=${encodeURIComponent(token)}`,{signal:controller.signal}).then(async res=>{if(!res.ok)throw new Error();const data=await res.json();setState(data.valido?"valid":"invalid")}).catch(err=>{if(err.name!=="AbortError")setState("error")});return()=>controller.abort()},[token,retry])
 const strong=password.length>=8&&/[A-Z]/.test(password)&&/[0-9]/.test(password)
 async function submit(e:React.FormEvent){e.preventDefault();if(busy)return;setError("");if(!strong){setError("Use pelo menos 8 caracteres, uma letra maiúscula e um número.");return}if(password!==confirm){setError("As senhas não coincidem.");return}setBusy(true);try{const res=await fetch("/api/auth/redefinir-senha",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,novaSenha:password})});const data=await res.json();if(!res.ok)setError(data.error||"Não foi possível alterar a senha.");else setState("success")}catch{setError("Falha de conexão. Tente novamente.")}finally{setBusy(false)}}
 return <section className={styles.panel} aria-labelledby="auth-title"><p className={styles.eyebrow}>SEGURANÇA DA CONTA</p>
 {state==="loading"&&<><h1 id="auth-title">Verificando seu link.</h1><p role="status" className={styles.description}>Só um instante…</p></>}
 {state==="invalid"&&<><h1 id="auth-title">Este link não está disponível.</h1><p className={styles.description}>Ele pode ter expirado ou já ter sido usado. Solicite um novo link para continuar.</p><Link className={styles.primary} href="/esqueci-senha">Solicitar novo link</Link></>}
 {state==="error"&&<><h1 id="auth-title">Não conseguimos verificar o link.</h1><p className={styles.description}>Confira sua conexão e tente novamente.</p><button className={styles.primary} onClick={()=>{setState("loading");setRetry(retry+1)}}>Tentar novamente</button></>}
 {state==="success"&&<><CheckCircle2 className={styles.success} size={36}/><h1 id="auth-title">Senha atualizada.</h1><p className={styles.description}>Tudo pronto. Use sua nova senha para voltar ao seu workspace.</p><Link className={styles.primary} href="/login">Entrar no NuFlow</Link></>}
 {state==="valid"&&<><h1 id="auth-title">Um novo acesso ao seu flow.</h1><p className={styles.description}>Crie uma senha que você ainda não usa em outros serviços.</p><form onSubmit={submit} className={styles.form} aria-busy={busy}>
 <div className={styles.field}><label htmlFor="new-password">Nova senha</label><div className={styles.password}><input id="new-password" name="new-password" type={visible?"text":"password"} autoComplete="new-password" required value={password} onChange={e=>setPassword(e.target.value)} aria-describedby="password-help"/><button type="button" aria-label={visible?"Ocultar senhas":"Mostrar senhas"} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div><p id="password-help" className={styles.hint}>Pelo menos 8 caracteres, uma letra maiúscula e um número.</p></div>
 <div className={styles.field}><label htmlFor="confirm-password">Confirmar nova senha</label><input id="confirm-password" name="confirm-password" type={visible?"text":"password"} autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></div>
 {error&&<p role="alert" className={styles.error}>{error}</p>}<button className={styles.primary} disabled={busy}>{busy?"Salvando…":"Salvar nova senha"}</button></form></>}
 {state!=="success"&&<div className={styles.links}><Link href="/login">Voltar para entrar</Link></div>}
 </section>
}

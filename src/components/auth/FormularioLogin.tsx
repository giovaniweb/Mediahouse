"use client"
// O formulário de login, usado em /login e na área de cada empresa (/c/<slug>/entrar).
// Na área, o destino depois do login é fixo (escolher a empresa daquela área);
// em /login, vem do callbackUrl que o middleware manda.
import { useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Eye, EyeOff, ArrowRight } from "lucide-react"
import { loginAction } from "@/app/(auth)/login/actions"
import styles from "./AuthSurface.module.css"

type Props = {
  destinoFixo?: string
  eyebrow?: string
  titulo?: string
  descricao?: string
  /** Segundo link abaixo do formulário; null esconde. */
  linkExtra?: { href: string; texto: string } | null
}

export function FormularioLogin({
  destinoFixo,
  eyebrow = "BEM-VINDO AO SEU WORKSPACE",
  titulo = "Entre no seu flow.",
  descricao = "Seus jobs, sua equipe e o próximo passo estão aqui.",
  linkExtra = { href: "/comecar", texto: "Quero usar o NuFlow" },
}: Props) {
  const [error,setError]=useState("")
  const [loading,setLoading]=useState(false)
  const [visible,setVisible]=useState(false)
  // O middleware manda o link completo; ao servidor vai só o caminho, e só se for
  // deste mesmo endereço (a validação final é de destinoDoLogin, no servidor).
  const bruto = useSearchParams().get("callbackUrl")
  let destino: string | undefined = destinoFixo
  if (!destino) {
    try {
      const u = bruto ? new URL(bruto, window.location.origin) : null
      if (u && u.origin === window.location.origin) destino = u.pathname + u.search + u.hash
    } catch {}
  }
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(loading)return
    const data=new FormData(event.currentTarget)
    setLoading(true);setError("")
    try {
      // Server Action: login e redirect acontecem no servidor (callbackUrl validado ou /dashboard).
      const result=await loginAction(String(data.get("login")).trim(),String(data.get("password")),destino)
      if(result?.error){setError(result.error);setLoading(false)}
    } catch {setError("Não foi possível entrar agora. Verifique sua conexão e tente novamente.");setLoading(false)}
  }
  return <section className={styles.panel} aria-labelledby="auth-title">
    <p className={styles.eyebrow}>{eyebrow}</p><h1 id="auth-title">{titulo}</h1><p className={styles.description}>{descricao}</p>
    <form onSubmit={submit} className={styles.form} aria-busy={loading}>
      <div className={styles.field}><label htmlFor="login">E-mail ou telefone</label><input id="login" name="login" autoComplete="username" required placeholder="Seu e-mail ou telefone" autoCapitalize="none" spellCheck={false}/></div>
      <div className={styles.field}><label htmlFor="password">Senha</label><div className={styles.password}><input id="password" name="password" type={visible?"text":"password"} autoComplete="current-password" required placeholder="Sua senha"/><button type="button" aria-label={visible?"Ocultar senha":"Mostrar senha"} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></div>
      {error&&<p role="alert" className={styles.error}>{error}</p>}
      <button className={styles.primary} disabled={loading} type="submit">{loading?"Entrando…":"Entrar"}<ArrowRight size={16}/></button>
    </form><div className={styles.links}><Link href="/esqueci-senha">Esqueci minha senha</Link>{linkExtra && <Link href={linkExtra.href}>{linkExtra.texto}</Link>}</div>
  </section>
}

"use client"

import { useState, useRef, useEffect } from "react"
import { useSession } from "next-auth/react"
import { X, User, Lock, Trash2, Save, Eye, EyeOff, Camera, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { iniciais } from "@/lib/pessoas-ui"
import Image from "next/image"
import styles from "./ProfileSurface.module.css"

interface Props {
  onClose?: () => void
  mode?: "modal" | "page"
}

type Tab = "resumo" | "perfil" | "senha" | "conta"

export function UserProfileModal({ onClose, mode = "modal" }: Props) {
  const { data: session, update } = useSession()
  const user = session?.user

  const [tab, setTab] = useState<Tab>(mode === "page" ? "resumo" : "perfil")
  const [loading, setLoading] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Perfil
  const [nome, setNome] = useState(user?.name ?? "")
  const [telefone, setTelefone] = useState("")
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.image ?? null)

  const [social, setSocial] = useState({ instagramUrl: "", linkedinUrl: "", portfolioUrl: "", bio: "" })
  const [profileReady, setProfileReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/usuarios/me", { signal: controller.signal }).then(async res => {
      if (!res.ok) throw new Error("Falha ao carregar perfil")
      const { usuario } = await res.json()
      setNome(usuario.nome); setTelefone(usuario.telefone ?? ""); setAvatarPreview(usuario.avatarUrl ?? null)
      setSocial({ instagramUrl: usuario.instagramUrl ?? "", linkedinUrl: usuario.linkedinUrl ?? "", portfolioUrl: usuario.portfolioUrl ?? "", bio: usuario.bio ?? "" })
      setProfileReady(true); setLoadError(false)
    }).catch(() => { if (!controller.signal.aborted) setLoadError(true) })
    return () => controller.abort()
  }, [reload])

  // Senha
  const [senhaAtual, setSenhaAtual] = useState("")
  const [novaSenha, setNovaSenha] = useState("")
  const [confirma, setConfirma] = useState("")
  const [showSenha, setShowSenha] = useState(false)

  function flash(type: "ok" | "err", text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  // Upload de foto de perfil (base64)
  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      flash("err", "A foto deve ter no máximo 2MB")
      return
    }

    setUploadingFoto(true)
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch("/api/usuarios/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: base64 }),
      })
      if (!res.ok) throw new Error((await res.json()).error)

      setAvatarPreview(base64)
      await update({ image: base64 })
      flash("ok", "Foto atualizada com sucesso!")
    } catch {
      flash("err", "Erro ao atualizar foto")
    } finally {
      setUploadingFoto(false)
    }
  }

  async function salvarPerfil() {
    setLoading(true)
    try {
      const res = await fetch("/api/usuarios/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, telefone, ...social }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await update({ name: nome })
      flash("ok", "Perfil atualizado com sucesso!")
    } catch (e: unknown) {
      flash("err", e instanceof Error ? e.message : "Erro ao salvar")
    } finally {
      setLoading(false)
    }
  }

  async function alterarSenha() {
    if (novaSenha !== confirma) return flash("err", "As senhas não coincidem")
    if (novaSenha.length < 6) return flash("err", "Nova senha deve ter ao menos 6 caracteres")
    setLoading(true)
    try {
      const res = await fetch("/api/usuarios/me/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, novaSenha }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      flash("ok", "Senha alterada com sucesso!")
      setSenhaAtual(""); setNovaSenha(""); setConfirma("")
    } catch (e: unknown) {
      flash("err", e instanceof Error ? e.message : "Erro ao alterar senha")
    } finally {
      setLoading(false)
    }
  }

  const letras = iniciais(nome || user?.name || "")

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    ...(mode === "page" ? [{ id: "resumo" as const, label: "Visão geral", icon: User }] : []),
    { id: "perfil", label: "Dados pessoais", icon: User },
    { id: "senha", label: "Segurança", icon: Lock },
    { id: "conta", label: "Conta", icon: Trash2 },
  ]

  const inputCls = "w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-zinc-800 text-zinc-200 placeholder-zinc-500"

  return (
    <div role={mode === "modal" ? "dialog" : undefined} aria-modal={mode === "modal" ? true : undefined} aria-label="Minha conta" className={mode === "page" ? styles.page : "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"}>
      <div className={mode === "page" ? styles.surface : "bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90dvh]"}>
        {mode === "page" && <><p className={styles.eyebrow}>SEU ESPAÇO NO NUFLOW</p><h1 className={styles.title}>Meu perfil</h1><p className={styles.subtitle}>Seu trabalho, suas conexões e suas preferências.</p><section className={styles.hero}>{avatarPreview ? <Image src={avatarPreview} alt="Foto de perfil" width={72} height={72} unoptimized className={styles.initials}/> : <span className={styles.initials}>{letras}</span>}<div><h2>{profileReady ? nome : user?.name}</h2><p>{user?.email}</p><span className={styles.badge}>{user?.tipo}</span></div></section></>}
        {/* Header */}
        {mode === "modal" && <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="font-semibold text-zinc-100">Minha conta</h2>
          <button aria-label="Fechar minha conta" onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        }
        {/* Tabs */}
        <div className={mode === "page" ? styles.tabs : "flex border-b border-zinc-800"}>
          {tabs.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                aria-pressed={tab === t.id}
                onClick={() => { setTab(t.id); setMsg(null) }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors border-b-2",
                  tab === t.id
                    ? "border-white text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>

        <div className={mode === "page" ? styles.body : "p-6 space-y-4"}>
          {/* Flash message */}
          {msg && (
            <div role={msg.type === "err" ? "alert" : "status"} className={cn(
              "text-sm px-3 py-2 rounded-lg border",
              msg.type === "ok"
                ? "bg-green-900/30 text-green-400 border-green-800"
                : "bg-red-900/30 text-red-400 border-red-800"
            )}>
              {msg.text}
            </div>
          )}

          {loadError && <div role="alert" className="text-sm text-amber-300">Não foi possível carregar seu perfil. <button onClick={() => setReload(v => v + 1)} className="underline">Tentar novamente</button></div>}
          {!profileReady && !loadError && <p role="status">Carregando seu perfil…</p>}
          {tab === "resumo" && profileReady && <section className={styles.overview}><h2>Sobre você</h2><p>{social.bio || "Adicione sua apresentação profissional em Dados pessoais."}</p><dl><div><dt>E-mail</dt><dd>{user?.email || "Não informado"}</dd></div><div><dt>WhatsApp</dt><dd>{telefone || "Não informado"}</dd></div></dl><h3>Onde encontrar seu trabalho</h3>{!social.instagramUrl && !social.linkedinUrl && !social.portfolioUrl && <p>Seus links profissionais aparecerão aqui quando você os cadastrar.</p>}<div className={styles.links}>{([["Instagram", social.instagramUrl], ["LinkedIn", social.linkedinUrl], ["Portfólio", social.portfolioUrl]]).filter(([, url]) => /^https?:\/\//i.test(url)).map(([label, url]) => <a key={label} href={url} target="_blank" rel="noopener noreferrer">{label} ↗</a>)}</div><button className={styles.edit} onClick={() => setTab("perfil")}>Editar dados pessoais</button></section>}
          {/* ─── Perfil ─── */}
          {tab === "perfil" && profileReady && (
            <div className="space-y-4">
              {/* Avatar com upload */}
              <div className="flex items-center gap-4">
                <div className="relative group flex-shrink-0">
                  {avatarPreview ? (
                    <Image
                      src={avatarPreview}
                      alt="Foto de perfil"
                      width={64}
                      height={64}
                      className="w-16 h-16 rounded-full object-cover border-2 border-zinc-700"
                      unoptimized
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center text-white text-xl font-bold">
                      {letras}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadingFoto}
                    className="absolute inset-0 rounded-full bg-black/60 opacity-70 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center justify-center"
                    aria-label="Alterar foto" title="Alterar foto"
                  >
                    {uploadingFoto ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5 text-white" />
                    )}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFotoChange}
                  />
                </div>
                <div>
                  <p className="font-medium text-zinc-100">{user?.name}</p>
                  <p className="text-sm text-zinc-400">{user?.email}</p>
                  <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full capitalize mt-1 inline-block">
                    {user?.tipo}
                  </span>
                  <p className="text-[11px] text-zinc-500 mt-1">Toque na foto para alterá-la</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Nome</label>
                <input aria-label="Nome" autoComplete="name" className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Telefone / WhatsApp</label>
                <input aria-label="Telefone / WhatsApp" autoComplete="tel" className={inputCls} value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="+55 11 99999-9999" />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">E-mail</label>
                <input
                  aria-label="E-mail" className="w-full border border-zinc-800 rounded-lg px-3 py-2 text-sm bg-zinc-900 text-zinc-500 cursor-not-allowed"
                  value={user?.email ?? ""}
                  disabled
                />
                <p className="text-[11px] text-zinc-500 mt-1">Para alterar o e-mail, contate o administrador.</p>
              </div>

              <div className="border-t border-zinc-700 pt-5 space-y-4">
                <div><h3 className="font-semibold text-zinc-100">Sobre você</h3><p className="text-xs text-zinc-400 mt-1">Sua apresentação profissional e onde encontrar seu trabalho. Campos opcionais.</p></div>
                <label className="block text-xs text-zinc-400">Apresentação
                  <textarea aria-label="Apresentação" maxLength={500} rows={3} className={inputCls + " mt-1"} value={social.bio} onChange={e => setSocial(v => ({ ...v, bio: e.target.value }))} placeholder="Conte um pouco sobre seu trabalho e especialidades" />
                </label>
                <div className="grid sm:grid-cols-2 gap-4">
                  {([['instagramUrl','Instagram'],['linkedinUrl','LinkedIn'],['portfolioUrl','Site / Portfólio']] as const).map(([key,label]) => <label key={key} className="block text-xs text-zinc-400">{label}<input type="url" aria-label={label} className={inputCls + " mt-1"} placeholder="https://" value={social[key]} onChange={e => setSocial(v => ({ ...v, [key]: e.target.value }))} /></label>)}
                </div>
              </div>

              <button
                onClick={salvarPerfil}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-white text-zinc-900 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-100 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {loading ? "Salvando..." : "Salvar Perfil"}
              </button>
            </div>
          )}

          {/* ─── Senha ─── */}
          {tab === "senha" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Senha Atual</label>
                <div className="relative">
                  <input
                    aria-label="Senha atual" autoComplete="current-password" type={showSenha ? "text" : "password"}
                    className={inputCls + " pr-10"}
                    value={senhaAtual}
                    onChange={(e) => setSenhaAtual(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button aria-label={showSenha ? "Ocultar senha atual" : "Mostrar senha atual"} type="button" onClick={() => setShowSenha((v) => !v)} className="absolute right-3 top-2.5 text-zinc-400">
                    {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Nova Senha</label>
                <input aria-label="Nova senha" autoComplete="new-password" type="password" className={inputCls} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1">Confirmar Nova Senha</label>
                <input aria-label="Confirmar nova senha" autoComplete="new-password" type="password" className={inputCls} value={confirma} onChange={(e) => setConfirma(e.target.value)} placeholder="Repita a nova senha" />
              </div>

              <button
                onClick={alterarSenha}
                disabled={loading || !senhaAtual || !novaSenha}
                className="w-full flex items-center justify-center gap-2 bg-white text-zinc-900 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-100 transition-colors disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                {loading ? "Alterando..." : "Alterar Senha"}
              </button>
            </div>
          )}

          {/* ─── Conta ─── */}
          {tab === "conta" && (
            <div className="space-y-4">
              <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Trash2 className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-300">Excluir Conta</p>
                    <p className="text-xs text-red-400 mt-1">
                      A exclusão não é realizada nesta tela. Converse com o administrador da sua empresa sobre desativação e tratamento dos seus dados.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-800/50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-medium text-zinc-400">Informações da conta</p>
                <div className="text-xs text-zinc-500 space-y-1">
                  <p>Tipo: <span className="font-medium capitalize text-zinc-300">{user?.tipo}</span></p>
                  <p>Status: <span className="font-medium text-green-400">Ativo</span></p>
                </div>
              </div>

              <p className="text-xs text-zinc-500 text-center">
                Para solicitar a desativação, procure o administrador da sua empresa.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

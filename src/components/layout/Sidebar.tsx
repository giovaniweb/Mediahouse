"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Film,
  Camera,
  Users,
  Bell,
  BarChart2,
  Settings,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  DollarSign,
  UserCog,
  Building2,
  Home,
  BrainCircuit,
  Package,
  LogOut,
  Lightbulb,
  MessageSquare,
  MessageSquareWarning,
  FileText,
  Archive,
  PlayCircle,
  PartyPopper,
  Truck,
  Boxes,
  Image as ImageIcon,
  Inbox,
  Sparkles,
  Layers,
  VideoOff,
  ScrollText,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { WhatsAppStatus } from "@/components/layout/WhatsAppStatus"
import { useMe } from "@/hooks/usePermissoes"
import { PERMISSAO_HREF_MAP } from "@/lib/permissoes"
import { GROWTH_ATIVO, EVENTOS_ATIVO, IDEIAS_ATIVO, MENSAGENS_ATIVO } from "@/lib/modulos"
import { signOut } from "next-auth/react"
import { VersaoNoAr } from "@/components/layout/VersaoNoAr"

const sections = [
  {
    label: "Geral",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/agenda", label: "Agenda", icon: CalendarDays },
      { href: "/produtos", label: "Produtos", icon: Package },
      { href: "/ideias", label: "Banco de Ideias", icon: Lightbulb },
      { href: "/mensagens", label: "Mensagens", icon: MessageSquare },
      { href: "/caixa-entrada", label: "Caixa de Entrada", icon: Inbox },
    ],
  },
  {
    label: "Audiovisual",
    items: [
      { href: "/demandas", label: "Demandas", icon: Film },
      { href: "/coberturas", label: "Coberturas", icon: CalendarRange },
      { href: "/aprovacoes", label: "Aprovações", icon: ClipboardCheck },
      { href: "/galeria", label: "Galeria", icon: PlayCircle },
      // Externo = contratado por diária; interno = time da casa. O sistema inteiro
      // diz "videomaker interno" e "videomaker externo", e só isso — eram cinco
      // nomes para duas coisas, e cada tela usava um.
      { href: "/videomakers", label: "Videomakers Externos", icon: Camera },
      { href: "/equipe", label: "Videomakers Internos", icon: Users },
      { href: "/custos", label: "Custos", icon: DollarSign },
      { href: "/historico", label: "Histórico", icon: Archive },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/design", label: "Demandas", icon: Sparkles },
      { href: "/aprovacoes/growth", label: "Aprovações", icon: ClipboardCheck },
      { href: "/galeria-artes", label: "Galeria Criativos", icon: ImageIcon },
      { href: "/growth/equipe", label: "Equipe Growth", icon: Users },
      { href: "/configuracoes/linhas-projetos", label: "Linhas / Projetos", icon: Layers },
    ],
  },
  {
    label: "Eventos",
    items: [
      { href: "/eventos", label: "Eventos", icon: PartyPopper },
      { href: "/fornecedores", label: "Fornecedores", icon: Truck },
      { href: "/produtos-servico", label: "Produtos & Serviços", icon: Boxes },
    ],
  },
  {
    label: "Analytics",
    items: [
      { href: "/ia", label: "Central IA", icon: BrainCircuit },
      { href: "/alertas", label: "Alertas IA", icon: Bell },
      // A fila de avisos não entregues só era alcançável por um badge que sumia
      // depois de 24 h — e /mensagens, a outra porta, está congelada. Resultado:
      // 716 mensagens falharam em 30 dias sem ninguém ver. Agora tem porta fixa.
      { href: "/mensagens-falhadas", label: "Avisos não entregues", icon: MessageSquareWarning },
      { href: "/relatorios", label: "Relatórios", icon: BarChart2 },
      // Era item fixo do audiovisual: um relatório de diagnóstico promovido ao menu
      // principal. Continua acessível, mas junto dos outros relatórios.
      { href: "/relatorios/finalizadas-sem-video", label: "Entregas sem vídeo", icon: VideoOff },
    ],
  },
  {
    // Acima das empresas: só aparece para quem administra a PLATAFORMA. A
    // autorização de verdade está no servidor (requireSuperAdmin + notFound na
    // página); esconder o link é conveniência, não proteção.
    label: "Plataforma",
    superAdmin: true,
    items: [
      { href: "/admin/organizacoes", label: "Organizações", icon: Building2 },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/usuarios", label: "Usuários", icon: UserCog },
      // O histórico existia só dentro do card: não havia como responder "o que
      // mudou ontem" nem "o que fulano fez". Restrito a gestor pela própria rota.
      { href: "/auditoria", label: "Registro de Auditoria", icon: ScrollText },
      { href: "/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: me } = useMe()

  const isAdmin = me?.tipo === "admin" || me?.tipo === "gestor"
  const atuaEmGrowth = me?.membership?.areas?.includes("growth") ?? false
  const podeVerGrowth = atuaEmGrowth || !!me?.permissoes?.verDesign
  const podeGerenciarGrowth = atuaEmGrowth || !!me?.permissoes?.gerenciarDesigners

  // Filtra itens com base nas permissões
  const canSee = (href: string) => {
    // Itens de módulos congelados — ocultos para todos (ver src/lib/modulos.ts)
    if (href === "/ideias" && !IDEIAS_ATIVO) return false
    if (href === "/mensagens" && !MENSAGENS_ATIVO) return false
    if (!me?.permissoes) return true // loading → mostra tudo
    if (isAdmin) return true
    if ((href === "/design" || href === "/galeria-artes") && podeVerGrowth) return true
    if ((href === "/growth/equipe" || href === "/configuracoes/linhas-projetos") && podeGerenciarGrowth) return true
    const key = PERMISSAO_HREF_MAP[href]
    if (!key) return true
    return !!me.permissoes[key]
  }

  return (
    <aside className="w-56 min-h-screen bg-zinc-900 flex flex-col border-r border-zinc-800">
      {/* Logo + WhatsApp Status */}
      <div className="px-4 py-5 border-b border-zinc-800 space-y-3">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="NuFlow" className="w-7 h-7 rounded-md shrink-0" />
          <span className="text-white font-semibold tracking-tight">NuFlow</span>
        </div>
        <WhatsAppStatus />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {/* Link Página Inicial */}
        <Link
          href="/sobre"
          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          <Home className="w-4 h-4 flex-shrink-0" />
          Página Inicial
        </Link>

        {/* Link exclusivo para videomakers externos */}
        {me?.tipo === "videomaker" && (
          <div>
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-3 mb-1">
              Minha Área
            </p>
            <div className="space-y-0.5">
              {[
                { href: "/dashboard", label: "Meu Painel", icon: LayoutDashboard },
                // O videomaker enxerga o quadro do audiovisual inteiro, não só o
                // que é dele — o rótulo antigo prometia menos do que a tela entrega.
                { href: "/demandas", label: "Demandas", icon: Film },
                { href: "/minhas-notas", label: "Notas Fiscais", icon: FileText },
              ].map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
                return (
                  <Link key={item.href} href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                      isActive ? "bg-white text-zinc-900 font-medium" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                    )}>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {me?.tipo !== "videomaker" && sections.map((section) => {
          // Módulos congelados — ocultos da navegação (ver src/lib/modulos.ts)
          if (section.label === "Growth" && !GROWTH_ATIVO) return null
          if (section.label === "Eventos" && !EVENTOS_ATIVO) return null

          // Seção da plataforma some para quem não administra a plataforma.
          if (section.superAdmin && !me?.superAdmin) return null
          const visibleItems = section.items.filter((item) => canSee(item.href))
          if (visibleItems.length === 0) return null

          return (
            <div key={section.label}>
              <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-3 mb-1">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href))

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                        isActive
                          ? "bg-white text-zinc-900 font-medium"
                          : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                      )}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* User info + Logout */}
      {me && (
        <div className="px-3 py-3 border-t border-zinc-800">
          <div className="flex items-center gap-2 px-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-white">
              {me.nome?.charAt(0)?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-medium truncate">{me.nome}</p>
              <p className="text-[10px] text-zinc-500 capitalize">{me.tipo}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors w-full"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      )}

      <VersaoNoAr />
    </aside>
  )
}

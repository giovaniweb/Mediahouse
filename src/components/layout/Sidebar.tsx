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
  ClipboardCheck,
  DollarSign,
  UserCog,
  Home,
  BrainCircuit,
  Package,
  LogOut,
  Lightbulb,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { WhatsAppStatus } from "@/components/layout/WhatsAppStatus"
import { useMe } from "@/hooks/usePermissoes"
import { PERMISSAO_HREF_MAP } from "@/lib/permissoes"
import { signOut } from "next-auth/react"

const sections = [
  {
    label: "Operacional",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/demandas", label: "Demandas", icon: Film },
      { href: "/aprovacoes", label: "Aprovações", icon: ClipboardCheck },
      { href: "/agenda", label: "Agenda", icon: CalendarDays },
      { href: "/produtos", label: "Produtos", icon: Package },
      { href: "/ideias", label: "Banco de Ideias", icon: Lightbulb },
    ],
  },
  {
    label: "Equipe",
    items: [
      { href: "/videomakers", label: "Videomakers Ext", icon: Camera },
      { href: "/equipe", label: "Videomakers Int", icon: Users },
      { href: "/custos", label: "Custos", icon: DollarSign },
    ],
  },
  {
    label: "Analytics",
    items: [
      { href: "/ia", label: "Central IA", icon: BrainCircuit },
      { href: "/alertas", label: "Alertas IA", icon: Bell },
      { href: "/relatorios", label: "Relatórios", icon: BarChart2 },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/usuarios", label: "Usuários", icon: UserCog },
      { href: "/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: me } = useMe()

  const isAdmin = me?.tipo === "admin" || me?.tipo === "gestor"

  // Filtra itens com base nas permissões
  const canSee = (href: string) => {
    if (!me?.permissoes) return true // loading → mostra tudo
    if (isAdmin) return true
    const key = PERMISSAO_HREF_MAP[href]
    if (!key) return true
    return !!me.permissoes[key]
  }

  return (
    <aside className="w-56 min-h-screen bg-zinc-900 flex flex-col border-r border-zinc-800">
      {/* Logo + WhatsApp Status */}
      <div className="px-4 py-5 border-b border-zinc-800 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center shrink-0">
            <Film className="w-4 h-4 text-zinc-900" />
          </div>
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

        {sections.map((section) => {
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
    </aside>
  )
}

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
} from "lucide-react"
import { cn } from "@/lib/utils"

const sections = [
  {
    label: "Operacional",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/demandas", label: "Demandas", icon: Film },
      { href: "/aprovacoes", label: "Aprovações", icon: ClipboardCheck },
      { href: "/agenda", label: "Agenda", icon: CalendarDays },
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

  return (
    <aside className="w-56 min-h-screen bg-zinc-900 flex flex-col border-r border-zinc-800">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center shrink-0">
            <Film className="w-4 h-4 text-zinc-900" />
          </div>
          <span className="text-white font-semibold tracking-tight">VideoOps</span>
        </div>
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

        {sections.map((section) => (
          <div key={section.label}>
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-3 mb-1">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
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
        ))}
      </nav>
    </aside>
  )
}

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Film,
  Users,
  Calendar,
  Bell,
  BarChart2,
  Settings,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/demandas", label: "Demandas", icon: Film },
  { href: "/videomakers", label: "Videomakers", icon: Users },
  { href: "/equipe", label: "Equipe", icon: Users },
  { href: "/urgencias", label: "Urgências", icon: Zap },
  { href: "/alertas", label: "Alertas IA", icon: Bell },
  { href: "/relatorios", label: "Relatórios", icon: BarChart2 },
  { href: "/configuracoes", label: "Config.", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 min-h-screen bg-zinc-900 flex flex-col">
      <div className="px-4 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center">
            <Film className="w-4 h-4 text-zinc-900" />
          </div>
          <span className="text-white font-semibold tracking-tight">VideoOps</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item) => {
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
      </nav>
    </aside>
  )
}

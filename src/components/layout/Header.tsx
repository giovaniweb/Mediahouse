"use client"

import { useState } from "react"
import { signOut, useSession } from "next-auth/react"
import { LogOut, User, Settings } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { NotificationBell } from "@/components/layout/NotificationBell"
import { UserProfileModal } from "@/components/layout/UserProfileModal"
import Link from "next/link"

const TIPO_LABEL: Record<string, string> = {
  admin: "Admin",
  gestor: "Gestor",
  operacao: "Operação",
  solicitante: "Solicitante",
  editor: "Editor",
  videomaker: "Videomaker",
  social: "Social Media",
}

export function Header({ title, actions }: { title?: string; actions?: React.ReactNode }) {
  const { data: session } = useSession()
  const user = session?.user
  const [showProfile, setShowProfile] = useState(false)

  return (
    <>
      <header className="h-14 border-b border-zinc-100 bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          {title && <h1 className="text-sm font-semibold text-zinc-800">{title}</h1>}
          {actions && <div>{actions}</div>}
        </div>

        <div className="flex items-center gap-2">
          {user?.tipo && (
            <Badge variant="outline" className="text-xs capitalize">
              {TIPO_LABEL[user.tipo] ?? user.tipo}
            </Badge>
          )}

          {/* Sininho de notificações */}
          <NotificationBell />

          {/* Avatar com dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="outline-none">
              <Avatar className="h-8 w-8 cursor-pointer">
                {user?.image && <AvatarImage src={user.image} />}
                <AvatarFallback className="bg-zinc-900 text-white text-xs">
                  {user?.name?.slice(0, 2).toUpperCase() ?? "??"}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <div className="px-3 py-2">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowProfile(true)}
                className="flex items-center gap-2 cursor-pointer"
              >
                <User className="w-4 h-4" />
                Meu Perfil
              </DropdownMenuItem>
              {["admin", "gestor"].includes(user?.tipo ?? "") && (
                <DropdownMenuItem
                  onClick={() => window.location.href = "/configuracoes"}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Settings className="w-4 h-4" />
                  Configurações
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-2 text-red-600 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {showProfile && <UserProfileModal onClose={() => setShowProfile(false)} />}
    </>
  )
}

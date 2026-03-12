"use client"

import { signOut } from "next-auth/react"
import { useSession } from "next-auth/react"
import { LogOut, User } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

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

  return (
    <header className="h-14 border-b border-zinc-100 bg-white flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        {title && <h1 className="text-sm font-semibold text-zinc-800">{title}</h1>}
        {actions && <div>{actions}</div>}
      </div>

      <div className="flex items-center gap-3">
        {user?.tipo && (
          <Badge variant="outline" className="text-xs capitalize">
            {TIPO_LABEL[user.tipo] ?? user.tipo}
          </Badge>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger className="outline-none">
            <Avatar className="h-8 w-8 cursor-pointer">
              <AvatarFallback className="bg-zinc-900 text-white text-xs">
                {user?.name?.slice(0, 2).toUpperCase() ?? "??"}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-3 py-2">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
            </div>
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
  )
}

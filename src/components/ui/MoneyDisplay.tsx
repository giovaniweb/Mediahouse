"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"

interface MoneyDisplayProps {
  value: number | null | undefined
  className?: string
  suffix?: string
  prefix?: string
  size?: "sm" | "md" | "lg"
}

export function MoneyDisplay({ value, className, suffix, prefix = "R$", size = "sm" }: MoneyDisplayProps) {
  const [visible, setVisible] = useState(false)

  if (value == null) return <span className={cn("text-zinc-500", className)}>—</span>

  const formatted = Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const iconSize = size === "lg" ? "w-4 h-4" : size === "md" ? "w-3.5 h-3.5" : "w-3 h-3"

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span>{prefix} {visible ? formatted : "••••••"}</span>
      {suffix && visible && <span>{suffix}</span>}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setVisible(!visible) }}
        className="text-zinc-500 hover:text-zinc-300 transition-colors"
        title={visible ? "Ocultar valor" : "Mostrar valor"}
      >
        {visible ? <EyeOff className={iconSize} /> : <Eye className={iconSize} />}
      </button>
    </span>
  )
}

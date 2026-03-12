import { cn } from "@/lib/utils"
import { ReactNode } from "react"

const colors = {
  blue: "bg-blue-50 text-blue-600 border-blue-100",
  red: "bg-red-50 text-red-600 border-red-100",
  green: "bg-green-50 text-green-600 border-green-100",
  yellow: "bg-yellow-50 text-yellow-600 border-yellow-100",
  purple: "bg-purple-50 text-purple-600 border-purple-100",
}

interface MetricCardProps {
  label: string
  value: number | string
  icon: ReactNode
  color: keyof typeof colors
  small?: boolean
}

export function MetricCard({ label, value, icon, color, small }: MetricCardProps) {
  return (
    <div className={cn("rounded-xl border p-4 bg-white shadow-sm", small && "p-3")}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</span>
        <div className={cn("p-1.5 rounded-lg border", colors[color])}>{icon}</div>
      </div>
      <p className={cn("font-bold text-zinc-900", small ? "text-2xl" : "text-3xl")}>{value}</p>
    </div>
  )
}

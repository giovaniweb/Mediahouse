import { cn } from "@/lib/utils"
import { ReactNode } from "react"
import Link from "next/link"

const colors = {
  blue: { icon: "bg-blue-500/10 text-blue-400 border border-blue-800", value: "text-white", border: "border-blue-900/30" },
  red: { icon: "bg-red-500/10 text-red-400 border border-red-800", value: "text-red-300", border: "border-red-900/30" },
  green: { icon: "bg-green-500/10 text-green-400 border border-green-800", value: "text-green-300", border: "border-green-900/30" },
  yellow: { icon: "bg-yellow-500/10 text-yellow-400 border border-yellow-800", value: "text-yellow-300", border: "border-yellow-900/30" },
  purple: { icon: "bg-purple-500/10 text-purple-400 border border-purple-800", value: "text-purple-300", border: "border-purple-900/30" },
}

interface MetricCardProps {
  label: string
  value: number | string
  icon: ReactNode
  color: keyof typeof colors
  small?: boolean
  href?: string
  sublabel?: string
}

function CardContent({ label, value, icon, color, small, sublabel }: MetricCardProps) {
  const cfg = colors[color]
  return (
    <div className={cn(
      "rounded-xl border bg-zinc-900 shadow-sm transition-all",
      small ? "p-3" : "p-4",
      "border-zinc-800 hover:border-zinc-700"
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</span>
        <div className={cn("p-1.5 rounded-lg", cfg.icon)}>{icon}</div>
      </div>
      <p className={cn("font-bold", cfg.value, small ? "text-2xl" : "text-3xl")}>{value}</p>
      {sublabel && <p className="text-xs text-zinc-600 mt-1">{sublabel}</p>}
    </div>
  )
}

export function MetricCard(props: MetricCardProps) {
  if (props.href) {
    return (
      <Link href={props.href} className="block group">
        <CardContent {...props} />
      </Link>
    )
  }
  return <CardContent {...props} />
}

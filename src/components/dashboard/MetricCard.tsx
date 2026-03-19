import { cn } from "@/lib/utils"
import { ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

const colors = {
  blue: {
    bg: "from-blue-500/5 to-blue-600/10",
    icon: "bg-blue-500/15 text-blue-400",
    border: "border-l-blue-500",
    value: "text-white",
    hover: "hover:border-blue-500/40",
  },
  red: {
    bg: "from-red-500/5 to-red-600/10",
    icon: "bg-red-500/15 text-red-400",
    border: "border-l-red-500",
    value: "text-red-300",
    hover: "hover:border-red-500/40",
  },
  green: {
    bg: "from-emerald-500/5 to-emerald-600/10",
    icon: "bg-emerald-500/15 text-emerald-400",
    border: "border-l-emerald-500",
    value: "text-emerald-300",
    hover: "hover:border-emerald-500/40",
  },
  yellow: {
    bg: "from-amber-500/5 to-amber-600/10",
    icon: "bg-amber-500/15 text-amber-400",
    border: "border-l-amber-500",
    value: "text-amber-300",
    hover: "hover:border-amber-500/40",
  },
  purple: {
    bg: "from-purple-500/5 to-purple-600/10",
    icon: "bg-purple-500/15 text-purple-400",
    border: "border-l-purple-500",
    value: "text-purple-300",
    hover: "hover:border-purple-500/40",
  },
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

function CardContent({ label, value, icon, color, small, sublabel, href }: MetricCardProps) {
  const cfg = colors[color]
  return (
    <div className={cn(
      "relative rounded-xl border border-zinc-800 bg-gradient-to-br shadow-sm transition-all duration-200 overflow-hidden border-l-[3px]",
      cfg.bg, cfg.border, cfg.hover,
      small ? "p-3.5" : "p-5",
      href && "group cursor-pointer hover:shadow-md hover:shadow-black/20 hover:scale-[1.01]"
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">{label}</span>
          <p className={cn("font-bold mt-1", cfg.value, small ? "text-2xl" : "text-3xl")}>{value}</p>
          {sublabel && <p className="text-[11px] text-zinc-600 mt-1">{sublabel}</p>}
        </div>
        <div className={cn("p-2 rounded-xl", cfg.icon)}>
          {icon}
        </div>
      </div>
      {href && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500" />
        </div>
      )}
    </div>
  )
}

export function MetricCard(props: MetricCardProps) {
  if (props.href) {
    return (
      <Link href={props.href} className="block">
        <CardContent {...props} />
      </Link>
    )
  }
  return <CardContent {...props} />
}

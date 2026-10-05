import { CAIXA, LILAS, ONDA, PONTO, TRACO } from "./simbolo"
import s from "./Marca.module.css"

/** O símbolo do NuFlow. Decorativo, a não ser que receba um `titulo`. */
export function SimboloNuFlow({ className, titulo }: { className?: string; titulo?: string }) {
  return (
    <svg viewBox={CAIXA} className={className ? `${s.simbolo} ${className}` : s.simbolo}
      role={titulo ? "img" : undefined} aria-label={titulo} aria-hidden={titulo ? undefined : true}>
      <path d={ONDA} fill="none" stroke={LILAS} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round" />
      <circle {...PONTO} fill={LILAS} />
    </svg>
  )
}

/** Símbolo + "NuFlow.". O tamanho e a cor das letras vêm de quem usa (font-size, color). */
export function LogoNuFlow({ className }: { className?: string }) {
  return (
    <span className={className ? `${s.logo} ${className}` : s.logo}>
      <SimboloNuFlow />
      <span>NuFlow<i>.</i></span>
    </span>
  )
}

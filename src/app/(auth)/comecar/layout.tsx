import { Aperture } from "lucide-react"
import Link from "next/link"
import "@/components/layout/Montserrat.css"
import styles from "@/components/auth/AuthSurface.module.css"

// A moldura da página de interesse: o mesmo desenho que o login ganha com o
// visual novo. Fica aqui, e não em (auth)/layout, para não mexer no login atual
// — quando o visual novo chegar à main, esta moldura passa para (auth)/layout e
// este arquivo sai (senão a página fica com duas molduras).
export default function ComecarLayout({ children }: { children: React.ReactNode }) {
  return <main className={styles.shell}>
    <aside className={styles.story}>
      <Link href="/" className={styles.brand}><Aperture size={32} aria-hidden="true" />NuFlow.</Link>
      <div><h2>Seu trabalho encontra o ritmo.<strong>Sua criatividade ganha espaço.</strong></h2><p>Do primeiro pedido à entrega. Pessoas, prazos e próximos passos no mesmo flow.</p><div className={styles.flow}><span>Pedido</span><span>Produção</span><span>Aprovação</span><span>Entrega</span></div></div>
      <footer>Menos coisas para guardar na cabeça. Mais espaço para criar.</footer>
    </aside>
    <div className={styles.content}>{children}</div>
  </main>
}

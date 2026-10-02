import { prismaAuth } from "@/lib/prisma-auth"
import FormularioGravacao from "./formulario"
import styles from "@/components/auth/AuthSurface.module.css"

export default async function AgendarGravacao({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await searchParams
  const empresa = typeof org === "string" && org.trim() ? await prismaAuth.organizacao.findUnique({ where: { slug: org.trim() }, select: { nome: true, ativo: true } }) : null
  if (!empresa?.ativo) return <section className={styles.panel}><h1>Precisamos do link da empresa.</h1><p className={styles.description}>Peça à equipe o link do formulário de gravação. Assim seu pedido chega ao lugar certo.</p></section>
  return <FormularioGravacao org={org!.trim()} empresa={empresa.nome}/>
}

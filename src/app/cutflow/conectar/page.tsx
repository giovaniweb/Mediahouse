import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getOrgId } from "@/lib/org"
import { prisma } from "@/lib/prisma"
import { moduloAtivo } from "@/lib/modulos-org"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { podePermissao } from "@/lib/permissoes"
import { codigoDeConfirmacao, lerPedido } from "@/lib/cutflow"
import { AutorizarCutflow } from "./AutorizarCutflow"

export const dynamic = "force-dynamic"

// Passo 2 do login do plugin (ver lib/cutflow.ts): a pessoa, logada, confere o
// código que o Cutflow mostra e autoriza este computador. Tudo que pode dar
// errado é conferido aqui antes do botão aparecer — o botão não é oferecido para
// quem a rota vai recusar.
export default async function ConectarCutflowPage({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const { pedido: bruto } = await searchParams
  const session = await auth()
  if (!session) redirect(`/login?callbackUrl=${encodeURIComponent(`/cutflow/conectar?pedido=${bruto ?? ""}`)}`)

  const pedido = lerPedido(bruto)
  const organizacaoId = await getOrgId(session)
  let problema: string | null = null
  let empresa = ""
  if (!pedido) problema = "Este pedido de conexão venceu ou não é válido. Volte ao Cutflow e clique em Entrar de novo."
  else if (!organizacaoId) problema = "Sua conta não está ativa em nenhuma empresa do NuFlow."
  else {
    empresa = (await prisma.organizacao.findUnique({ where: { id: organizacaoId }, select: { nome: true } }))?.nome ?? ""
    if (!(await moduloAtivo(organizacaoId, "cutflow"))) problema = `O Cutflow não está liberado para ${empresa || "esta empresa"}.`
    else {
      const vinculo = await permissoesEfetivas(session.user.id, organizacaoId)
      if (!vinculo || !podePermissao(vinculo.permissoes, "usarCutflow")) {
        problema = "Sua conta não tem permissão para usar o Cutflow. Peça a um administrador do NuFlow (Pessoas & Acessos → Cutflow)."
      }
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 p-4 text-zinc-100">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-5">
        <div>
          <h1 className="text-lg font-semibold">Conectar o Cutflow</h1>
          <p className="text-sm text-zinc-400">Plugin do Premiere que edita os cards da fila do NuFlow.</p>
        </div>
        {problema || !pedido ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{problema}</p>
        ) : (
          <>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-zinc-400">Computador</dt><dd>{pedido.nomeComputador || "sem nome"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-zinc-400">Empresa</dt><dd>{empresa}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-zinc-400">Conta</dt><dd>{session.user.email ?? session.user.name}</dd></div>
            </dl>
            <div className="rounded-lg bg-zinc-800 p-4 text-center">
              <p className="text-xs text-zinc-400">Confira se o Cutflow mostra este código</p>
              <p className="mt-1 font-mono text-2xl tracking-widest">{codigoDeConfirmacao(pedido.dispositivoHash)}</p>
            </div>
            <p className="text-xs text-zinc-400">
              Se o código for diferente, feche esta página: o link veio de outro computador.
            </p>
            <AutorizarCutflow pedido={bruto!} />
          </>
        )}
      </div>
    </main>
  )
}

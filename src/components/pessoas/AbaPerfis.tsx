"use client"

// Aba Perfis de acesso — o mapa de "quem enxerga o quê", em seis linhas.
//
// O perfil é derivado do papel da pessoa, não um cadastro separado: por isso a
// tela lista os perfis e leva até as pessoas, em vez de oferecer um "novo
// perfil" que ninguém precisaria criar. O ajuste fino continua sendo por
// pessoa, no botão de permissões — é lá que a exceção mora.

import { ShieldCheck, Crown, UserCog, Users, Wrench, ExternalLink, Inbox, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type PessoaLista, type PerfilAcesso, PERFIS, PERFIL_LABEL, PERFIL_DESCRICAO,
  PERFIL_COR, perfilDe,
} from "@/lib/pessoas-ui"

const ICONE_PERFIL: Record<PerfilAcesso, React.ElementType> = {
  administrador: Crown,
  gestor: UserCog,
  lider: Users,
  executor: Wrench,
  executor_ext: ExternalLink,
  solicitante: Inbox,
}

export function AbaPerfis({ pessoas, onAbrirPerfil }: {
  pessoas: PessoaLista[]
  /** Leva para a aba Pessoas já filtrada por esse perfil. */
  onAbrirPerfil: (perfil: PerfilAcesso) => void
}) {
  const contagem = new Map<PerfilAcesso, number>()
  for (const p of pessoas) {
    const perfil = perfilDe(p)
    contagem.set(perfil, (contagem.get(perfil) ?? 0) + 1)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Define o que cada pessoa enxerga no NuFlow. O perfil vem do cargo; exceções são ajustadas pessoa a pessoa.
      </p>

      <div className="border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 border-b border-zinc-800">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">NOME DO PERFIL</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">DESCRIÇÃO</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500">PESSOAS</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {PERFIS.map(perfil => {
              const Icone = ICONE_PERFIL[perfil]
              const total = contagem.get(perfil) ?? 0
              return (
                <tr
                  key={perfil}
                  onClick={() => onAbrirPerfil(perfil)}
                  className="hover:bg-zinc-800/40 cursor-pointer group transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("w-7 h-7 rounded-lg border flex items-center justify-center shrink-0", PERFIL_COR[perfil])}>
                        <Icone className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium text-zinc-100">{PERFIL_LABEL[perfil]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{PERFIL_DESCRICAO[perfil]}</td>
                  <td className="px-4 py-3 text-right text-zinc-300 tabular-nums">{total}</td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500 flex items-start gap-2 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5">
        <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-600" />
        Clique num perfil para ver quem está nele. Para mudar o que uma pessoa
        específica enxerga, abra a pessoa e use <span className="text-zinc-300">Editar permissões</span>.
      </p>
    </div>
  )
}

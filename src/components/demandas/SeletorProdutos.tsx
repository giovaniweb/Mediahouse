"use client"

// O seletor de equipamentos / produtos dos formulários de criação: um select
// que adiciona, e os escolhidos viram chips. Saiu do NovaDemandaModal para o
// "+ Novo Job" usar o mesmo, em vez de uma segunda versão.

import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Chip, Seta, selectClass, erroClass } from "./campos-formulario"

export interface Produto { id: string; nome: string }

export function SeletorProdutos({ produtos, valores, onChange, classeSelect = selectClass, erro, id }: {
  produtos: Produto[]
  valores: string[]
  onChange: (atualizar: (atuais: string[]) => string[]) => void
  classeSelect?: string
  erro?: boolean
  id?: string
}) {
  const selecionados = valores
    .map((v) => produtos.find((p) => p.id === v))
    .filter((p): p is Produto => !!p)

  return (
    <>
      <div className="relative">
        <Plus className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <select
          id={id}
          value=""
          onChange={e => {
            const escolhido = e.target.value
            if (!escolhido) return
            onChange(prev => prev.includes(escolhido) ? prev : [...prev, escolhido])
          }}
          className={cn(classeSelect, "pl-10", erro && erroClass)}
        >
          <option value="">Adicionar equipamento / produto</option>
          {produtos
            .filter(p => !valores.includes(p.id))
            .map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <Seta />
      </div>

      {selecionados.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selecionados.map(p => (
            <Chip
              key={p.id}
              texto={p.nome}
              onRemover={() => onChange(prev => prev.filter(v => v !== p.id))}
            />
          ))}
        </div>
      )}
    </>
  )
}

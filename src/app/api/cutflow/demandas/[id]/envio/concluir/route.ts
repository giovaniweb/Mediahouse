import { NextRequest, NextResponse } from "next/server"
import { autenticarCutflow, ENVIO_INDISPONIVEL } from "@/lib/cutflow"

type Params = { params: Promise<{ id: string }> }

// POST /api/cutflow/demandas/[id]/envio/concluir — "Enviar para aprovação", passo 2.
//
// Conferia no Google Drive o arquivo enviado antes de registrar a versão e
// mudar o status. Sem o Drive (03/10/2026) não há o que conferir, e nada é
// registrado sem conferência: 410 até o envio ir ao armazenamento do NuFlow.
export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await autenticarCutflow(req)
  if (ctx instanceof NextResponse) return ctx
  await params
  return NextResponse.json({ error: ENVIO_INDISPONIVEL, codigo: "drive_removido" }, { status: 410 })
}

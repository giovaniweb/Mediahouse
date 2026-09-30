import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { mudarStatus } from "@/lib/mudar-status"

type Params = { params: Promise<{ id: string }> }

// A lógica mora em lib/mudar-status.ts (30/09/2026), para o Cutflow usar a mesma.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  return mudarStatus(session, id, await req.json())
}

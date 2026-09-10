import { NextResponse } from "next/server"

function retired() {
  return NextResponse.json({ error: "A caixa de entrada de e-mails foi desativada." }, { status: 410 })
}

export const POST = retired

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { criarSessaoUploadDrive } from "@/lib/google-drive"

/**
 * GET /api/auth/setup-drive/test
 * Testa a conexão com o Google Drive criando um arquivo vazio de teste.
 * Só para admin/gestor.
 */
export async function GET() {
  const session = await auth()
  if (!session || !["admin", "gestor"].includes(session.user?.tipo ?? "")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const fileName = `nuflow_teste_conexao_${Date.now()}.txt`

    // Cria uma sessão de upload para um arquivo txt de 13 bytes
    const { sessionUri, fileId, publicUrl } = await criarSessaoUploadDrive({
      fileName,
      fileSize: 13,
      contentType: "text/plain",
    })

    // Faz o upload do conteúdo do arquivo teste diretamente do servidor
    const uploadRes = await fetch(sessionUri, {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain",
        "Content-Length": "13",
      },
      body: "NuFlow teste.",
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      return NextResponse.json(
        { error: `Upload falhou: HTTP ${uploadRes.status} — ${errText.slice(0, 200)}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, fileName, fileId, publicUrl })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[setup-drive/test]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

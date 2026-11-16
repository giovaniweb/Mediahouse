import { NextRequest, NextResponse } from "next/server"
// O link do convite é aberto sem sessão e sem empresa, como o da recuperação de
// senha: lê pelo cliente de autenticação, o mesmo do login, que enxerga a
// identidade e o vínculo antes de haver empresa. Ver src/lib/prisma-auth.ts.
import { prismaAuth } from "@/lib/prisma-auth"
import { convitePendente } from "@/lib/convite-equipe"
import { emailReal } from "@/lib/acesso-videomaker"

// GET /api/auth/convite?token=xxx — o que a tela do link precisa mostrar.
//
// O link é o mesmo da recuperação de senha (/redefinir-senha/<token>). Esta rota
// diz se ele é de PRIMEIRO acesso — a pessoa nunca criou senha — e, nesse caso,
// devolve o nome, o e-mail (para entrar logo depois) e a empresa. Só quem tem o
// token, que chegou no e-mail dela, recebe isso.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.slice(0, 128)
  if (!token) return NextResponse.json({ valido: false })

  const registro = await prismaAuth.passwordResetToken.findUnique({ where: { token } })
  if (!registro || registro.usedAt || registro.expiresAt < new Date()) {
    return NextResponse.json({ valido: false })
  }

  const usuario = await prismaAuth.usuario.findUnique({
    where: { email: registro.email },
    select: { nome: true, email: true, telefone: true, status: true, senhaHash: true },
  })
  if (!usuario || usuario.status === "inativo") return NextResponse.json({ valido: false })
  if (!convitePendente(usuario.senhaHash)) return NextResponse.json({ valido: true, primeiroAcesso: false })

  // A empresa do convite é o vínculo mais novo: quem convidou acabou de criá-lo.
  const vinculo = await prismaAuth.usuarioOrganizacao.findFirst({
    where: { usuario: { email: registro.email } },
    orderBy: { createdAt: "desc" },
    select: { organizacao: { select: { nome: true } } },
  })
  return NextResponse.json({
    valido: true,
    primeiroAcesso: true,
    nome: usuario.nome.split(/\s+/)[0],
    email: usuario.email,
    // Conta de videomaker sem e-mail real (e-mail interno @nuflow.local, ver
    // src/lib/acesso-videomaker.ts): ele entra pelo telefone, e é isso que a
    // tela mostra. O e-mail interno continua indo para o login automático.
    loginTelefone: !emailReal(usuario.email) && usuario.telefone ? usuario.telefone.replace(/\D/g, "") : null,
    empresa: vinculo?.organizacao.nome ?? null,
  })
}

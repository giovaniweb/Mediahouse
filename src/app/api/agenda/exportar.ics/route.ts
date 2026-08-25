import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { dataEmSaoPaulo, somarDias } from "@/lib/datas"

// Evento com hora vai em UTC com sufixo Z — formato absoluto, que todo cliente
// de calendário converte para o fuso de quem lê. Correto como estava.
function formatDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
}

// Evento de DIA INTEIRO é data de calendário, não instante: precisa do dia em
// São Paulo. Com toISOString() um evento que começa às 21h vira o dia seguinte,
// e o compromisso aparecia deslocado na agenda do usuário.
function dataIcal(d: Date): string {
  return dataEmSaoPaulo(d).replace(/-/g, "")
}

function escapeIcal(s: string): string {
  return (s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
}

// GET /api/agenda/exportar.ics
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const eventos = await prisma.evento.findMany({
    where: {
      // O `videomakerId: null` (eventos "de sistema") trazia os de todas as
      // empresas para dentro do .ics — o calendário de uma pessoa acabava com
      // compromisso de cliente que ela não atende.
      organizacaoId,
      OR: [
        { usuarioId: session.user?.id },
        { videomakerId: null }, // sistema
      ],
    },
    orderBy: { inicio: "asc" },
    take: 500,
  })

  const now = formatDate(new Date())
  const prodId = "-//NuFlow//NuFlow Agenda//PT"

  const veventos = eventos.map((ev) => {
    const dtStart = ev.diaTodo ? dataIcal(ev.inicio) : formatDate(ev.inicio)
    // No padrão iCal, o DTEND de evento de dia inteiro é EXCLUSIVO: precisa
    // apontar para o dia seguinte ao último. Com início e fim no mesmo dia o
    // evento tinha duração zero, e parte dos calendários simplesmente não o
    // exibia.
    const dtEnd = ev.diaTodo
      ? somarDias(dataEmSaoPaulo(ev.fim), 1).replace(/-/g, "")
      : formatDate(ev.fim)

    const lines = [
      "BEGIN:VEVENT",
      `UID:${ev.id}@nuflow`,
      `DTSTAMP:${now}`,
      ev.diaTodo ? `DTSTART;VALUE=DATE:${dtStart}` : `DTSTART:${dtStart}`,
      ev.diaTodo ? `DTEND;VALUE=DATE:${dtEnd}` : `DTEND:${dtEnd}`,
      `SUMMARY:${escapeIcal(ev.titulo)}`,
    ]

    if (ev.descricao) lines.push(`DESCRIPTION:${escapeIcal(ev.descricao)}`)
    if (ev.local) lines.push(`LOCATION:${escapeIcal(ev.local)}`)

    lines.push("END:VEVENT")
    return lines.join("\r\n")
  })

  const ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prodId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:NuFlow Agenda",
    "X-WR-TIMEZONE:America/Sao_Paulo",
    ...veventos,
    "END:VCALENDAR",
  ].join("\r\n")

  return new NextResponse(ical, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="nuflow-agenda.ics"',
      "Cache-Control": "no-cache",
    },
  })
}

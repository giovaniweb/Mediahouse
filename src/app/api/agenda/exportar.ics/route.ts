import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

function formatDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
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

  const eventos = await prisma.evento.findMany({
    where: {
      OR: [
        { usuarioId: session.user?.id },
        { videomakerId: null }, // sistema
      ],
    },
    orderBy: { inicio: "asc" },
    take: 500,
  })

  const now = formatDate(new Date())
  const prodId = "-//VideoOps//VideoOps Agenda//PT"

  const veventos = eventos.map((ev) => {
    const dtStart = ev.diaTodo
      ? ev.inicio.toISOString().split("T")[0].replace(/-/g, "")
      : formatDate(ev.inicio)
    const dtEnd = ev.diaTodo
      ? ev.fim.toISOString().split("T")[0].replace(/-/g, "")
      : formatDate(ev.fim)

    const lines = [
      "BEGIN:VEVENT",
      `UID:${ev.id}@videoops`,
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
    "X-WR-CALNAME:VideoOps Agenda",
    "X-WR-TIMEZONE:America/Sao_Paulo",
    ...veventos,
    "END:VCALENDAR",
  ].join("\r\n")

  return new NextResponse(ical, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="videoops-agenda.ics"',
      "Cache-Control": "no-cache",
    },
  })
}

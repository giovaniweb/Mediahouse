import { NextRequest, NextResponse } from "next/server"
import { getWhatsappConfig } from "@/lib/whatsapp"

// Endpoint temporário para resolver @lid manualmente
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("s")
  if (secret !== "nfdbg2026") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const lid = req.nextUrl.searchParams.get("lid")
  if (!lid) return NextResponse.json({ error: "pass ?lid=xxx" })

  const config = await getWhatsappConfig()
  if (!config) return NextResponse.json({ error: "no config" })

  const results: Record<string, unknown> = { lid }

  // Tentar findContacts
  try {
    const remoteJid = `${lid}@lid`
    const res = await fetch(`${config.instanceUrl}/chat/findContacts/${config.instanceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      body: JSON.stringify({ where: { id: remoteJid } }),
      signal: AbortSignal.timeout(5000),
    })
    results.findContacts = { status: res.status, data: res.ok ? await res.json() : await res.text() }
  } catch (e) {
    results.findContacts = { error: String(e) }
  }

  // Tentar findMessages
  try {
    const remoteJid = `${lid}@lid`
    const res = await fetch(`${config.instanceUrl}/chat/findMessages/${config.instanceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      body: JSON.stringify({ where: { key: { remoteJid } } }),
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const msgs = await res.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      results.findMessages = { count: Array.isArray(msgs) ? msgs.length : 0, messages: (Array.isArray(msgs) ? msgs.slice(0, 5) : []).map((m: any) => ({
        key: m.key,
        pushName: m.pushName,
        participant: m.participant,
      })) }
    } else {
      results.findMessages = { status: res.status, data: await res.text() }
    }
  } catch (e) {
    results.findMessages = { error: String(e) }
  }

  // Tentar buscar pelo chat list
  try {
    const res = await fetch(`${config.instanceUrl}/chat/findChats/${config.instanceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const chats = await res.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = Array.isArray(chats) ? chats.find((c: any) => c.id?.includes(lid) || c.remoteJid?.includes(lid)) : null
      results.chatMatch = match ?? "not found in chats"
    }
  } catch (e) {
    results.chatSearch = { error: String(e) }
  }

  return NextResponse.json(results)
}

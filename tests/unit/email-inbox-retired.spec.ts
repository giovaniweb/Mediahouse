import { describe, expect, it } from "vitest"
import { GET as cron } from "@/app/api/cron/email-inbox/route"
import { GET as callback } from "@/app/api/email-inbox/callback/route"
import { GET as connect } from "@/app/api/email-inbox/connect/route"
import { GET as messages } from "@/app/api/email-inbox/messages/route"
import { PATCH as updateMessage } from "@/app/api/email-inbox/messages/[id]/route"
import { POST as sync } from "@/app/api/email-inbox/sync/route"
import { GET as config, POST as saveConfig, DELETE as disconnect } from "@/app/api/email-inbox/config/route"

describe("caixa de entrada retirada", () => {
  for (const [name, handler] of Object.entries({ cron, callback, connect, messages, updateMessage, sync, config, saveConfig, disconnect })) {
    it(`${name} não importa e-mails nem cria demandas`, async () => {
      const response = handler()
      expect(response.status).toBe(410)
      expect(await response.json()).toEqual({ error: "A caixa de entrada de e-mails foi desativada." })
    })
  }
})

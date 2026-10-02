import { vi } from "vitest"

// Integração com banco real; serviços externos nunca são chamados nesta suíte.
vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Chamadas externas bloqueadas na integração sintética") }))

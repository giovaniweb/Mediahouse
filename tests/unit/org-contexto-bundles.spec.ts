import { expect, it, vi } from "vitest"

it("bundles distintos compartilham contexto explícito sem misturar requisições", async () => {
  const primeiro = await import("@/lib/org-contexto")
  vi.resetModules()
  const segundo = await import("@/lib/org-contexto")
  expect(primeiro).not.toBe(segundo)
  const resultados = await Promise.all(["empresa-a", "empresa-b", null].map(org =>
    primeiro.comOrg(org, async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      expect(segundo.temContextoDeclarado()).toBe(true)
      expect(await segundo.orgAtual()).toBe(org)
      return segundo.comOrg("interna", async () => {
        expect(await primeiro.orgAtual()).toBe("interna")
        return org
      })
    })
  ))
  expect(resultados).toEqual(["empresa-a", "empresa-b", null])
  expect(primeiro.temContextoDeclarado()).toBe(false)
  expect(segundo.temContextoDeclarado()).toBe(false)
})

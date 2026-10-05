import { describe, it, expect } from "vitest"
import { desvioDoSubdominio, linksDaArea, slugDoHost } from "@/lib/subdominio"

const raiz = "nuflow.space"
const pedido = (host: string, caminho: string, busca = "") => ({ host, caminho, busca, protocolo: "https:" })
const desligado = { raiz, ligado: false }
const ligado = { raiz, ligado: true }

describe("slug do host", () => {
  it("lê <slug>.<raiz>, com ou sem porta", () => {
    expect(slugDoHost("contourline.nuflow.space", raiz)).toBe("contourline")
    expect(slugDoHost("Contourline.NuFlow.space:443", raiz)).toBe("contourline")
    expect(slugDoHost("contourline.localhost:3457", "localhost")).toBe("contourline")
  })
  it("não confunde o domínio principal, reservados, dois níveis nem outro domínio", () => {
    for (const host of ["nuflow.space", "www.nuflow.space", "api.nuflow.space", "admin.nuflow.space",
      "a.b.nuflow.space", "contourline.vercel.app", "nuflow.space.evil.com", "-x.nuflow.space", ""]) {
      expect(slugDoHost(host, raiz), host).toBeNull()
    }
  })
})

describe("subdomínio da empresa", () => {
  it("reescreve a área para /c/<slug>", () => {
    expect(desvioDoSubdominio(pedido("contourline.nuflow.space", "/"), desligado)).toEqual({ tipo: "reescrever", caminho: "/c/contourline" })
    expect(desvioDoSubdominio(pedido("contourline.nuflow.space", "/pedido", "?tipo=video"), desligado)).toEqual({ tipo: "reescrever", caminho: "/c/contourline/pedido" })
  })
  it("não mexe em API, arquivos do Next nem estáticos", () => {
    for (const caminho of ["/api/publico/empresa", "/api", "/_next/data/x.json", "/logo.png", "/manifest.json"]) {
      expect(desvioDoSubdominio(pedido("contourline.nuflow.space", caminho), desligado), caminho).toBeNull()
    }
  })
  it("login e painel vão para o domínio principal, onde mora a sessão", () => {
    expect(desvioDoSubdominio(pedido("contourline.nuflow.space", "/entrar", "?x=1"), desligado))
      .toEqual({ tipo: "redirecionar", url: "https://nuflow.space/c/contourline/entrar?x=1", status: 307 })
    expect(desvioDoSubdominio({ host: "contourline.localhost:3457", caminho: "/painel", busca: "", protocolo: "http:" }, { raiz: "localhost", ligado: false }))
      .toEqual({ tipo: "redirecionar", url: "http://localhost:3457/c/contourline/painel", status: 307 })
  })
  it("login com o prefixo velho vai direto ao principal, sem passar pelo subdomínio", () => {
    expect(desvioDoSubdominio(pedido("contourline.nuflow.space", "/c/contourline/entrar"), desligado))
      .toEqual({ tipo: "redirecionar", url: "https://nuflow.space/c/contourline/entrar", status: 307 })
  })
  it("link velho com /c/<slug> dentro do subdomínio perde o prefixo", () => {
    expect(desvioDoSubdominio(pedido("contourline.nuflow.space", "/c/contourline/galeria"), desligado))
      .toEqual({ tipo: "redirecionar", url: "https://contourline.nuflow.space/galeria", status: 308 })
  })
})

describe("domínio principal", () => {
  it("chave desligada: /c/<slug> fica onde está", () => {
    expect(desvioDoSubdominio(pedido("nuflow.space", "/c/contourline/pedido"), desligado)).toBeNull()
  })
  it("chave ligada: 301 para o subdomínio, com a busca", () => {
    expect(desvioDoSubdominio(pedido("nuflow.space", "/c/contourline"), ligado))
      .toEqual({ tipo: "redirecionar", url: "https://contourline.nuflow.space/", status: 301 })
    expect(desvioDoSubdominio(pedido("www.nuflow.space", "/c/contourline/pedido", "?tipo=video"), ligado))
      .toEqual({ tipo: "redirecionar", url: "https://contourline.nuflow.space/pedido?tipo=video", status: 301 })
  })
  it("chave ligada: login e painel ficam, e o resto do site não é tocado", () => {
    expect(desvioDoSubdominio(pedido("nuflow.space", "/c/contourline/entrar"), ligado)).toBeNull()
    expect(desvioDoSubdominio(pedido("nuflow.space", "/c/contourline/painel"), ligado)).toBeNull()
    expect(desvioDoSubdominio(pedido("nuflow.space", "/dashboard"), ligado)).toBeNull()
    expect(desvioDoSubdominio(pedido("nuflow.space", "/c/www/pedido"), ligado)).toBeNull()
  })
  it("preview da Vercel não redireciona", () => {
    expect(desvioDoSubdominio(pedido("videoops-git-x.vercel.app", "/c/contourline"), ligado)).toBeNull()
  })
})

describe("links da área", () => {
  it("no subdomínio: caminhos curtos e login no principal", () => {
    expect(linksDaArea("contourline", "contourline.nuflow.space", "https:", desligado))
      .toEqual({ base: "", inicio: "/", entrar: "https://nuflow.space/c/contourline/entrar", noSubdominio: true })
  })
  it("no endereço antigo: /c/<slug>", () => {
    expect(linksDaArea("contourline", "nuflow.space", "https:", desligado))
      .toEqual({ base: "/c/contourline", inicio: "/c/contourline", entrar: "/c/contourline/entrar", noSubdominio: false })
  })
  it("chave ligada: o 'voltar' do login já leva ao endereço novo", () => {
    expect(linksDaArea("contourline", "nuflow.space", "https:", ligado).inicio).toBe("https://contourline.nuflow.space/")
    expect(linksDaArea("contourline", "videoops-git-x.vercel.app", "https:", ligado).inicio).toBe("/c/contourline")
  })
  it("subdomínio de outra empresa não vale como este", () => {
    expect(linksDaArea("contourline", "outra.nuflow.space", "https:", desligado).base).toBe("/c/contourline")
  })
})

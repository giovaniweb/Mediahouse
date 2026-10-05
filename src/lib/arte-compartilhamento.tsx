// A arte que aparece quando alguém compartilha um link do NuFlow (WhatsApp,
// Instagram, LinkedIn, iMessage): 1200x630, o tamanho que eles mostram grande.
//
// Duas versões no mesmo desenho: a do NuFlow (nuflow.space) e a da área de cada
// empresa (/c/<slug>), com o nome da empresa em destaque e o NuFlow assinando
// embaixo. Montada com next/og a partir das fontes locais — nada de Google Fonts.
import { ImageResponse } from "next/og"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { CAIXA, FUNDO, LILAS, LILAS_CLARO, ONDA, PONTO, TRACO } from "@/components/marca/simbolo"

export const TAMANHO_ARTE = { width: 1200, height: 630 }

const TEXTO = "#f3f2f9", SUAVE = "#a7a9be", APAGADO = "#7e8098"

async function fontes() {
  const dir = join(process.cwd(), "public/fonts/montserrat")
  const [m500, m700] = await Promise.all([readFile(join(dir, "montserrat-500.ttf")), readFile(join(dir, "montserrat-700.ttf"))])
  return [
    { name: "Montserrat", data: m500, weight: 500 as const, style: "normal" as const },
    { name: "Montserrat", data: m700, weight: 700 as const, style: "normal" as const },
  ]
}

function Simbolo({ tamanho, opacidade = 1 }: { tamanho: number; opacidade?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox={CAIXA} style={{ opacity: opacidade }}>
      <path d={ONDA} fill="none" stroke={LILAS} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={PONTO.cx} cy={PONTO.cy} r={PONTO.r} fill={LILAS} />
    </svg>
  )
}

function Logo({ tamanho }: { tamanho: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: tamanho * 0.38, fontSize: tamanho, fontWeight: 700, letterSpacing: -tamanho * 0.03, color: TEXTO }}>
      <Simbolo tamanho={tamanho * 1.3} />
      <div style={{ display: "flex" }}>NuFlow<span style={{ color: LILAS_CLARO }}>.</span></div>
    </div>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative",
      padding: "64px 72px", fontFamily: "Montserrat", color: TEXTO, backgroundColor: FUNDO,
      backgroundImage: "radial-gradient(circle at 88% 0%, #6d4fd655 0%, transparent 52%), radial-gradient(circle at 0% 100%, #3b5bdb33 0%, transparent 50%)",
    }}>
      {/* A onda grande ao fundo, saindo pela borda direita. */}
      <div style={{ position: "absolute", right: -16, top: 120, display: "flex" }}><Simbolo tamanho={500} opacidade={0.12} /></div>
      {children}
    </div>
  )
}

const ETAPAS = ["Pedido", "Produção", "Aprovação", "Entrega"]

function Etapas() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {ETAPAS.map((etapa, i) => (
        <div key={etapa} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            display: "flex", padding: "10px 18px", borderRadius: 12, fontSize: 22, fontWeight: 500,
            border: `1.5px solid ${i === ETAPAS.length - 1 ? LILAS : "#343a50"}`,
            backgroundColor: i === ETAPAS.length - 1 ? "#8b5cf622" : "#ffffff06",
            color: i === ETAPAS.length - 1 ? LILAS_CLARO : "#ccc8df",
          }}>{etapa}</div>
          {i < ETAPAS.length - 1 && <div style={{ display: "flex", width: 22, height: 2, backgroundColor: "#4a4f68" }} />}
        </div>
      ))}
    </div>
  )
}

function iniciais(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("")
}

/** A arte do NuFlow ou, com `empresa`, a da área pública daquela empresa. */
export async function arteCompartilhamento(empresa?: { nome: string; slug: string } | null) {
  const conteudo = empresa ? (
    <Moldura>
      <div style={{ display: "flex", fontSize: 22, fontWeight: 700, letterSpacing: 4, color: LILAS_CLARO }}>ÁREA DA EMPRESA</div>
      <div style={{ display: "flex", alignItems: "center", gap: 32, marginTop: 30 }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, width: 112, height: 112,
          borderRadius: 28, backgroundColor: "#2a2541", border: "1.5px solid #4b3f78", fontSize: 42, fontWeight: 700, color: LILAS_CLARO,
        }}>{iniciais(empresa.nome)}</div>
        <div style={{ display: "flex", maxWidth: 860, fontSize: empresa.nome.length > 24 ? 54 : 72, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>{empresa.nome}</div>
      </div>
      <div style={{ display: "flex", marginTop: 36, maxWidth: 820, fontSize: 30, fontWeight: 500, lineHeight: 1.45, color: SUAVE }}>
        Peça vídeos e artes, agende gravações e acompanhe seus pedidos.
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 24, fontWeight: 500, color: APAGADO }}>via <Logo tamanho={34} /></div>
        <div style={{ display: "flex", fontSize: 22, fontWeight: 500, color: APAGADO }}>{`nuflow.space/c/${empresa.slug}`}</div>
      </div>
    </Moldura>
  ) : (
    <Moldura>
      <Logo tamanho={42} />
      <div style={{ display: "flex", flexDirection: "column", marginTop: 54, fontSize: 70, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2.4 }}>
        <div style={{ display: "flex" }}>Pedidos, agenda e aprovações</div>
        <div style={{ display: "flex", color: LILAS_CLARO }}>num só lugar.</div>
      </div>
      <div style={{ display: "flex", marginTop: 28, maxWidth: 820, fontSize: 30, fontWeight: 500, lineHeight: 1.45, color: SUAVE }}>
        Do pedido à entrega, com aviso no WhatsApp na hora certa.
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
        <Etapas />
        <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: APAGADO }}>nuflow.space</div>
      </div>
    </Moldura>
  )
  return new ImageResponse(conteudo, { ...TAMANHO_ARTE, fonts: await fontes() })
}

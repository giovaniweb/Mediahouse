// Desenha a arte do aviso: a cena (public/avisos/cenas) com a frase por cima,
// na fonte da marca. Sai um PNG quadrado em base64, pronto para a Evolution
// mandar como imagem com legenda.
//
// Separado de lib/avisos-arte.ts (puro) porque carrega next/og e lê arquivos.
// A fila importa este módulo só na hora de mandar, e só com as artes ligadas.
import { ImageResponse } from "next/og"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { escolherArte, type FamiliaArte } from "@/lib/avisos-arte"

export const LADO_ARTE = 600

async function fonte() {
  return readFile(join(process.cwd(), "public/fonts/montserrat/montserrat-700.ttf"))
}

async function cena(arquivo: string) {
  // O nome vem de escolherArte (NN-K.jpg), nunca de fora; o teste confere que
  // todo arquivo que ela pode devolver existe.
  if (!/^\d{2}-\d\.jpg$/.test(arquivo)) throw new Error("Cena inválida")
  const dados = await readFile(join(process.cwd(), "public/avisos/cenas", arquivo))
  return `data:image/jpeg;base64,${dados.toString("base64")}`
}

/**
 * O carimbo da cobrança a quem pediu (VideoSPC, ArteSERASA…), no canto de baixo
 * da cena, onde o galo deixa espaço. Paródia: o roxo e o traço preto são da
 * turma do NuFlow; nada de logo, cor ou letra das marcas de verdade.
 */
function Carimbo({ titulo, linha }: { titulo: string; linha: string }) {
  const roxo = "#7c3aed"
  return (
    <div style={{
      position: "absolute", left: 22, bottom: 34, display: "flex", flexDirection: "column", alignItems: "center",
      padding: "10px 18px 8px", background: "rgba(255,255,255,0.94)", border: `6px solid ${roxo}`, borderRadius: 16,
      boxShadow: "6px 6px 0 #111", transform: "rotate(-8deg)", fontFamily: "Montserrat", fontWeight: 700,
    }}>
      <div style={{ display: "flex", fontSize: titulo.length > 9 ? 40 : 46, color: roxo, letterSpacing: -1, lineHeight: 1 }}>{titulo}</div>
      <div style={{ display: "flex", marginTop: 6, fontSize: 17, color: "#111", textTransform: "uppercase", letterSpacing: 0.5 }}>{linha}</div>
      <div style={{ display: "flex", marginTop: 4, fontSize: 13, color: "#555" }}>(é brincadeira da turma do NuFlow)</div>
    </div>
  )
}

/** PNG da arte (base64 sem prefixo) para a família, sorteado pela semente. */
export async function imagemDoAviso(familia: FamiliaArte, semente: string) {
  const e = escolherArte(familia, semente)
  const [fundo, montserrat] = await Promise.all([cena(e.arquivo), fonte()])
  const tamanho = e.frase.length > 38 ? 38 : e.frase.length > 26 ? 44 : 50
  const resposta = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fundo} width={LADO_ARTE} height={LADO_ARTE} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
        <div style={{
          position: "absolute", top: 28, left: 32, right: 32, display: "flex", justifyContent: "center",
          textAlign: "center", fontFamily: "Montserrat", fontWeight: 700, fontSize: tamanho, lineHeight: 1.1,
          letterSpacing: -0.5, color: "#ffffff",
          // Contorno preto em volta da letra, no traço grosso das ilustrações.
          textShadow: "3px 3px 0 #111, -3px 3px 0 #111, 3px -3px 0 #111, -3px -3px 0 #111, 0 3px 0 #111, 0 -3px 0 #111, 3px 0 0 #111, -3px 0 0 #111, 0 6px 0 #111",
        }}>{e.frase}</div>
        {e.selo && <Carimbo titulo={e.selo.titulo} linha={e.selo.linha} />}
      </div>
    ),
    { width: LADO_ARTE, height: LADO_ARTE, fonts: [{ name: "Montserrat", data: montserrat, weight: 700, style: "normal" }] },
  )
  const png = Buffer.from(await resposta.arrayBuffer())
  if (!png.length) throw new Error("Arte vazia")
  return { base64: png.toString("base64"), mimetype: "image/png" as const, nomeArquivo: `nuflow-${familia}.png`, escolha: e }
}

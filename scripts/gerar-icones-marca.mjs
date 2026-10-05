// Gera os ícones de public/ a partir do símbolo em src/components/marca/simbolo.ts.
//
//   node --experimental-strip-types scripts/gerar-icones-marca.mjs
//
// Favicon (aba do navegador): o símbolo solto, com o traço mais grosso para não
// sumir em 16px. Ícones de app (iPhone, Android, logo.png): o símbolo sobre o
// fundo escuro do NuFlow, com folga para o recorte redondo de cada sistema.
import sharp from "sharp"
import { writeFile } from "node:fs/promises"
import { FUNDO, simboloSvg } from "../src/components/marca/simbolo.ts"

const pub = (nome) => new URL(`../public/${nome}`, import.meta.url)

async function favicon(tamanho) {
  return sharp(Buffer.from(simboloSvg({ tamanho, traco: tamanho <= 32 ? 7 : 6 }))).png().toBuffer()
}

async function icone(tamanho, nome) {
  const s = Math.round(tamanho * 0.66)
  const simbolo = await sharp(Buffer.from(simboloSvg({ tamanho: s }))).png().toBuffer()
  await sharp({ create: { width: tamanho, height: tamanho, channels: 4, background: FUNDO } })
    .composite([{ input: simbolo, top: Math.round((tamanho - s) / 2), left: Math.round((tamanho - s) / 2) }])
    .png().toFile(pub(nome).pathname)
}

/** .ico com PNGs dentro: todo navegador atual lê, e evita o BMP antigo. */
function ico(pngs) {
  const cab = Buffer.alloc(6 + 16 * pngs.length)
  cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(pngs.length, 4)
  let pos = cab.length
  pngs.forEach(({ tamanho, dados }, i) => {
    const o = 6 + 16 * i
    cab.writeUInt8(tamanho % 256, o); cab.writeUInt8(tamanho % 256, o + 1)
    cab.writeUInt16LE(1, o + 4); cab.writeUInt16LE(32, o + 6)
    cab.writeUInt32LE(dados.length, o + 8); cab.writeUInt32LE(pos, o + 12)
    pos += dados.length
  })
  return Buffer.concat([cab, ...pngs.map(p => p.dados)])
}

await writeFile(pub("icon.svg"), simboloSvg({ tamanho: 64, traco: 6 }) + "\n")
const f16 = await favicon(16), f32 = await favicon(32), f48 = await favicon(48)
await writeFile(pub("favicon-16.png"), f16)
await writeFile(pub("favicon-32.png"), f32)
await writeFile(pub("favicon.ico"), ico([{ tamanho: 16, dados: f16 }, { tamanho: 32, dados: f32 }, { tamanho: 48, dados: f48 }]))
await icone(180, "apple-touch-icon.png")
await icone(192, "icon-192.png")
await icone(512, "icon-512.png")
await icone(512, "logo.png")
console.log("Ícones gerados em public/.")

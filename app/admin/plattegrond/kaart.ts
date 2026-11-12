// Kaartondergrond van PDOK (open data van de Nederlandse overheid): de
// luchtfoto en de Basisregistratie Grootschalige Topografie (BGT), de kaart
// waar gemeentes zelf mee werken. Beide in Rijksdriehoekscoördinaten, dus in
// meters: de ondergrond staat vanzelf op schaal en noord is boven.
import type { Kaart, Pt } from './types'

const X0 = -285401.92, Y0 = 903401.92, RES0 = 3440.64 // standaard RD-tegelschema
const BRON = {
  luchtfoto: { url: (z: number, c: number, r: number) => `https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:28992/${z}/${c}/${r}.jpeg`, max: 17 },
  kaart: { url: (z: number, c: number, r: number) => `https://service.pdok.nl/kadaster/bgt/wmts/v1_0/achtergrondvisualisatie/EPSG:28992/${z}/${c}/${r}.png`, max: 16 },
}
export type Tegel = { href: string; x: number; y: number; s: number }

// Tegels die het gebied (tekencoördinaten, meters) bedekken, op een zoomniveau
// dat past bij pxPerM. Nooit meer dan maxTegels: dan een niveau grover.
export function kaartTegels(k: Kaart, g: { x1: number; y1: number; x2: number; y2: number }, pxPerM: number, maxTegels = 80): Tegel[] {
  const bron = BRON[k.type]
  let z = Math.min(bron.max, Math.max(3, Math.ceil(Math.log2(RES0 * pxPerM))))
  for (; z >= 3; z--) {
    const T = (RES0 / 2 ** z) * 256
    const c1 = Math.floor((g.x1 + k.rd[0] - X0) / T), c2 = Math.floor((g.x2 + k.rd[0] - X0) / T)
    const r1 = Math.floor((Y0 - (k.rd[1] - g.y1)) / T), r2 = Math.floor((Y0 - (k.rd[1] - g.y2)) / T)
    if ((c2 - c1 + 1) * (r2 - r1 + 1) > maxTegels) continue
    const uit: Tegel[] = []
    for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) {
      if (c < 0 || r < 0) continue
      uit.push({ href: bron.url(z, c, r), x: X0 + c * T - k.rd[0], y: k.rd[1] - (Y0 - r * T), s: T })
    }
    return uit
  }
  return []
}

export type Adres = { naam: string; rd: Pt; soort: string }
export async function zoekAdres(q: string): Promise<Adres[]> {
  const res = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=6&fl=weergavenaam,centroide_rd,type&q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error('Adres zoeken lukt nu niet')
  const j = await res.json()
  return (j.response?.docs || []).map((d: { weergavenaam: string; centroide_rd: string; type: string }) => {
    const m = /POINT\(([\d.]+) ([\d.]+)\)/.exec(d.centroide_rd || '')
    return m ? { naam: d.weergavenaam, rd: [parseFloat(m[1]), parseFloat(m[2])] as Pt, soort: d.type } : null
  }).filter(Boolean) as Adres[]
}

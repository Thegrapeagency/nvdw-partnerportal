// Tekenblad: zet de tekening op een vel (A4 t/m A0) op een echte schaal, met
// rechts de legenda, noordpijl, schaalbalk en titelblok. Zo levert een
// technisch tekenaar een situatietekening aan bij gemeente en leveranciers.
import type { Meta } from './types'
import type { Materiaal } from './materialen'
import { isLijn } from './materialen'

export const PAPIER: Record<string, [number, number]> = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] }
export const SCHALEN = [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000, 10000]
const KOLOM: Record<string, number> = { A4: 62, A3: 80, A2: 96, A1: 112, A0: 128 }
export const DPI: Record<string, number> = { A4: 250, A3: 220, A2: 170, A1: 130, A0: 100 }

export type Gebied = { x1: number; y1: number; x2: number; y2: number }
export type LegendaData = {
  vlakken: { kleur: string; label: string; aantal: number }[]
  symbolen: { mat: Materiaal; stuks: number; meter: number }[]
  nummers: { nr: number; naam: string }[]
}
export type BladInvoer = {
  inhoud: (g: Gebied, pxPerM: number) => Promise<string>
  bbox: Gebied
  papier: string; schaal: number | 'auto'; titel: string
  meta: Meta; merk: string; noordHoek: number; bron: string
  legenda: LegendaData
}
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const kort = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s

export function kiesSchaal(bbox: Gebied, papier: string) {
  const [W, H] = PAPIER[papier], K = KOLOM[papier]
  const aw = W - 16 - K - 4, ah = H - 16
  const bw = (bbox.x2 - bbox.x1) * 1.08, bh = (bbox.y2 - bbox.y1) * 1.08
  return SCHALEN.find(n => bw * 1000 / n <= aw && bh * 1000 / n <= ah) || 10000
}

export async function maakBlad(inv: BladInvoer) {
  const [W, H] = PAPIER[inv.papier], K = KOLOM[inv.papier], M = 8
  const ax = M, ay = M, aw = W - 2 * M - K - 4, ah = H - 2 * M
  const N = inv.schaal === 'auto' ? kiesSchaal(inv.bbox, inv.papier) : inv.schaal
  const vw = aw * N / 1000, vh = ah * N / 1000
  const cx = (inv.bbox.x1 + inv.bbox.x2) / 2, cy = (inv.bbox.y1 + inv.bbox.y2) / 2
  const g: Gebied = { x1: cx - vw / 2, y1: cy - vh / 2, x2: cx + vw / 2, y2: cy + vh / 2 }
  const dpi = DPI[inv.papier]
  const inhoud = await inv.inhoud(g, (1000 / N) * (dpi / 25.4))

  // ---- kolom rechts ----
  const kx = W - M - K, f0 = K / 27
  const m = inv.meta
  const datumNl = (d?: string) => { if (!d) return ''; const t = new Date(d); return isNaN(+t) ? d : t.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) }
  const regels: [string, string][] = [
    ['Locatie', m.locatie || ''], ['Datum evenement', datumNl(m.datum)], ['Organisator', m.organisator || inv.merk],
    ['Bezoekers tegelijk', m.bezoekers ? m.bezoekers.toLocaleString('nl-NL') : ''],
    ['Tekening', inv.titel], ['Schaal', `1:${N}`], ['Formaat', `${inv.papier} liggend`], ['Versie', m.versie || '1'],
    ['Datum tekening', new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })], ['Getekend door', m.tekenaar || ''],
  ].filter(r => r[1]) as [string, string][]
  const tr = f0 * 1.75, titelH = f0 * 5.2 + regels.length * tr + f0
  const ty = H - M - titelH
  let t = `<rect x="${kx}" y="${ty}" width="${K}" height="${titelH}" fill="#fff" stroke="#111" stroke-width="0.35"/>`
  t += `<text x="${kx + f0}" y="${ty + f0 * 2.3}" font-size="${f0 * 1.55}" font-weight="700">${esc(kort(m.evenement || inv.merk, 30))}</text>`
  t += `<text x="${kx + f0}" y="${ty + f0 * 4}" font-size="${f0 * 0.95}" fill="#555">${esc(inv.titel)}</text>`
  let yy = ty + f0 * 5.2
  for (const [l, v] of regels) {
    t += `<line x1="${kx}" x2="${kx + K}" y1="${yy}" y2="${yy}" stroke="#111" stroke-width="0.15"/>`
    t += `<text x="${kx + f0}" y="${yy + tr * 0.68}" font-size="${f0 * 0.78}" fill="#555">${esc(l)}</text>`
    t += `<text x="${kx + K * 0.42}" y="${yy + tr * 0.68}" font-size="${f0 * 0.9}" font-weight="600">${esc(kort(v, 30))}</text>`
    yy += tr
  }
  // noordpijl + schaalbalk
  const nh = f0 * 9, ny = ty - nh - 3
  const ncx = kx + f0 * 4.2, ncy = ny + nh / 2, nr = f0 * 3
  t += `<rect x="${kx}" y="${ny}" width="${K}" height="${nh}" fill="#fff" stroke="#111" stroke-width="0.35"/>`
  t += `<g transform="rotate(${inv.noordHoek} ${ncx} ${ncy})"><circle cx="${ncx}" cy="${ncy}" r="${nr}" fill="none" stroke="#111" stroke-width="0.25"/><path d="M${ncx} ${ncy - nr * 1.15} L${ncx + nr * 0.45} ${ncy + nr * 0.6} L${ncx} ${ncy + nr * 0.25} Z" fill="#111"/><path d="M${ncx} ${ncy - nr * 1.15} L${ncx - nr * 0.45} ${ncy + nr * 0.6} L${ncx} ${ncy + nr * 0.25} Z" fill="#fff" stroke="#111" stroke-width="0.2"/><text x="${ncx}" y="${ncy - nr * 1.3}" font-size="${f0 * 1.1}" font-weight="700" text-anchor="middle">N</text></g>`
  // schaalbalk: rond aantal meters dat in ~45% van de kolom past
  const mmPerM = 1000 / N, doel = K * 0.45 / mmPerM
  const stap = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].filter(s => s <= doel).pop() || 1
  const sbx = kx + f0 * 9.5, sby = ncy - f0 * 0.2, sbw = stap * mmPerM
  for (let i = 0; i < 4; i++) t += `<rect x="${sbx + i * sbw / 4}" y="${sby}" width="${sbw / 4}" height="${f0 * 0.6}" fill="${i % 2 ? '#fff' : '#111'}" stroke="#111" stroke-width="0.15"/>`
  t += `<text x="${sbx}" y="${sby + f0 * 1.9}" font-size="${f0 * 0.8}" text-anchor="middle">0</text><text x="${sbx + sbw}" y="${sby + f0 * 1.9}" font-size="${f0 * 0.8}" text-anchor="middle">${stap} m</text>`
  t += `<text x="${sbx}" y="${sby - f0 * 0.9}" font-size="${f0 * 1.25}" font-weight="700">Schaal 1:${N}</text>`

  // legenda: past zich aan de beschikbare hoogte aan
  const L = inv.legenda
  const rijen = (L.vlakken.length ? L.vlakken.length + 1.3 : 0) + (L.symbolen.length ? L.symbolen.length + 1.3 : 0)
  const kolommen = L.nummers.length > 24 ? 2 : 1
  const nrRijen = L.nummers.length ? Math.ceil(L.nummers.length / kolommen) + 1.3 : 0
  const ruimte = ny - 3 - M
  const f = Math.min(f0, (ruimte - f0 * 3) / ((rijen + nrRijen) * 1.75))
  const rij = f * 1.75, pad = f0
  let l = `<rect x="${kx}" y="${M}" width="${K}" height="${ruimte}" fill="#fff" stroke="#111" stroke-width="0.35"/>`
  l += `<text x="${kx + pad}" y="${M + f0 * 2}" font-size="${f0 * 1.3}" font-weight="700">Legenda</text>`
  let y = M + f0 * 3
  const kop = (s: string) => { y += rij * 0.3; l += `<text x="${kx + pad}" y="${y + f * 0.8}" font-size="${f * 0.72}" font-weight="700" fill="#666" letter-spacing="${f * 0.05}">${esc(s.toUpperCase())}</text>`; y += rij }
  const rechts = (s: string) => `<text x="${kx + K - pad}" y="${y + f * 0.85}" font-size="${f * 0.85}" fill="#555" text-anchor="end">${esc(s)}</text>`
  if (L.vlakken.length) {
    kop('Deelnemers')
    for (const v of L.vlakken) { l += `<rect x="${kx + pad}" y="${y}" width="${f * 1.5}" height="${f * 1.1}" fill="${v.kleur}"/><text x="${kx + pad + f * 2.2}" y="${y + f * 0.85}" font-size="${f * 0.95}">${esc(v.label)}</text>${rechts(v.aantal + '×')}`; y += rij }
  }
  if (L.symbolen.length) {
    kop('Voorzieningen en materiaal')
    for (const s of L.symbolen) {
      const mt = s.mat
      if (mt.soort === 'route') l += `<rect x="${kx + pad}" y="${y + f * 0.1}" width="${f * 1.5}" height="${f * 0.9}" fill="${mt.kleur}" fill-opacity="0.25"/><line x1="${kx + pad}" x2="${kx + pad + f * 1.5}" y1="${y + f * 0.55}" y2="${y + f * 0.55}" stroke="${mt.kleur}" stroke-width="${f * 0.12}" stroke-dasharray="${f * 0.3} ${f * 0.2}"/>`
      else if (isLijn(mt)) l += `<line x1="${kx + pad}" x2="${kx + pad + f * 1.5}" y1="${y + f * 0.55}" y2="${y + f * 0.55}" stroke="${mt.kleur}" stroke-width="${f * 0.3}"/>`
      else l += `<rect x="${kx + pad}" y="${y - f * 0.15}" width="${f * 1.5}" height="${f * 1.4}" rx="${f * 0.15}" fill="${mt.kleur}" fill-opacity="0.14" stroke="${mt.kleur}" stroke-width="${f * 0.06}"/><g transform="translate(${kx + pad + f * 0.15} ${y - f * 0.05}) scale(${f * 1.2 / 24})" fill="none" stroke="${mt.kleur}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="color:${mt.kleur}">${mt.icoon}</g>`
      l += `<text x="${kx + pad + f * 2.2}" y="${y + f * 0.85}" font-size="${f * 0.95}">${esc(kort(mt.label, 30))}</text>${rechts((s.stuks ? s.stuks + '×' : '') + (s.meter ? (s.stuks ? ' · ' : '') + Math.round(s.meter) + ' m' : ''))}`
      y += rij
    }
  }
  if (L.nummers.length) {
    kop('Nummers')
    const per = Math.ceil(L.nummers.length / kolommen), kw = (K - 2 * pad) / kolommen, y0 = y
    L.nummers.forEach((q, i) => {
      const x0 = kx + pad + Math.floor(i / per) * kw, yq = y0 + (i % per) * rij
      l += `<circle cx="${x0 + f * 0.7}" cy="${yq + f * 0.5}" r="${f * 0.68}" fill="#111"/><text x="${x0 + f * 0.7}" y="${yq + f * 0.78}" font-size="${f * 0.72}" fill="#fff" text-anchor="middle" font-weight="700">${q.nr}</text><text x="${x0 + f * 2}" y="${yq + f * 0.85}" font-size="${f * 0.9}">${esc(kort(q.naam, kolommen === 2 ? 17 : 34))}</text>`
    })
  }
  if (inv.bron) l += `<text x="${kx + pad}" y="${ny - 3 - f0 * 0.7}" font-size="${f0 * 0.62}" fill="#888">${esc(inv.bron)}</text>`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif" fill="#111">`
    + `<rect width="${W}" height="${H}" fill="#fff"/>`
    + `<svg x="${ax}" y="${ay}" width="${aw}" height="${ah}" viewBox="${g.x1} ${g.y1} ${vw} ${vh}" preserveAspectRatio="xMidYMid slice">${inhoud}</svg>`
    + `<rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" fill="none" stroke="#111" stroke-width="0.35"/>`
    + l + t + `</svg>`
  return { svg, W, H, N, dpi }
}

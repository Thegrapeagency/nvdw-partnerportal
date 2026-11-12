// Meetkunde voor de plattegrond-tekenaar. Alles in meters.
import type { Kind, Obj, Pt } from './types'
import { MATERIAAL } from './materialen'

export const r2 = (v: number) => Math.round(v * 100) / 100
export const fmt = (v: number) => r2(v).toLocaleString('nl-NL', { maximumFractionDigits: 2 }) + ' m'
export const isBlok = (k: Kind) => k === 'rect' || k === 'ellipse' || k === 'partner' || k === 'materiaal' || k === 'text' || k === 'legenda' || k === 'voorziening'
export const hoeken = (o: Obj): Pt[] => {
  if (o.pts) return o.pts
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2, a = (o.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return ([[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]] as Pt[]).map(([x, y]) => {
    const dx = x - cx, dy = y - cy
    return [cx + dx * c - dy * s, cy + dx * s + dy * c] as Pt
  })
}
export const bbox = (pts: Pt[]) => {
  if (!pts.length) return { x1: 0, y1: 0, x2: 0, y2: 0 }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const [x, y] of pts) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y }
  return { x1, y1, x2, y2 }
}
// Separating Axis Theorem voor twee convexe veelhoeken
export const overlapt = (a: Pt[], b: Pt[]) => {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i], p2 = poly[(i + 1) % poly.length]
    const nx = p2[1] - p1[1], ny = p1[0] - p2[0]
    const pa = a.map(p => p[0] * nx + p[1] * ny), pb = b.map(p => p[0] * nx + p[1] * ny)
    if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false
  }
  return true
}
export const draaiPunt = ([x, y]: Pt, [cx, cy]: Pt, graden: number): Pt => {
  const a = (graden * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]
}
export const lengte = (pts: Pt[]) => pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0)
export const hekStuks = (o: Obj) => { const m = MATERIAAL[o.mat || '']; return m?.stuk ? Math.max(1, Math.ceil(lengte(o.pts || []) / m.stuk - 0.01)) : 0 }
export const oppervlak = (o: Obj) => {
  if (o.kind === 'poly' && o.pts) { let a = 0; for (let i = 0; i < o.pts.length; i++) { const [x1, y1] = o.pts[i], [x2, y2] = o.pts[(i + 1) % o.pts.length]; a += x1 * y2 - x2 * y1 } return Math.abs(a / 2) }
  if (o.kind === 'ellipse' || MATERIAAL[o.mat || '']?.rond) return Math.PI * o.w * o.h / 4
  return o.w * o.h
}
export function puntInPoly([x, y]: Pt, poly: Pt[]) {
  let binnen = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) binnen = !binnen
  }
  return binnen
}
export function afstandTotLijn(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}
const kruist = (a: Pt, b: Pt, c: Pt, d: Pt) => {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b)
}
// Kleinste afstand tussen lijnstuk a-b en een veelhoek (0 als ze elkaar raken)
export function afstandSegPoly(a: Pt, b: Pt, poly: Pt[]) {
  if (puntInPoly(a, poly) || puntInPoly(b, poly)) return 0
  let min = Infinity
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i], d = poly[(i + 1) % poly.length]
    if (kruist(a, b, c, d)) return 0
    min = Math.min(min, afstandTotLijn(c, a, b), afstandTotLijn(a, c, d), afstandTotLijn(b, c, d))
  }
  return min
}
export const middenVan = (o: Obj): Pt => { const b = bbox(hoeken(o)); return [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2] }
// Shift: vastklikken op 0/45/90 graden
export function haaks(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy)
  const hoek = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  return [a[0] + Math.cos(hoek) * l, a[1] + Math.sin(hoek) * l]
}

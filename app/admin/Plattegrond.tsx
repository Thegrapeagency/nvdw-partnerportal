'use client'
// Plattegrond-tekenaar. Alles rekent in METERS: een partnerblok van 6 x 2,5
// staat dus altijd op schaal, hoe ver je ook in- of uitzoomt. De tekening
// zelf is een SVG, dus export gaat 1 op 1 terug naar Illustrator.
//
// Wat erin zit (en bewust niet meer): selecteren/verplaatsen/schalen/draaien,
// rechthoek, ellips, muur/lijn, vlak (polygoon), tekst, meetlat, onderlegger
// met schaal-kalibratie, raster + magnetisch uitlijnen op randen van andere
// objecten, overlap-waarschuwing, lagen, vergrendelen, kopiëren, ongedaan
// maken, autosave en export naar SVG/PNG.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS } from './ui'

type Pt = [number, number]
type Kind = 'rect' | 'ellipse' | 'line' | 'poly' | 'text' | 'partner' | 'voorziening'
type Obj = {
  id: string; kind: Kind
  x: number; y: number; w: number; h: number; rot: number
  pts?: Pt[]
  label?: string; color?: string; locked?: boolean
  partnerId?: string; voorziening?: string
  dik?: number; tekstgrootte?: number
}
type Bg = { src: string; x: number; y: number; w: number; h: number; opacity: number; locked: boolean }
type Doc = { objs: Obj[]; bg?: Bg | null }
type PartnerRij = { id: string; naam: string; bedrijfsnaam: string | null; pakket: string; type: string; stand_breedte_m: number | null; stand_diepte_m: number | null; barlocatie: string | null }
type Maat = { pakket: string; label: string; breedte_m: number; diepte_m: number; kleur: string }
type Tool = 'select' | 'rect' | 'ellipse' | 'line' | 'poly' | 'text' | 'measure' | 'calibrate' | 'hand'

const VOORZIENINGEN: { key: string; label: string; w: number; h: number; color: string }[] = [
  { key: 'ingang', label: 'Ingang', w: 6, h: 1, color: '#010341' },
  { key: 'kassa', label: 'Kassa / scan', w: 4, h: 1.5, color: '#010341' },
  { key: 'garderobe', label: 'Garderobe / lockers', w: 6, h: 2, color: '#5b6b8c' },
  { key: 'glasbar', label: 'Glasbar', w: 3, h: 2, color: '#5b6b8c' },
  { key: 'toiletten', label: 'Toiletten', w: 6, h: 3, color: '#5b6b8c' },
  { key: 'ehbo', label: 'EHBO', w: 3, h: 3, color: '#b3261e' },
  { key: 'podium', label: 'Podium', w: 8, h: 5, color: '#3a2a52' },
  { key: 'terras', label: 'Terras / statafels', w: 8, h: 6, color: '#8b8574' },
  { key: 'nooduitgang', label: 'Nooduitgang', w: 2, h: 0.6, color: '#2e8b3a' },
  { key: 'water', label: 'Waterpunt', w: 1, h: 1, color: '#2b6cb0' },
  { key: 'stroom', label: 'Stroomkast', w: 1, h: 0.6, color: '#d69e2e' },
  { key: 'afval', label: 'Afval / statiegeld', w: 2, h: 1, color: '#777162' },
]

const uid = () => Math.random().toString(36).slice(2, 10)
const r2 = (v: number) => Math.round(v * 100) / 100
const fmt = (v: number) => r2(v).toLocaleString('nl-NL', { maximumFractionDigits: 2 }) + ' m'
const leeg: Doc = { objs: [], bg: null }
const bnaam = (p: { naam: string; bedrijfsnaam: string | null }) => (p.bedrijfsnaam || '').trim() || p.naam

// ---- geometrie ----
const hoeken = (o: Obj): Pt[] => {
  if (o.kind === 'line' || o.kind === 'poly') return o.pts || []
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2, a = (o.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return ([[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]] as Pt[]).map(([x, y]) => {
    const dx = x - cx, dy = y - cy
    return [cx + dx * c - dy * s, cy + dx * s + dy * c] as Pt
  })
}
const bbox = (pts: Pt[]) => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }
}
const overlapt = (a: Pt[], b: Pt[]) => {
  // Separating Axis Theorem voor twee convexe vierhoeken
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i], p2 = poly[(i + 1) % poly.length]
      const nx = p2[1] - p1[1], ny = p1[0] - p2[0]
      const proj = (q: Pt[]) => q.map(p => p[0] * nx + p[1] * ny)
      const pa = proj(a), pb = proj(b)
      if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false
    }
  }
  return true
}
const blok = (k: Kind) => k === 'rect' || k === 'ellipse' || k === 'partner' || k === 'voorziening' || k === 'text'

export default function Plattegrond({ flash, demo }: { flash: (m: string, ms?: number) => void; demo?: { partners: PartnerRij[]; maten: Maat[] } }) {
  // ---- data ----
  const [lijst, setLijst] = useState<{ id: string; naam: string; updated_at: string }[]>([])
  const [huidigId, setHuidigId] = useState<string | null>(null)
  const [naam, setNaam] = useState('')
  const [doc, setDocRaw] = useState<Doc>(leeg)
  const [partners, setPartners] = useState<PartnerRij[]>([])
  const [maten, setMaten] = useState<Maat[]>([])
  const [opgeslagen, setOpgeslagen] = useState<'ja' | 'bezig' | 'nee'>('ja')
  const hist = useRef<{ past: Doc[]; future: Doc[] }>({ past: [], future: [] })

  // ---- editor ----
  const [tool, setTool] = useState<Tool>('select')
  const [sel, setSel] = useState<string[]>([])
  const [view, setView] = useState({ x: -5, y: -5, s: 14 }) // s = pixels per meter
  const [raster, setRaster] = useState(0.5)
  const [snap, setSnap] = useState(true)
  const [toonMaten, setToonMaten] = useState(true)
  const [concept, setConcept] = useState<Pt[] | null>(null) // lijn/vlak/meetlat in aanbouw
  const [muis, setMuis] = useState<Pt>([0, 0])
  const [gidsen, setGidsen] = useState<{ x?: number; y?: number }>({})
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null)
  const [zoek, setZoek] = useState('')
  const [zijTab, setZijTab] = useState<'partners' | 'voorzieningen' | 'lagen'>('partners')
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const drag = useRef<null | { type: string; start: Pt; orig: Obj[]; handle?: string; screen?: Pt; view?: typeof view; extra?: unknown }>(null)
  const klembord = useRef<Obj[]>([])
  const spatie = useRef(false)
  const mmVast = useRef(false) // meetlat staat vast na de tweede klik

  const setDoc = useCallback((upd: Doc | ((d: Doc) => Doc), geschiedenis = true) => {
    setDocRaw(d => {
      const nieuw = typeof upd === 'function' ? upd(d) : upd
      if (geschiedenis && nieuw !== d) { hist.current.past.push(d); if (hist.current.past.length > 200) hist.current.past.shift(); hist.current.future = [] }
      return nieuw
    })
    setOpgeslagen('nee')
  }, [])
  const undo = () => { const p = hist.current.past.pop(); if (!p) return; hist.current.future.push(doc); setDocRaw(p); setOpgeslagen('nee') }
  const redo = () => { const f = hist.current.future.pop(); if (!f) return; hist.current.past.push(doc); setDocRaw(f); setOpgeslagen('nee') }

  // ---- laden ----
  const laadLijst = useCallback(async () => {
    const { data } = await supabase.from('plattegronden').select('id,naam,updated_at').order('updated_at', { ascending: false })
    setLijst(data || [])
    return data || []
  }, [])
  const open = useCallback(async (id: string) => {
    const { data, error } = await supabase.from('plattegronden').select('*').eq('id', id).single()
    if (error || !data) { flash('Kon plattegrond niet openen'); return }
    setHuidigId(id); setNaam(data.naam); setDocRaw(Object.assign({ objs: [], bg: null }, data.data) as Doc); hist.current = { past: [], future: [] }; setSel([]); setOpgeslagen('ja')
    try { localStorage.setItem('nvdw-plattegrond', id) } catch { }
  }, [flash])
  useEffect(() => {
    if (demo) { setPartners(demo.partners); setMaten(demo.maten); setLijst([{ id: 'demo', naam: 'Demo', updated_at: '' }]); setHuidigId('demo'); setNaam('Demo'); return }
    (async () => {
      const [{ data: p }, { data: m }] = await Promise.all([
        supabase.from('partners').select('id,naam,bedrijfsnaam,pakket,type,stand_breedte_m,stand_diepte_m,barlocatie').order('naam'),
        supabase.from('plattegrond_standaardmaten').select('*'),
      ])
      setPartners(((p || []) as PartnerRij[]).sort((a, b) => bnaam(a).localeCompare(bnaam(b), 'nl'))); setMaten((m || []) as Maat[])
      const l = await laadLijst()
      let laatst: string | null = null
      try { laatst = localStorage.getItem('nvdw-plattegrond') } catch { }
      const kies = l.find(x => x.id === laatst) || l[0]
      if (kies) open(kies.id)
    })()
  }, [laadLijst, open, demo])

  const nieuw = async () => {
    const n = prompt('Naam van de nieuwe plattegrond', 'NvdW 2027 Werkspoorkathedraal')
    if (!n) return
    const { data, error } = await supabase.from('plattegronden').insert({ naam: n, data: leeg }).select().single()
    if (error) { flash(error.message); return }
    await laadLijst(); open(data.id)
  }
  const dupliceerPlattegrond = async () => {
    if (!huidigId) return
    const { data, error } = await supabase.from('plattegronden').insert({ naam: naam + ' (kopie)', data: doc }).select().single()
    if (error) { flash(error.message); return }
    await laadLijst(); open(data.id); flash('Kopie gemaakt, je werkt nu in de kopie')
  }
  const verwijderPlattegrond = async () => {
    if (!huidigId || !confirm(`"${naam}" verwijderen? Dit kan niet ongedaan worden.`)) return
    await supabase.from('plattegronden').delete().eq('id', huidigId)
    const l = await laadLijst(); setHuidigId(null); setDocRaw(leeg)
    if (l[0]) open(l[0].id)
  }

  // autosave
  useEffect(() => {
    if (!huidigId || opgeslagen !== 'nee' || demo) return
    const t = setTimeout(async () => {
      setOpgeslagen('bezig')
      const { error } = await supabase.from('plattegronden').update({ data: doc, naam, updated_at: new Date().toISOString() }).eq('id', huidigId)
      if (error) { setOpgeslagen('nee'); flash('Opslaan mislukt: ' + error.message) } else setOpgeslagen('ja')
    }, 1200)
    return () => clearTimeout(t)
  }, [doc, naam, huidigId, opgeslagen, flash, demo])

  // ---- partnerafmetingen ----
  const maatVan = useCallback((p: PartnerRij) => {
    const std = maten.find(m => m.pakket === p.pakket)
    return {
      w: Number(p.stand_breedte_m || std?.breedte_m || 3),
      h: Number(p.stand_diepte_m || std?.diepte_m || 2),
      eigen: p.stand_breedte_m != null,
      kleur: std?.kleur || '#9b3737',
      label: std?.label || p.pakket,
    }
  }, [maten])
  const partnerById = useMemo(() => Object.fromEntries(partners.map(p => [p.id, p])), [partners])

  // Als een partner later zijn maat aanpast, groeit het blok mee (rotatie blijft).
  useEffect(() => {
    if (!partners.length) return
    setDocRaw(d => {
      let veranderd = false
      const objs = d.objs.map(o => {
        if (o.kind !== 'partner' || !o.partnerId) return o
        const p = partnerById[o.partnerId]; if (!p) return o
        const m = maatVan(p)
        if (Math.abs(m.w - o.w) < 0.001 && Math.abs(m.h - o.h) < 0.001) return o
        veranderd = true
        return { ...o, x: o.x + (o.w - m.w) / 2, y: o.y + (o.h - m.h) / 2, w: m.w, h: m.h }
      })
      return veranderd ? { ...d, objs } : d
    })
  }, [partners, maten, partnerById, maatVan])

  const slaMaatOp = async (p: PartnerRij, w: string, h: string) => {
    const b = w === '' ? null : parseFloat(w.replace(',', '.')), dd = h === '' ? null : parseFloat(h.replace(',', '.'))
    const { error } = await supabase.from('partners').update({ stand_breedte_m: b, stand_diepte_m: dd }).eq('id', p.id)
    if (error) { flash(error.message); return }
    setPartners(ps => ps.map(x => x.id === p.id ? { ...x, stand_breedte_m: b, stand_diepte_m: dd } : x))
  }
  const slaStandaardOp = async (m: Maat, veld: 'breedte_m' | 'diepte_m', v: string) => {
    const n = parseFloat(v.replace(',', '.')); if (!n) return
    const { error } = await supabase.from('plattegrond_standaardmaten').update({ [veld]: n }).eq('pakket', m.pakket)
    if (error) { flash(error.message); return }
    setMaten(ms => ms.map(x => x.pakket === m.pakket ? { ...x, [veld]: n } : x))
  }

  // ---- coördinaten ----
  const naarM = useCallback((cx: number, cy: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect()
    return [(cx - r.left) / view.s + view.x, (cy - r.top) / view.s + view.y]
  }, [view])
  const rs = (v: number) => (snap && raster ? Math.round(v / raster) * raster : v)
  const midden = (): Pt => {
    const r = svgRef.current?.getBoundingClientRect()
    return r ? [view.x + r.width / 2 / view.s, view.y + r.height / 2 / view.s] : [0, 0]
  }

  // ---- objecten toevoegen ----
  // Schuif een nieuw blok naar rechts/onder tot het niets raakt
  const vrijePlek = (o: Obj): Obj => {
    const blokken = doc.objs.filter(q => q.kind === 'partner' || q.kind === 'voorziening').map(hoeken)
    for (let i = 0; i < 80; i++) {
      const kand = { ...o, x: o.x + (i % 8) * (o.w + 0.5), y: o.y + Math.floor(i / 8) * (o.h + 0.5) }
      if (!blokken.some(b => overlapt(b, hoeken(kand)))) return kand
    }
    return o
  }
  const plaatsPartner = (p: PartnerRij, op?: Pt) => {
    if (doc.objs.some(o => o.partnerId === p.id)) { const o = doc.objs.find(o => o.partnerId === p.id)!; setSel([o.id]); centreerOp(o); return }
    const m = maatVan(p), c = op || midden()
    const basis: Obj = { id: uid(), kind: 'partner', partnerId: p.id, x: rs(c[0] - m.w / 2), y: rs(c[1] - m.h / 2), w: m.w, h: m.h, rot: 0 }
    const o = op ? basis : vrijePlek(basis)
    setDoc(d => ({ ...d, objs: [...d.objs, o] })); setSel([o.id]); setTool('select')
  }
  const plaatsVoorziening = (v: typeof VOORZIENINGEN[number], op?: Pt) => {
    const c = op || midden()
    const basis: Obj = { id: uid(), kind: 'voorziening', voorziening: v.key, label: v.label, color: v.color, x: rs(c[0] - v.w / 2), y: rs(c[1] - v.h / 2), w: v.w, h: v.h, rot: 0 }
    const o = op ? basis : vrijePlek(basis)
    setDoc(d => ({ ...d, objs: [...d.objs, o] })); setSel([o.id]); setTool('select')
  }
  const centreerOp = (o: Obj) => {
    const b = bbox(hoeken(o)), r = svgRef.current!.getBoundingClientRect()
    setView(v => ({ ...v, x: (b.x1 + b.x2) / 2 - r.width / 2 / v.s, y: (b.y1 + b.y2) / 2 - r.height / 2 / v.s }))
  }
  const passend = () => {
    const pts = doc.objs.flatMap(hoeken)
    if (doc.bg) pts.push([doc.bg.x, doc.bg.y], [doc.bg.x + doc.bg.w, doc.bg.y + doc.bg.h])
    if (!pts.length) return
    const b = bbox(pts), r = svgRef.current!.getBoundingClientRect()
    const s = Math.min(r.width / (b.x2 - b.x1 + 6), r.height / (b.y2 - b.y1 + 6))
    setView({ s, x: (b.x1 + b.x2) / 2 - r.width / 2 / s, y: (b.y1 + b.y2) / 2 - r.height / 2 / s })
  }

  // ---- bewerken ----
  const gesel = doc.objs.filter(o => sel.includes(o.id))
  const wijzig = (ids: string[], f: (o: Obj) => Obj, geschiedenis = true) =>
    setDoc(d => ({ ...d, objs: d.objs.map(o => ids.includes(o.id) ? f(o) : o) }), geschiedenis)
  const verplaats = (o: Obj, dx: number, dy: number): Obj =>
    o.pts ? { ...o, pts: o.pts.map(([x, y]) => [x + dx, y + dy] as Pt) } : { ...o, x: o.x + dx, y: o.y + dy }
  const verwijder = () => { if (!sel.length) return; setDoc(d => ({ ...d, objs: d.objs.filter(o => !sel.includes(o.id) || o.locked) })); setSel([]) }
  const dupliceer = () => {
    const kopie = gesel.filter(o => o.kind !== 'partner').map(o => ({ ...verplaats(o, 1, 1), id: uid(), locked: false }))
    if (gesel.some(o => o.kind === 'partner')) flash('Partners staan maar één keer op de kaart, die zijn niet gekopieerd')
    if (!kopie.length) return
    setDoc(d => ({ ...d, objs: [...d.objs, ...kopie] })); setSel(kopie.map(o => o.id))
  }
  const draai = (graden: number) => wijzig(sel, o => blok(o.kind) && !o.locked ? { ...o, rot: (((o.rot + graden) % 360) + 360) % 360 } : o)
  const laag = (richting: 'voor' | 'achter' | 'boven' | 'onder') => setDoc(d => {
    const objs = [...d.objs]
    if (richting === 'boven' || richting === 'onder') {
      const mee = objs.filter(o => sel.includes(o.id)), rest = objs.filter(o => !sel.includes(o.id))
      return { ...d, objs: richting === 'boven' ? [...rest, ...mee] : [...mee, ...rest] }
    }
    const stap = richting === 'voor' ? 1 : -1
    const idx = objs.map((o, i) => sel.includes(o.id) ? i : -1).filter(i => i >= 0)
    for (const i of stap > 0 ? idx.reverse() : idx) {
      const j = i + stap; if (j < 0 || j >= objs.length || sel.includes(objs[j].id)) continue
      ;[objs[i], objs[j]] = [objs[j], objs[i]]
    }
    return { ...d, objs }
  })
  const lijnUit = (hoe: 'links' | 'rechts' | 'boven' | 'onder' | 'hmidden' | 'vmidden' | 'hverdeel' | 'vverdeel') => {
    if (gesel.length < 2) return
    const bs = gesel.map(o => ({ o, b: bbox(hoeken(o)) }))
    const tot = bbox(gesel.flatMap(hoeken))
    const nieuw: Record<string, Pt> = {}
    if (hoe === 'hverdeel' || hoe === 'vverdeel') {
      const as = hoe === 'hverdeel' ? 'x' : 'y'
      const srt = [...bs].sort((a, b) => a.b[`${as}1`] - b.b[`${as}1`])
      const totaal = srt.reduce((s, q) => s + q.b[`${as}2`] - q.b[`${as}1`], 0)
      const gat = (tot[`${as}2`] - tot[`${as}1`] - totaal) / (srt.length - 1)
      let pos = tot[`${as}1`]
      for (const q of srt) { const d = pos - q.b[`${as}1`]; nieuw[q.o.id] = as === 'x' ? [d, 0] : [0, d]; pos += q.b[`${as}2`] - q.b[`${as}1`] + gat }
    } else for (const { o, b } of bs) {
      const dx = hoe === 'links' ? tot.x1 - b.x1 : hoe === 'rechts' ? tot.x2 - b.x2 : hoe === 'hmidden' ? (tot.x1 + tot.x2) / 2 - (b.x1 + b.x2) / 2 : 0
      const dy = hoe === 'boven' ? tot.y1 - b.y1 : hoe === 'onder' ? tot.y2 - b.y2 : hoe === 'vmidden' ? (tot.y1 + tot.y2) / 2 - (b.y1 + b.y2) / 2 : 0
      nieuw[o.id] = [dx, dy]
    }
    wijzig(sel, o => o.locked ? o : verplaats(o, ...(nieuw[o.id] || [0, 0])))
  }

  // ---- toetsenbord ----
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
      const cmd = e.metaKey || e.ctrlKey
      if (e.key === ' ') { spatie.current = true; e.preventDefault(); return }
      if (cmd && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (cmd && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (cmd && e.key.toLowerCase() === 'd') { e.preventDefault(); dupliceer(); return }
      if (cmd && e.key.toLowerCase() === 'c') { klembord.current = gesel.filter(o => o.kind !== 'partner'); return }
      if (cmd && e.key.toLowerCase() === 'v') {
        const kopie = klembord.current.map(o => ({ ...verplaats(o, 1, 1), id: uid() }))
        klembord.current = kopie
        if (kopie.length) { setDoc(d => ({ ...d, objs: [...d.objs, ...kopie] })); setSel(kopie.map(o => o.id)) }
        return
      }
      if (cmd && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel(doc.objs.filter(o => !o.locked).map(o => o.id)); return }
      if (cmd && e.key === '0') { e.preventDefault(); passend(); return }
      if ((e.key === 'Escape' || e.key === 'Enter') && concept && tool === 'line') { maakLijn(concept.slice(0, -1)); return }
      if (e.key === 'Escape') { mmVast.current = false; setConcept(null); setSel([]); setTool('select'); return }
      if (e.key === 'Enter' && concept && tool === 'poly') { afrondenVlak(); return }
      if ((e.key === 'Backspace' || e.key === 'Delete') && sel.length) { e.preventDefault(); verwijder(); return }
      if (e.key.startsWith('Arrow') && sel.length) {
        e.preventDefault()
        const st = e.shiftKey ? 1 : 0.1
        const [dx, dy] = e.key === 'ArrowLeft' ? [-st, 0] : e.key === 'ArrowRight' ? [st, 0] : e.key === 'ArrowUp' ? [0, -st] : [0, st]
        wijzig(sel, o => o.locked ? o : verplaats(o, dx, dy)); return
      }
      if (cmd) return
      if (e.key === ']') laag(e.shiftKey ? 'boven' : 'voor')
      else if (e.key === '[') laag(e.shiftKey ? 'onder' : 'achter')
      const map: Record<string, Tool> = { v: 'select', r: 'rect', e: 'ellipse', l: 'line', p: 'poly', t: 'text', m: 'measure', h: 'hand' }
      if (e.key.toLowerCase() === 'q' && sel.length) { draai(e.shiftKey ? -15 : 90); return }
      if (map[e.key.toLowerCase()]) { setTool(map[e.key.toLowerCase()]); setConcept(null) }
    }
    const ku = (e: KeyboardEvent) => { if (e.key === ' ') spatie.current = false }
    window.addEventListener('keydown', k); window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('keyup', ku) }
  })

  // ---- zoom met wiel/trackpad ----
  useEffect(() => {
    const el = svgRef.current; if (!el) return
    const w = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        setView(v => {
          const s = Math.min(400, Math.max(1, v.s * Math.exp(-e.deltaY * 0.01)))
          const mx = (e.clientX - r.left) / v.s + v.x, my = (e.clientY - r.top) / v.s + v.y
          return { s, x: mx - (e.clientX - r.left) / s, y: my - (e.clientY - r.top) / s }
        })
      } else setView(v => ({ ...v, x: v.x + e.deltaX / v.s, y: v.y + e.deltaY / v.s }))
    }
    el.addEventListener('wheel', w, { passive: false })
    return () => el.removeEventListener('wheel', w)
  }, [])
  const zoomStap = (f: number) => {
    const r = svgRef.current!.getBoundingClientRect()
    setView(v => { const s = Math.min(400, Math.max(1, v.s * f)); const c = [v.x + r.width / 2 / v.s, v.y + r.height / 2 / v.s]; return { s, x: c[0] - r.width / 2 / s, y: c[1] - r.height / 2 / s } })
  }

  // ---- magnetisch uitlijnen op andere objecten ----
  const magneet = (orig: Obj[], dx: number, dy: number) => {
    if (!snap) return { dx, dy, g: {} }
    const ids = orig.map(o => o.id)
    const b = bbox(orig.map(o => verplaats(o, dx, dy)).flatMap(hoeken))
    const xs = [b.x1, (b.x1 + b.x2) / 2, b.x2], ys = [b.y1, (b.y1 + b.y2) / 2, b.y2]
    const doelX: number[] = [], doelY: number[] = []
    for (const o of doc.objs) {
      if (ids.includes(o.id)) continue
      const q = bbox(hoeken(o)); doelX.push(q.x1, (q.x1 + q.x2) / 2, q.x2); doelY.push(q.y1, (q.y1 + q.y2) / 2, q.y2)
    }
    const drempel = 6 / view.s
    let bx: number | undefined, by: number | undefined, beste = drempel, besteY = drempel, cx = 0, cy = 0
    for (const x of xs) for (const t of doelX) if (Math.abs(t - x) < beste) { beste = Math.abs(t - x); cx = t - x; bx = t }
    for (const y of ys) for (const t of doelY) if (Math.abs(t - y) < besteY) { besteY = Math.abs(t - y); cy = t - y; by = t }
    // geen object-gids? dan het raster
    if (bx === undefined && raster) { const g = Math.round(b.x1 / raster) * raster; cx = g - b.x1 }
    if (by === undefined && raster) { const g = Math.round(b.y1 / raster) * raster; cy = g - b.y1 }
    return { dx: dx + cx, dy: dy + cy, g: { x: bx, y: by } }
  }

  // ---- muis ----
  const geraakt = (p: Pt): Obj | undefined => {
    for (let i = doc.objs.length - 1; i >= 0; i--) {
      const o = doc.objs[i]
      if (o.kind === 'line') {
        const tol = Math.max(0.3, 6 / view.s)
        const pts = o.pts || []
        for (let j = 0; j < pts.length - 1; j++) if (afstandTotLijn(p, pts[j], pts[j + 1]) < tol + (o.dik || 0.2) / 2) return o
      } else if (puntInPoly(p, hoeken(o))) return o
    }
  }
  const onDown = (e: React.PointerEvent) => {
    const p = naarM(e.clientX, e.clientY)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    if (e.button === 1 || tool === 'hand' || spatie.current) { drag.current = { type: 'pan', start: p, orig: [], screen: [e.clientX, e.clientY], view }; return }
    const sp: Pt = [rs(p[0]), rs(p[1])]
    if (tool === 'rect' || tool === 'ellipse') {
      const o: Obj = { id: uid(), kind: tool, x: sp[0], y: sp[1], w: 0, h: 0, rot: 0, color: '#8b8574' }
      setDoc(d => ({ ...d, objs: [...d.objs, o] })); setSel([o.id])
      drag.current = { type: 'teken', start: sp, orig: [o] }; return
    }
    if (tool === 'text') {
      const label = prompt('Tekst'); if (!label) return
      const o: Obj = { id: uid(), kind: 'text', x: sp[0], y: sp[1], w: Math.max(2, label.length * 0.6), h: 1.2, rot: 0, label, color: '#010341', tekstgrootte: 1 }
      setDoc(d => ({ ...d, objs: [...d.objs, o] })); setSel([o.id]); setTool('select'); return
    }
    if (tool === 'line' || tool === 'measure' || tool === 'calibrate') {
      const q = e.shiftKey && concept ? haaks(concept[concept.length - 1], sp) : sp
      if (!concept || mmVast.current) { mmVast.current = false; setConcept([q, q]); return }
      // tweede klik: lijn klaar (muur gaat door tot dubbelklik/Escape)
      if (tool === 'measure') { setConcept([concept[0], q]); mmVast.current = true; return }
      if (tool === 'calibrate') { kalibreer(concept[0], q); setConcept(null); setTool('select'); return }
      const pts = [...concept.slice(0, -1), q]
      setConcept([...pts, q]); return
    }
    if (tool === 'poly') {
      const q = e.shiftKey && concept ? haaks(concept[concept.length - 2] || sp, sp) : sp
      if (concept && concept.length > 2) {
        const [fx, fy] = concept[0]
        if (Math.hypot(fx - q[0], fy - q[1]) < 8 / view.s) { afrondenVlak(); return }
      }
      setConcept(c => c ? [...c.slice(0, -1), q, q] : [q, q]); return
    }
    // select
    const h = (e.target as Element).getAttribute('data-handle')
    if (h && gesel.length === 1) {
      drag.current = { type: h === 'rot' ? 'rot' : h.startsWith('pt') ? 'pt' : 'resize', handle: h, start: p, orig: [...gesel] }; return
    }
    if ((e.target as Element).getAttribute('data-bg') && doc.bg && !doc.bg.locked) {
      drag.current = { type: 'bg', start: p, orig: [], extra: { ...doc.bg } }; return
    }
    const o = geraakt(p)
    if (o && !o.locked) {
      let nieuweSel = sel
      if (e.shiftKey) nieuweSel = sel.includes(o.id) ? sel.filter(i => i !== o.id) : [...sel, o.id]
      else if (!sel.includes(o.id)) nieuweSel = [o.id]
      setSel(nieuweSel)
      if (e.altKey) {
        const kopie = doc.objs.filter(x => nieuweSel.includes(x.id) && x.kind !== 'partner').map(x => ({ ...x, id: uid() }))
        if (kopie.length) { setDoc(d => ({ ...d, objs: [...d.objs, ...kopie] })); setSel(kopie.map(x => x.id)); drag.current = { type: 'move', start: p, orig: kopie }; return }
      }
      drag.current = { type: 'move', start: p, orig: doc.objs.filter(x => nieuweSel.includes(x.id)) }
      return
    }
    if (o?.locked && !e.shiftKey) { setSel([]) }
    if (!e.shiftKey) setSel([])
    drag.current = { type: 'marquee', start: p, orig: [] }
    setMarquee({ a: p, b: p })
  }
  const onMove = (e: React.PointerEvent) => {
    const p = naarM(e.clientX, e.clientY)
    setMuis(p)
    if (concept && (tool === 'line' || tool === 'poly' || tool === 'measure' || tool === 'calibrate') && !mmVast.current) {
      const sp: Pt = [rs(p[0]), rs(p[1])]
      const vorige = concept[concept.length - 2]
      const q = e.shiftKey && vorige ? haaks(vorige, sp) : sp
      setConcept(c => c ? [...c.slice(0, -1), q] : c)
    }
    const d = drag.current; if (!d) return
    if (d.type === 'pan') { const v = d.view!; setView({ ...v, x: v.x - (e.clientX - d.screen![0]) / v.s, y: v.y - (e.clientY - d.screen![1]) / v.s }); return }
    if (d.type === 'marquee') { setMarquee({ a: d.start, b: p }); return }
    const dx = p[0] - d.start[0], dy = p[1] - d.start[1]
    if (d.type === 'bg') { const b = d.extra as Bg; setDoc(x => ({ ...x, bg: { ...b, x: b.x + dx, y: b.y + dy } }), false); return }
    if (d.type === 'move') {
      const m = magneet(d.orig, dx, dy)
      setGidsen(m.g)
      const origById = Object.fromEntries(d.orig.map(o => [o.id, o]))
      setDoc(x => ({ ...x, objs: x.objs.map(o => origById[o.id] ? verplaats(origById[o.id], m.dx, m.dy) : o) }), false)
      return
    }
    if (d.type === 'teken') {
      const o = d.orig[0], sp: Pt = [rs(p[0]), rs(p[1])]
      let w = sp[0] - d.start[0], h = sp[1] - d.start[1]
      if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m }
      wijzig([o.id], q => ({ ...q, x: Math.min(d.start[0], d.start[0] + w), y: Math.min(d.start[1], d.start[1] + h), w: Math.abs(w), h: Math.abs(h) }), false)
      return
    }
    if (d.type === 'rot') {
      const o = d.orig[0], cx = o.x + o.w / 2, cy = o.y + o.h / 2
      let a = (Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI + 90
      a = e.shiftKey ? a : Math.round(a / 15) * 15
      wijzig([o.id], q => ({ ...q, rot: ((Math.round(a * 10) / 10) % 360 + 360) % 360 }), false); return
    }
    if (d.type === 'pt') {
      const o = d.orig[0], i = parseInt(d.handle!.slice(2)), sp: Pt = [rs(p[0]), rs(p[1])]
      const buur = o.pts![i - 1] || o.pts![i + 1]
      const q = e.shiftKey && buur ? haaks(buur, sp) : sp
      wijzig([o.id], x => ({ ...x, pts: x.pts!.map((pt, j) => j === i ? q : pt) }), false); return
    }
    if (d.type === 'resize') {
      const o = d.orig[0]; if (o.kind === 'partner') return
      // naar lokaal assenstelsel van het object
      const a = (-o.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
      const lx = dx * c - dy * s, ly = dx * s + dy * c
      const hd = d.handle!
      let { x, y, w, h } = { x: 0, y: 0, w: o.w, h: o.h }
      if (hd.includes('e')) w = o.w + lx
      if (hd.includes('s')) h = o.h + ly
      if (hd.includes('w')) { w = o.w - lx; x = lx }
      if (hd.includes('n')) { h = o.h - ly; y = ly }
      if (snap && raster) { w = Math.max(raster, Math.round(w / raster) * raster); h = Math.max(raster, Math.round(h / raster) * raster); if (hd.includes('w')) x = o.w - w; if (hd.includes('n')) y = o.h - h }
      if (e.shiftKey && o.w && o.h) { const f = Math.max(w / o.w, h / o.h); w = o.w * f; h = o.h * f; if (hd.includes('w')) x = o.w - w; if (hd.includes('n')) y = o.h - h }
      w = Math.max(0.1, w); h = Math.max(0.1, h)
      // nieuwe linkerbovenhoek terug naar wereld, rekening houdend met rotatie om het (nieuwe) midden
      const ar = (o.rot * Math.PI) / 180, cr = Math.cos(ar), sr = Math.sin(ar)
      const ocx = o.x + o.w / 2, ocy = o.y + o.h / 2
      const lcx = x + w / 2 - o.w / 2, lcy = y + h / 2 - o.h / 2
      const ncx = ocx + lcx * cr - lcy * sr, ncy = ocy + lcx * sr + lcy * cr
      wijzig([o.id], q => ({ ...q, x: ncx - w / 2, y: ncy - h / 2, w, h }), false)
    }
  }
  const onUp = () => {
    const d = drag.current; drag.current = null; setGidsen({})
    if (!d) return
    if (d.type === 'marquee' && marquee) {
      const b = bbox([marquee.a, marquee.b])
      if (b.x2 - b.x1 > 0.05 || b.y2 - b.y1 > 0.05) {
        const binnen = doc.objs.filter(o => !o.locked && hoeken(o).length && (() => { const q = bbox(hoeken(o)); return q.x1 >= b.x1 && q.x2 <= b.x2 && q.y1 >= b.y1 && q.y2 <= b.y2 })()).map(o => o.id)
        setSel(s => [...new Set([...s, ...binnen])])
      }
      setMarquee(null); return
    }
    if (d.type === 'teken') {
      const o = doc.objs.find(x => x.id === d.orig[0].id)
      if (o && (o.w < 0.1 || o.h < 0.1)) { setDocRaw(x => ({ ...x, objs: x.objs.filter(q => q.id !== o.id) })); setSel([]) }
      else { hist.current.past.push({ ...doc, objs: doc.objs.filter(q => q.id !== d.orig[0].id) }); setTool('select') }
      return
    }
    if (['move', 'rot', 'resize', 'pt', 'bg'].includes(d.type)) {
      // één stap in de geschiedenis voor de hele sleepbeweging
      if (d.type === 'bg') hist.current.past.push({ ...doc, bg: d.extra as Bg })
      else { const origById = Object.fromEntries(d.orig.map(o => [o.id, o])); hist.current.past.push({ ...doc, objs: doc.objs.filter(o => !d.orig.some(q => q.id === o.id) || origById[o.id]).map(o => origById[o.id] || o) }) }
      hist.current.future = []
      // alt-kopie: de kopieën bestonden vóór de sleep niet
    }
  }
  const onDouble = (e: React.MouseEvent) => {
    if (tool === 'line' && concept) { maakLijn(concept.slice(0, -1)); return }
    if (tool === 'poly' && concept) { afrondenVlak(); return }
    if (tool !== 'select') return
    const o = geraakt(naarM(e.clientX, e.clientY))
    if (o && (o.kind === 'text' || o.kind === 'rect' || o.kind === 'ellipse' || o.kind === 'voorziening' || o.kind === 'poly')) {
      const label = prompt('Label', o.label || ''); if (label !== null) wijzig([o.id], q => ({ ...q, label }))
    }
  }
  const maakLijn = (pts: Pt[]) => {
    const schoon = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.01)
    if (schoon.length >= 2) { const o: Obj = { id: uid(), kind: 'line', x: 0, y: 0, w: 0, h: 0, rot: 0, pts: schoon, color: '#010341', dik: 0.2 }; setDoc(d => ({ ...d, objs: [...d.objs, o] })); setSel([o.id]) }
    setConcept(null)
  }
  const afrondenVlak = () => {
    if (!concept) return
    const pts = concept.slice(0, -1)
    if (pts.length >= 3) { const o: Obj = { id: uid(), kind: 'poly', x: 0, y: 0, w: 0, h: 0, rot: 0, pts, color: '#d9cfb8' }; setDoc(d => ({ ...d, objs: [...d.objs, o] })); setSel([o.id]) }
    setConcept(null); setTool('select')
  }

  // ---- onderlegger ----
  // PDF: eerste pagina scherp renderen naar PNG (lange zijde ~4000 px)
  const pdfNaarAfbeelding = async (f: File): Promise<string> => {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
    const pdf = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise
    const pagina = await pdf.getPage(1)
    const basis = pagina.getViewport({ scale: 1 })
    const vp = pagina.getViewport({ scale: 4000 / Math.max(basis.width, basis.height) })
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    await pagina.render({ canvasContext: ctx, viewport: vp }).promise
    if (pdf.numPages > 1) flash(`PDF heeft ${pdf.numPages} pagina's, de eerste is gebruikt`)
    return c.toDataURL('image/jpeg', 0.85)
  }
  const kiesOnderlegger = async (f: File) => {
    let src: string
    try {
      src = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
        ? await pdfNaarAfbeelding(f)
        : await new Promise<string>((ok, nee) => { const rd = new FileReader(); rd.onload = () => ok(rd.result as string); rd.onerror = nee; rd.readAsDataURL(f) })
    } catch (e) { flash('Kon bestand niet lezen: ' + (e as Error).message); return }
    const img = new Image()
    img.onload = () => {
      // standaard: 60 m breed, daarna op schaal zetten met een bekende maat
      const w = 60, h = (60 * img.height) / img.width
      setDoc(d => ({ ...d, bg: { src, x: 0, y: 0, w, h, opacity: 0.5, locked: false } }))
      flash('Plattegrond van de locatie geplaatst. Zet hem nu op schaal: trek een lijn over een maat die je kent.', 6000)
      setTool('calibrate')
    }
    img.src = src
  }
  const kalibreer = (a: Pt, b: Pt) => {
    const gemeten = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (!doc.bg || gemeten < 0.01) return
    const echt = parseFloat((prompt(`Deze lijn is nu ${fmt(gemeten)}. Hoe lang is hij in het echt (meters)?`) || '').replace(',', '.'))
    if (!echt) return
    const f = echt / gemeten
    setDoc(d => d.bg ? ({ ...d, bg: { ...d.bg, x: a[0] - (a[0] - d.bg.x) * f, y: a[1] - (a[1] - d.bg.y) * f, w: d.bg.w * f, h: d.bg.h * f } }) : d)
    flash('Plattegrond van de locatie staat op schaal')
  }

  // ---- export ----
  const exporteer = (soort: 'svg' | 'png') => {
    const pts = doc.objs.flatMap(hoeken)
    if (doc.bg) pts.push([doc.bg.x, doc.bg.y], [doc.bg.x + doc.bg.w, doc.bg.y + doc.bg.h])
    if (!pts.length) { flash('Er staat nog niets op de kaart'); return }
    const b = bbox(pts), m = 2
    const kloon = svgRef.current!.querySelector('#tekening')!.cloneNode(true) as SVGGElement
    kloon.querySelectorAll('[data-ui]').forEach(n => n.remove())
    kloon.removeAttribute('transform')
    const ppm = 20 // 1 meter = 20 px in de export (Illustrator: 1 pt = 5 cm)
    const W = (b.x2 - b.x1 + 2 * m), H = (b.y2 - b.y1 + 2 * m)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * ppm}" height="${H * ppm}" viewBox="${b.x1 - m} ${b.y1 - m} ${W} ${H}"><rect x="${b.x1 - m}" y="${b.y1 - m}" width="${W}" height="${H}" fill="#fbf8f1"/>${kloon.innerHTML}</svg>`
    const bestandsnaam = (naam || 'plattegrond').replace(/[^\w\- ]+/g, '').trim()
    const download = (url: string, ext: string) => { const a = document.createElement('a'); a.href = url; a.download = `${bestandsnaam}.${ext}`; a.click() }
    if (soort === 'svg') { download(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), 'svg'); return }
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); const f = 2; c.width = W * ppm * f; c.height = H * ppm * f
      const ctx = c.getContext('2d')!; ctx.scale(f, f); ctx.drawImage(img, 0, 0, W * ppm, H * ppm)
      c.toBlob(bl => bl && download(URL.createObjectURL(bl), 'png'))
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  }

  // ---- afgeleide info ----
  const geplaatst = new Set(doc.objs.filter(o => o.partnerId).map(o => o.partnerId!))
  const relevante = partners.filter(p => p.type !== 'personeel')
  const overlappers = useMemo(() => {
    const s = new Set<string>()
    const blokken = doc.objs.filter(o => o.kind === 'partner' || o.kind === 'voorziening')
    for (let i = 0; i < blokken.length; i++) for (let j = i + 1; j < blokken.length; j++)
      if (overlapt(hoeken(blokken[i]), hoeken(blokken[j]))) { s.add(blokken[i].id); s.add(blokken[j].id) }
    return s
  }, [doc.objs])
  const oppervlak = (o: Obj) => {
    if (o.kind === 'poly' && o.pts) { let a = 0; for (let i = 0; i < o.pts.length; i++) { const [x1, y1] = o.pts[i], [x2, y2] = o.pts[(i + 1) % o.pts.length]; a += x1 * y2 - x2 * y1 } return Math.abs(a / 2) }
    if (o.kind === 'ellipse') return Math.PI * o.w * o.h / 4
    return o.w * o.h
  }
  const lijnLengte = (pts: Pt[]) => pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0)

  // ---- tekenen ----
  const lbl = (o: Obj) => o.kind === 'partner' ? (partnerById[o.partnerId!] ? bnaam(partnerById[o.partnerId!]) : 'Partner (verwijderd)') : (o.label || '')
  const kleur = (o: Obj) => o.kind === 'partner' ? (o.color || (partnerById[o.partnerId!] ? maatVan(partnerById[o.partnerId!]).kleur : '#999')) : (o.color || '#8b8574')
  const sw = 1 / view.s // 1 schermpixel in meters

  const renderObj = (o: Obj) => {
    const c = kleur(o), isSel = sel.includes(o.id), fout = overlappers.has(o.id)
    if (o.kind === 'line') return (
      <g key={o.id}>
        <polyline points={o.pts!.map(p => p.join(',')).join(' ')} fill="none" stroke={c} strokeWidth={o.dik || 0.2} strokeLinecap="square" strokeLinejoin="miter" />
        {toonMaten && view.s > 6 && o.pts!.slice(1).map((p, i) => { const a = o.pts![i]; const l = Math.hypot(p[0] - a[0], p[1] - a[1]); return l > 1 ? <text data-ui key={i} x={(a[0] + p[0]) / 2} y={(a[1] + p[1]) / 2 - 0.35} fontSize={11 * sw} textAnchor="middle" fill="#9b3737" fontFamily="Inter">{fmt(l)}</text> : null })}
      </g>
    )
    if (o.kind === 'poly') {
      const b = bbox(o.pts!)
      return (
        <g key={o.id}>
          <polygon points={o.pts!.map(p => p.join(',')).join(' ')} fill={c} fillOpacity={0.55} stroke="#010341" strokeOpacity={0.4} strokeWidth={sw} />
          {o.label && <text x={(b.x1 + b.x2) / 2} y={(b.y1 + b.y2) / 2} fontSize={Math.min(1.4, (b.x2 - b.x1) / 8)} textAnchor="middle" dominantBaseline="middle" fill="#010341" fillOpacity={0.6} fontFamily="Fraunces, Georgia, serif">{o.label}</text>}
        </g>
      )
    }
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2
    const tr = `rotate(${o.rot} ${cx} ${cy})`
    if (o.kind === 'text') return (
      <text key={o.id} x={o.x} y={o.y + (o.tekstgrootte || 1)} transform={tr} fontSize={o.tekstgrootte || 1} fill={c} fontFamily="Fraunces, Georgia, serif" fontWeight={600}>{o.label}</text>
    )
    const tekst = lbl(o)
    // labelgrootte past zich aan het blok aan, en draait mee maar staat nooit op z'n kop
    const leesRot = o.rot > 90 && o.rot <= 270 ? 180 : 0
    const staand = o.h > o.w * 1.3
    const fs = Math.max(0.25, Math.min(o.h * 0.32, (staand ? o.h : o.w) / Math.max(4, tekst.length * 0.62), 1.1))
    return (
      <g key={o.id} transform={tr}>
        {o.kind === 'ellipse'
          ? <ellipse cx={cx} cy={cy} rx={o.w / 2} ry={o.h / 2} fill={c} fillOpacity={0.85} />
          : <rect x={o.x} y={o.y} width={o.w} height={o.h} fill={c} fillOpacity={o.kind === 'rect' ? 0.35 : 0.92} stroke={o.kind === 'rect' ? c : 'none'} strokeWidth={sw} rx={o.kind === 'partner' || o.kind === 'voorziening' ? Math.min(o.w, o.h) * 0.06 : 0} />}
        {o.kind === 'partner' && <rect x={o.x} y={o.y + o.h - Math.min(0.35, o.h * 0.15)} width={o.w} height={Math.min(0.35, o.h * 0.15)} fill="#000" fillOpacity={0.18} />}
        {tekst && <text x={cx} y={cy} transform={`rotate(${leesRot + (staand ? -90 : 0)} ${cx} ${cy})`} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill={o.kind === 'rect' ? '#010341' : '#fff'} fontFamily="Inter, sans-serif" fontWeight={600}>{tekst}</text>}
        {toonMaten && view.s > 10 && (o.kind === 'partner' || o.kind === 'voorziening') && <text data-ui x={cx} y={cy + fs * 1.1} transform={`rotate(${leesRot + (staand ? -90 : 0)} ${cx} ${cy})`} fontSize={Math.min(fs * 0.7, 0.5)} textAnchor="middle" dominantBaseline="middle" fill="#fff" fillOpacity={0.8} fontFamily="Inter">{r2(o.w)} × {r2(o.h)}</text>}
        {fout && <rect data-ui x={o.x} y={o.y} width={o.w} height={o.h} fill="none" stroke="#e53935" strokeWidth={2.5 * sw} strokeDasharray={`${5 * sw} ${3 * sw}`} />}
        {isSel && <rect data-ui x={o.x} y={o.y} width={o.w} height={o.h} fill="none" stroke="#2b6cb0" strokeWidth={1.5 * sw} />}
      </g>
    )
  }

  const handles = () => {
    if (gesel.length !== 1 || tool !== 'select') {
      if (gesel.length > 1) { const b = bbox(gesel.flatMap(hoeken)); return <rect data-ui x={b.x1} y={b.y1} width={b.x2 - b.x1} height={b.y2 - b.y1} fill="none" stroke="#2b6cb0" strokeWidth={sw} strokeDasharray={`${4 * sw} ${3 * sw}`} /> }
      return null
    }
    const o = gesel[0]; if (o.locked) return null
    const hs = 8 * sw
    if (o.pts) return <g data-ui>{o.pts.map((p, i) => <rect key={i} data-handle={'pt' + i} x={p[0] - hs / 2} y={p[1] - hs / 2} width={hs} height={hs} fill="#fff" stroke="#2b6cb0" strokeWidth={1.5 * sw} style={{ cursor: 'move' }} />)}</g>
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2
    const pos: [string, number, number, string][] = o.kind === 'partner' ? [] : [
      ['nw', o.x, o.y, 'nwse'], ['n', cx, o.y, 'ns'], ['ne', o.x + o.w, o.y, 'nesw'], ['e', o.x + o.w, cy, 'ew'],
      ['se', o.x + o.w, o.y + o.h, 'nwse'], ['s', cx, o.y + o.h, 'ns'], ['sw', o.x, o.y + o.h, 'nesw'], ['w', o.x, cy, 'ew']]
    return (
      <g data-ui transform={`rotate(${o.rot} ${cx} ${cy})`}>
        <line x1={cx} y1={o.y} x2={cx} y2={o.y - 22 * sw} stroke="#2b6cb0" strokeWidth={sw} />
        <circle data-handle="rot" cx={cx} cy={o.y - 22 * sw} r={5 * sw} fill="#fff" stroke="#2b6cb0" strokeWidth={1.5 * sw} style={{ cursor: 'grab' }} />
        {pos.map(([h, x, y, cur]) => <rect key={h} data-handle={h} x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} fill="#fff" stroke="#2b6cb0" strokeWidth={1.5 * sw} style={{ cursor: cur + '-resize' }} />)}
        {toonMaten && o.kind !== 'text' && <>
          <text x={cx} y={o.y + o.h + 16 * sw} fontSize={11 * sw} textAnchor="middle" fill="#2b6cb0" fontFamily="Inter" fontWeight={600}>{fmt(o.w)}</text>
          <text x={o.x + o.w + 8 * sw} y={cy} fontSize={11 * sw} dominantBaseline="middle" fill="#2b6cb0" fontFamily="Inter" fontWeight={600}>{fmt(o.h)}</text>
        </>}
      </g>
    )
  }

  // raster
  const [vw, vh] = (() => { const r = svgRef.current?.getBoundingClientRect(); return [r?.width || 1000, r?.height || 700] })()
  const rasterStap = (() => { let s = raster || 1; while (s * view.s < 8) s *= 2; return s })()
  const grootStap = (() => { let s = 1; while (s * view.s < 60) s *= s >= 5 ? 2 : 5; return s })()

  const conceptLabel = concept && concept.length >= 2 ? (() => {
    const a = concept[concept.length - 2], b = concept[concept.length - 1]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]), hoek = ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 360) % 360
    return { a, b, l, hoek, tot: lijnLengte(concept) }
  })() : null

  const cursor = tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : 'crosshair'
  const enkel = gesel.length === 1 ? gesel[0] : null

  // ---- UI ----
  const knop = (t: Tool, icoon: string, titel: string, sneltoets: string) => (
    <button key={t} title={`${titel} (${sneltoets})`} onClick={() => { setTool(t); setConcept(null) }}
      style={{ width: 38, height: 38, border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 16, background: tool === t ? 'var(--navy)' : 'transparent', color: tool === t ? 'var(--cream)' : 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span dangerouslySetInnerHTML={{ __html: icoon }} />
    </button>
  )
  const svgIcon = (d: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
  const mini: React.CSSProperties = { ...AS.input, padding: '5px 8px', fontSize: 12 }
  const klein: React.CSSProperties = { ...AS.btnSm, padding: '4px 9px', fontSize: 11.5 }

  const gefilterd = relevante.filter(p => !zoek || (p.naam + ' ' + (p.bedrijfsnaam || '')).toLowerCase().includes(zoek.toLowerCase()))
  const groepen = maten.filter(m => m.pakket !== 'personeel').map(m => ({ m, ps: gefilterd.filter(p => p.pakket === m.pakket) })).filter(g => g.ps.length)
  const zonderGroep = gefilterd.filter(p => !maten.some(m => m.pakket === p.pakket))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={AS.title}>Plattegrond</div>
          <div style={{ ...AS.sub, marginBottom: 0 }}>Teken op ware schaal. Partners verschijnen met hun eigen afmetingen, overlap kleurt rood.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={{ ...mini, width: 'auto', minWidth: 220 }} value={huidigId || ''} onChange={e => open(e.target.value)}>
            {!lijst.length && <option value="">Nog geen plattegrond</option>}
            {lijst.map(l => <option key={l.id} value={l.id}>{l.naam}</option>)}
          </select>
          <button style={{ ...AS.btn, marginTop: 0, padding: '7px 14px' }} onClick={nieuw}>Nieuwe plattegrond</button>
          {huidigId && <>
            <button style={klein} onClick={dupliceerPlattegrond}>Kopie</button>
            <button style={klein} onClick={() => { const n = prompt('Nieuwe naam', naam); if (n) { setNaam(n); setOpgeslagen('nee'); setLijst(l => l.map(x => x.id === huidigId ? { ...x, naam: n } : x)) } }}>Hernoem</button>
            <button style={klein} onClick={() => exporteer('svg')}>SVG voor Illustrator</button>
            <button style={klein} onClick={() => exporteer('png')}>PNG</button>
            <button style={{ ...klein, color: '#999', borderColor: '#ddd' }} onClick={verwijderPlattegrond}>Verwijder</button>
          </>}
          <span style={{ fontSize: 11.5, color: opgeslagen === 'ja' ? '#2e6b3a' : '#9a5b00', minWidth: 80 }}>{opgeslagen === 'ja' ? '✓ Opgeslagen' : opgeslagen === 'bezig' ? 'Opslaan…' : 'Wijzigingen…'}</span>
        </div>
      </div>

      {!huidigId ? (
        <div style={{ ...AS.card, textAlign: 'center', padding: 60 }}>
          <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 20, color: 'var(--navy)', marginBottom: 8 }}>Begin met een lege plattegrond</div>
          <div style={{ fontSize: 13, color: '#8b8574', marginBottom: 4 }}>Upload de plattegrond van de locatie, zet hem op schaal met één bekende maat en sleep de partners erop.</div>
          <button style={AS.btn} onClick={nieuw}>Nieuwe plattegrond</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 290px', gap: 10, height: 'calc(100vh - 190px)', minHeight: 560 }}>
          {/* gereedschap */}
          <div style={{ ...AS.card, padding: 5, margin: 0, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
            {knop('select', svgIcon('<path d="M5 3l14 8-6 2-3 6z"/>'), 'Selecteren', 'V')}
            {knop('hand', svgIcon('<path d="M8 13V5a1.5 1.5 0 013 0v6m0-1V3.5a1.5 1.5 0 013 0V11m0-5.5a1.5 1.5 0 013 0V13m0-4.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-2a6 6 0 01-5-3l-2.7-4.5a1.5 1.5 0 012.5-1.6L8 14"/>'), 'Schuiven', 'H of spatie')}
            <div style={{ height: 1, width: 26, background: '#e3dcc9', margin: '3px 0' }} />
            {knop('rect', svgIcon('<rect x="4" y="6" width="16" height="12" rx="1"/>'), 'Rechthoek', 'R')}
            {knop('ellipse', svgIcon('<ellipse cx="12" cy="12" rx="8" ry="6"/>'), 'Ellips / ronde tafel', 'E')}
            {knop('line', svgIcon('<path d="M4 20L20 4"/><circle cx="4" cy="20" r="1.5"/><circle cx="20" cy="4" r="1.5"/>'), 'Muur / lijn (dubbelklik = klaar, shift = haaks)', 'L')}
            {knop('poly', svgIcon('<path d="M4 18l3-12 9 2 4 9-9 3z"/>'), 'Vlak: zaal, terras, zone (klik op beginpunt = klaar)', 'P')}
            {knop('text', svgIcon('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'), 'Tekst', 'T')}
            <div style={{ height: 1, width: 26, background: '#e3dcc9', margin: '3px 0' }} />
            {knop('measure', svgIcon('<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>'), 'Meetlat', 'M')}
            <div style={{ flex: 1 }} />
            <button title="Ongedaan maken (⌘Z)" onClick={undo} style={{ ...klein, border: 'none', fontSize: 16 }}>↶</button>
            <button title="Opnieuw (⇧⌘Z)" onClick={redo} style={{ ...klein, border: 'none', fontSize: 16 }}>↷</button>
          </div>

          {/* canvas */}
          <div ref={wrapRef} style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(1,3,65,0.08)', background: '#fbf8f1' }}>
            <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block', cursor, touchAction: 'none', userSelect: 'none' }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={onDouble}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                const p = naarM(e.clientX, e.clientY)
                const pid = e.dataTransfer.getData('partner'), vk = e.dataTransfer.getData('voorziening')
                if (pid && partnerById[pid]) plaatsPartner(partnerById[pid], p)
                else if (vk) { const v = VOORZIENINGEN.find(x => x.key === vk); if (v) plaatsVoorziening(v, p) }
                else if (e.dataTransfer.files[0] && (e.dataTransfer.files[0].type.startsWith('image/') || e.dataTransfer.files[0].type === 'application/pdf')) kiesOnderlegger(e.dataTransfer.files[0])
              }}>
              <defs>
                <pattern id="r-klein" width={rasterStap * view.s} height={rasterStap * view.s} patternUnits="userSpaceOnUse" x={-view.x * view.s} y={-view.y * view.s}>
                  <path d={`M ${rasterStap * view.s} 0 L 0 0 0 ${rasterStap * view.s}`} fill="none" stroke="rgba(1,3,65,0.06)" strokeWidth="1" />
                </pattern>
                <pattern id="r-groot" width={grootStap * view.s} height={grootStap * view.s} patternUnits="userSpaceOnUse" x={-view.x * view.s} y={-view.y * view.s}>
                  <path d={`M ${grootStap * view.s} 0 L 0 0 0 ${grootStap * view.s}`} fill="none" stroke="rgba(1,3,65,0.13)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#r-klein)" />
              <rect width="100%" height="100%" fill="url(#r-groot)" />
              <g id="tekening" transform={`scale(${view.s}) translate(${-view.x} ${-view.y})`}>
                {doc.bg && <image data-bg="1" href={doc.bg.src} x={doc.bg.x} y={doc.bg.y} width={doc.bg.w} height={doc.bg.h} opacity={doc.bg.opacity} preserveAspectRatio="none" style={{ pointerEvents: doc.bg.locked ? 'none' : 'auto' }} />}
                {doc.objs.map(renderObj)}
                <g data-ui>
                  {handles()}
                  {gidsen.x !== undefined && <line x1={gidsen.x} x2={gidsen.x} y1={view.y} y2={view.y + vh / view.s} stroke="#e0338a" strokeWidth={sw} />}
                  {gidsen.y !== undefined && <line y1={gidsen.y} y2={gidsen.y} x1={view.x} x2={view.x + vw / view.s} stroke="#e0338a" strokeWidth={sw} />}
                  {marquee && (() => { const b = bbox([marquee.a, marquee.b]); return <rect x={b.x1} y={b.y1} width={b.x2 - b.x1} height={b.y2 - b.y1} fill="rgba(43,108,176,0.08)" stroke="#2b6cb0" strokeWidth={sw} /> })()}
                  {concept && tool === 'poly' && <polygon points={concept.map(p => p.join(',')).join(' ')} fill="rgba(43,108,176,0.12)" stroke="#2b6cb0" strokeWidth={1.5 * sw} strokeDasharray={`${4 * sw} ${3 * sw}`} />}
                  {concept && tool !== 'poly' && <polyline points={concept.map(p => p.join(',')).join(' ')} fill="none" stroke={tool === 'measure' ? '#e0338a' : tool === 'calibrate' ? '#d69e2e' : '#010341'} strokeWidth={tool === 'line' ? 0.2 : 2 * sw} strokeDasharray={tool === 'line' ? undefined : `${6 * sw} ${3 * sw}`} />}
                  {concept && concept.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3.5 * sw} fill="#fff" stroke="#2b6cb0" strokeWidth={1.5 * sw} />)}
                  {conceptLabel && conceptLabel.l > 0.01 && (
                    <g transform={`translate(${conceptLabel.b[0] + 12 * sw} ${conceptLabel.b[1] - 12 * sw})`}>
                      <rect x={0} y={-16 * sw} width={(tool === 'poly' || tool === 'line') && concept!.length > 2 ? 150 * sw : 96 * sw} height={22 * sw} rx={5 * sw} fill="#010341" />
                      <text x={8 * sw} y={-1 * sw} fontSize={12 * sw} fill="#fff" fontFamily="Inter" fontWeight={600}>{fmt(conceptLabel.l)} · {Math.round(conceptLabel.hoek)}°{(tool === 'line' || tool === 'poly') && concept!.length > 2 ? `  Σ ${fmt(conceptLabel.tot)}` : ''}</text>
                    </g>
                  )}
                </g>
              </g>
            </svg>

            {/* schaalbalk en coördinaten */}
            <div style={{ position: 'absolute', left: 12, bottom: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: '#777162', fontFamily: 'Inter', pointerEvents: 'none' }}>
              <div>
                <div style={{ width: grootStap * view.s, height: 6, borderLeft: '2px solid #010341', borderRight: '2px solid #010341', borderBottom: '2px solid #010341' }} />
                <div style={{ textAlign: 'center', marginTop: 2 }}>{grootStap} m</div>
              </div>
              <span style={{ background: 'rgba(255,255,255,0.8)', padding: '2px 6px', borderRadius: 5 }}>x {r2(muis[0])} · y {r2(muis[1])} m</span>
            </div>
            <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', gap: 4, background: 'rgba(255,255,255,0.92)', borderRadius: 10, padding: 4, boxShadow: '0 2px 10px rgba(1,3,65,0.08)', alignItems: 'center' }}>
              <button style={{ ...klein, border: 'none' }} onClick={() => zoomStap(1 / 1.3)}>−</button>
              <span style={{ fontSize: 11, color: '#777162', minWidth: 54, textAlign: 'center' }}>1 m = {Math.round(view.s)} px</span>
              <button style={{ ...klein, border: 'none' }} onClick={() => zoomStap(1.3)}>+</button>
              <button style={{ ...klein, border: 'none' }} onClick={passend} title="⌘0">Passend</button>
            </div>
            <div style={{ position: 'absolute', left: 10, top: 10, display: 'flex', gap: 10, background: 'rgba(255,255,255,0.92)', borderRadius: 10, padding: '6px 10px', fontSize: 11.5, color: 'var(--navy)', boxShadow: '0 2px 10px rgba(1,3,65,0.08)', alignItems: 'center' }}>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> Magnetisch</label>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>raster
                <select value={raster} onChange={e => setRaster(parseFloat(e.target.value))} style={{ fontSize: 11.5, border: '1px solid #e3dcc9', borderRadius: 6, padding: '1px 3px' }}>
                  {[0.1, 0.25, 0.5, 1, 2, 5].map(v => <option key={v} value={v}>{String(v).replace('.', ',')} m</option>)}
                </select></label>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={toonMaten} onChange={e => setToonMaten(e.target.checked)} /> Maten</label>
              {overlappers.size > 0 && <span style={{ color: '#e53935', fontWeight: 600 }}>⚠ {overlappers.size} blokken overlappen</span>}
            </div>
            {tool !== 'select' && tool !== 'hand' && (
              <div style={{ position: 'absolute', left: '50%', top: 10, transform: 'translateX(-50%)', background: 'var(--navy)', color: 'var(--cream)', fontSize: 12, padding: '6px 12px', borderRadius: 8, pointerEvents: 'none' }}>
                {{ rect: 'Sleep een rechthoek. Shift = vierkant.', ellipse: 'Sleep een ellips. Shift = cirkel.', line: 'Klik punten voor een muur. Shift = haaks, dubbelklik of Esc = klaar.', poly: 'Klik de hoeken van een zone. Klik op het beginpunt of Enter om te sluiten.', text: 'Klik waar de tekst moet komen.', measure: 'Klik twee punten om te meten. Esc = stoppen.', calibrate: 'Trek een lijn over een maat die je kent, bijvoorbeeld een muur.' }[tool]}
              </div>
            )}
          </div>

          {/* rechterpaneel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
            {/* eigenschappen */}
            {enkel ? (
              <div style={{ ...AS.card, margin: 0, padding: '14px 16px' }}>
                <div style={{ ...AS.cardTitle, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{enkel.kind === 'partner' ? lbl(enkel) : ({ rect: 'Rechthoek', ellipse: 'Ellips', line: 'Muur / lijn', poly: 'Vlak', text: 'Tekst', voorziening: enkel.label || 'Voorziening', partner: '' }[enkel.kind])}</span>
                  <span style={{ fontWeight: 400, color: '#8b8574', fontSize: 11.5 }}>{enkel.kind === 'line' ? fmt(lijnLengte(enkel.pts!)) : `${r2(oppervlak(enkel))} m²`}</span>
                </div>
                {blok(enkel.kind) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {([['x', 'X'], ['y', 'Y'], ['w', 'Breedte'], ['h', 'Diepte'], ['rot', 'Draaiing °']] as [keyof Obj, string][]).map(([k, l]) => (
                      <label key={k} style={{ fontSize: 11, color: '#777162' }}>{l}
                        <input style={mini} type="number" step={k === 'rot' ? 15 : 0.1} value={r2(enkel[k] as number)} disabled={enkel.locked || (enkel.kind === 'partner' && (k === 'w' || k === 'h'))}
                          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) wijzig([enkel.id], o => ({ ...o, [k]: k === 'w' || k === 'h' ? Math.max(0.1, v) : v })) }} />
                      </label>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                      <button style={klein} onClick={() => draai(-90)} title="Q met shift = -15°">⟲</button>
                      <button style={klein} onClick={() => draai(90)} title="Q">⟳ 90°</button>
                    </div>
                  </div>
                )}
                {enkel.kind === 'partner' && <div style={{ fontSize: 11, color: '#8b8574', marginTop: 6 }}>Maat komt van de partner. Aanpassen kan in de lijst hieronder.</div>}
                {enkel.kind === 'line' && <label style={{ fontSize: 11, color: '#777162', display: 'block', marginTop: 4 }}>Dikte (m)
                  <input style={mini} type="number" step={0.05} value={enkel.dik || 0.2} onChange={e => wijzig([enkel.id], o => ({ ...o, dik: Math.max(0.01, parseFloat(e.target.value) || 0.2) }))} /></label>}
                {enkel.kind === 'text' && <label style={{ fontSize: 11, color: '#777162', display: 'block', marginTop: 4 }}>Lettergrootte (m)
                  <input style={mini} type="number" step={0.1} value={enkel.tekstgrootte || 1} onChange={e => wijzig([enkel.id], o => ({ ...o, tekstgrootte: Math.max(0.1, parseFloat(e.target.value) || 1) }))} /></label>}
                {enkel.kind !== 'partner' && <label style={{ fontSize: 11, color: '#777162', display: 'block', marginTop: 4 }}>Label
                  <input style={mini} value={enkel.label || ''} onChange={e => wijzig([enkel.id], o => ({ ...o, label: e.target.value }), false)} onBlur={() => setOpgeslagen('nee')} /></label>}
                <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {['#9b3737', '#c9a24b', '#2e6b3a', '#010341', '#5b6b8c', '#8b8574', '#d9cfb8', '#2b6cb0', '#b3261e'].map(c => (
                    <button key={c} onClick={() => wijzig([enkel.id], o => ({ ...o, color: c }))} style={{ width: 18, height: 18, borderRadius: 5, border: kleur(enkel) === c ? '2px solid #2b6cb0' : '1px solid rgba(0,0,0,0.1)', background: c, cursor: 'pointer', padding: 0 }} />
                  ))}
                  <input type="color" value={kleur(enkel)} onChange={e => wijzig([enkel.id], o => ({ ...o, color: e.target.value }), false)} style={{ width: 22, height: 20, border: 'none', padding: 0, background: 'none' }} />
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
                  <button style={klein} onClick={() => laag('boven')}>Naar voren</button>
                  <button style={klein} onClick={() => laag('onder')}>Naar achteren</button>
                  <button style={klein} onClick={() => wijzig([enkel.id], o => ({ ...o, locked: !o.locked }))}>{enkel.locked ? 'Ontgrendel' : 'Vergrendel'}</button>
                  {enkel.kind !== 'partner' && <button style={klein} onClick={dupliceer}>Kopie</button>}
                  <button style={{ ...klein, color: '#b3261e' }} onClick={verwijder}>{enkel.kind === 'partner' ? 'Van kaart' : 'Wis'}</button>
                </div>
              </div>
            ) : gesel.length > 1 ? (
              <div style={{ ...AS.card, margin: 0, padding: '14px 16px' }}>
                <div style={{ ...AS.cardTitle, marginBottom: 8 }}>{gesel.length} objecten</div>
                <div style={{ fontSize: 11, color: '#777162', marginBottom: 4 }}>Uitlijnen</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {([['links', '⇤'], ['hmidden', '↔'], ['rechts', '⇥'], ['boven', '⤒'], ['vmidden', '↕'], ['onder', '⤓']] as const).map(([k, i]) => <button key={k} style={klein} title={k} onClick={() => lijnUit(k)}>{i}</button>)}
                </div>
                {gesel.length > 2 && <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  <button style={klein} onClick={() => lijnUit('hverdeel')}>Verdeel horizontaal</button>
                  <button style={klein} onClick={() => lijnUit('vverdeel')}>Verdeel verticaal</button>
                </div>}
                <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
                  <button style={klein} onClick={() => draai(90)}>Draai 90°</button>
                  <button style={klein} onClick={dupliceer}>Kopie</button>
                  <button style={{ ...klein, color: '#b3261e' }} onClick={verwijder}>Wis</button>
                </div>
              </div>
            ) : (
              <div style={{ ...AS.card, margin: 0, padding: '14px 16px' }}>
                <div style={{ ...AS.cardTitle, marginBottom: 6 }}>Upload plattegrond locatie</div>
                {doc.bg ? <>
                  <label style={{ fontSize: 11, color: '#777162' }}>Doorzichtigheid
                    <input type="range" min={0.05} max={1} step={0.05} value={doc.bg.opacity} onChange={e => setDoc(d => d.bg ? { ...d, bg: { ...d.bg, opacity: parseFloat(e.target.value) } } : d, false)} style={{ width: '100%' }} /></label>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <button style={klein} onClick={() => setTool('calibrate')}>Op schaal zetten</button>
                    <button style={klein} onClick={() => setDoc(d => d.bg ? { ...d, bg: { ...d.bg, locked: !d.bg.locked } } : d)}>{doc.bg.locked ? 'Ontgrendel' : 'Vergrendel'}</button>
                    <button style={{ ...klein, color: '#999' }} onClick={() => setDoc(d => ({ ...d, bg: null }))}>Weg</button>
                  </div>
                  <div style={{ fontSize: 11, color: '#8b8574', marginTop: 6 }}>{fmt(doc.bg.w)} × {fmt(doc.bg.h)}</div>
                </> : <>
                  <div style={{ fontSize: 12, color: '#8b8574', marginBottom: 6 }}>PDF, PNG of JPG van de locatie. Hij komt onder je tekening te liggen, zodat je kunt overtrekken.</div>
                  <label style={{ ...klein, display: 'inline-block', cursor: 'pointer' }}>Afbeelding kiezen
                    <input type="file" accept="image/*,application/pdf,.pdf" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && kiesOnderlegger(e.target.files[0])} /></label>
                </>}
                <div style={{ fontSize: 10.5, color: '#a39d8c', marginTop: 10, lineHeight: 1.5 }}>
                  Sneltoetsen: V selecteer · R rechthoek · L muur · P vlak · M meet · Q draai · ⌘D kopie · alt-slepen kopie · pijltjes 10 cm (shift 1 m) · [ ] lagen · ⌘0 passend · spatie ingedrukt = schuiven
                </div>
              </div>
            )}

            {/* checklist */}
            <div style={{ ...AS.card, margin: 0, padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(1,3,65,0.07)' }}>
                {([['partners', `Partners ${relevante.filter(p => geplaatst.has(p.id)).length}/${relevante.length}`], ['voorzieningen', 'Voorzieningen'], ['lagen', 'Lagen']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setZijTab(k)} style={{ flex: 1, padding: '10px 4px', border: 'none', background: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: zijTab === k ? 'var(--navy)' : '#a39d8c', borderBottom: zijTab === k ? '2px solid var(--bordeaux)' : '2px solid transparent' }}>{l}</button>
                ))}
              </div>
              <div style={{ overflowY: 'auto', padding: '10px 12px', flex: 1 }}>
                {zijTab === 'partners' && <>
                  <div style={{ height: 5, background: '#efe9da', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${relevante.length ? (relevante.filter(p => geplaatst.has(p.id)).length / relevante.length) * 100 : 0}%`, background: '#2e6b3a', transition: 'width .3s' }} />
                  </div>
                  <input style={{ ...mini, marginBottom: 8 }} placeholder="Zoek partner…" value={zoek} onChange={e => setZoek(e.target.value)} />
                  {[...groepen, ...(zonderGroep.length ? [{ m: { pakket: '?', label: 'Overig', breedte_m: 3, diepte_m: 2, kleur: '#999' } as Maat, ps: zonderGroep }] : [])].map(({ m, ps }) => (
                    <div key={m.pakket} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#777162', marginBottom: 4 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: m.kleur }} />
                        <span style={{ flex: 1 }}>{m.label} ({ps.filter(p => geplaatst.has(p.id)).length}/{ps.length})</span>
                        {m.pakket !== '?' && <span style={{ fontWeight: 400 }} title="Standaardmaat voor dit pakket">
                          std <input defaultValue={m.breedte_m} onBlur={e => slaStandaardOp(m, 'breedte_m', e.target.value)} style={{ width: 30, fontSize: 11, border: '1px solid #e3dcc9', borderRadius: 4, padding: '0 2px' }} />×<input defaultValue={m.diepte_m} onBlur={e => slaStandaardOp(m, 'diepte_m', e.target.value)} style={{ width: 30, fontSize: 11, border: '1px solid #e3dcc9', borderRadius: 4, padding: '0 2px' }} /></span>}
                      </div>
                      {ps.map(p => {
                        const op = geplaatst.has(p.id), mt = maatVan(p)
                        return (
                          <div key={p.id} draggable={!op} onDragStart={e => e.dataTransfer.setData('partner', p.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 7, cursor: op ? 'pointer' : 'grab', background: op ? 'transparent' : '#fbf8f1', marginBottom: 2, border: op ? '1px solid transparent' : '1px dashed #e3dcc9' }}
                            onClick={() => plaatsPartner(p)}>
                            <span style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', background: op ? '#2e6b3a' : 'transparent', border: op ? 'none' : '1.5px solid #c9c1ab' }}>{op ? '✓' : ''}</span>
                            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--navy)', opacity: op ? 0.6 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.naam}>{bnaam(p)}</span>
                            <span onClick={e => e.stopPropagation()} style={{ fontSize: 10.5, color: mt.eigen ? '#2e6b3a' : '#a39d8c', whiteSpace: 'nowrap' }} title={mt.eigen ? 'Door partner ingevuld' : 'Standaardmaat, nog niet ingevuld door partner'}>
                              <input defaultValue={p.stand_breedte_m ?? ''} placeholder={String(mt.w)} onBlur={e => e.target.value !== String(p.stand_breedte_m ?? '') && slaMaatOp(p, e.target.value, String(p.stand_diepte_m ?? ''))} style={{ width: 28, fontSize: 10.5, border: '1px solid #eee5d2', borderRadius: 4, padding: '0 2px', textAlign: 'right' }} />×<input defaultValue={p.stand_diepte_m ?? ''} placeholder={String(mt.h)} onBlur={e => e.target.value !== String(p.stand_diepte_m ?? '') && slaMaatOp(p, String(p.stand_breedte_m ?? ''), e.target.value)} style={{ width: 28, fontSize: 10.5, border: '1px solid #eee5d2', borderRadius: 4, padding: '0 2px' }} />
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                  <div style={{ fontSize: 10.5, color: '#a39d8c', lineHeight: 1.5 }}>Sleep een partner op de kaart of klik erop. Groene maat = door de partner zelf ingevuld, grijs = standaardmaat van het pakket.</div>
                </>}
                {zijTab === 'voorzieningen' && <>
                  {VOORZIENINGEN.map(v => {
                    const n = doc.objs.filter(o => o.voorziening === v.key).length
                    return (
                      <div key={v.key} draggable onDragStart={e => e.dataTransfer.setData('voorziening', v.key)} onClick={() => plaatsVoorziening(v)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px', borderRadius: 7, cursor: 'grab', marginBottom: 2, border: '1px dashed #e3dcc9', background: n ? 'transparent' : '#fbf8f1' }}>
                        <span style={{ width: 16, height: 16, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', background: n ? '#2e6b3a' : 'transparent', border: n ? 'none' : '1.5px solid #c9c1ab' }}>{n ? (n > 1 ? n : '✓') : ''}</span>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: v.color }} />
                        <span style={{ flex: 1, fontSize: 12.5, color: 'var(--navy)' }}>{v.label}</span>
                        <span style={{ fontSize: 10.5, color: '#a39d8c' }}>{v.w}×{v.h}</span>
                      </div>
                    )
                  })}
                  <div style={{ fontSize: 10.5, color: '#a39d8c', marginTop: 6, lineHeight: 1.5 }}>Vinkje = staat op de kaart. Zo vergeet je geen nooduitgang of EHBO.</div>
                </>}
                {zijTab === 'lagen' && <>
                  {[...doc.objs].reverse().map(o => (
                    <div key={o.id} onClick={() => { if (!o.locked) setSel([o.id]); centreerOp(o) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', background: sel.includes(o.id) ? 'rgba(43,108,176,0.1)' : 'transparent', fontSize: 12, color: 'var(--navy)' }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: kleur(o) }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lbl(o) || { rect: 'Rechthoek', ellipse: 'Ellips', line: 'Muur', poly: 'Vlak', text: 'Tekst', voorziening: 'Voorziening', partner: 'Partner' }[o.kind]}</span>
                      <button onClick={e => { e.stopPropagation(); wijzig([o.id], q => ({ ...q, locked: !q.locked })); setSel(s => s.filter(i => i !== o.id)) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, opacity: o.locked ? 1 : 0.3 }} title="Vergrendel">🔒</button>
                    </div>
                  ))}
                  {!doc.objs.length && <div style={{ fontSize: 12, color: '#a39d8c' }}>Nog leeg.</div>}
                </>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function puntInPoly([x, y]: Pt, poly: Pt[]) {
  let binnen = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) binnen = !binnen
  }
  return binnen
}
function afstandTotLijn(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}
// Shift: vastklikken op 0/45/90 graden
function haaks(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy)
  const hoek = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  return [a[0] + Math.cos(hoek) * l, a[1] + Math.sin(hoek) * l]
}

'use client'
// Plattegrond-tekenaar: technische tekening op ware schaal. Alles rekent in
// METERS. De tekening is een SVG, dus export gaat 1 op 1 naar Illustrator.
//
// Werkt zoals Illustrator: dezelfde sneltoetsen (V A M L \ P T H Z I),
// lagen, groeperen, vergrendelen/verbergen, linialen met hulplijnen,
// slimme hulplijnen met afstanden, vulling/lijn/dekking, pipet,
// nogmaals transformeren (⌘D), verplaatsen-dialoog (Enter), plakken
// vóór/achter (⌘F/⌘B). Plus eventspecifiek: partners op hun eigen maat,
// materialenbibliotheek met iconen, hekwerk dat zichzelf telt, nummering,
// automatische legenda, materiaallijst en PDF-export op schaal (A3).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS } from './ui'
import { MATERIALEN, MATERIAAL, CATEGORIEEN, OUDE_VOORZIENING, type Materiaal } from './plattegrondMaterialen'

type Pt = [number, number]
type Kind = 'rect' | 'ellipse' | 'line' | 'poly' | 'text' | 'partner' | 'materiaal' | 'hek' | 'legenda' | 'voorziening'
type Obj = {
  id: string; kind: Kind
  x: number; y: number; w: number; h: number; rot: number
  pts?: Pt[]
  label?: string
  color?: string      // vulling (bij lijn: lijnkleur)
  lijn?: string        // lijnkleur, 'none' = geen
  lijnDik?: number     // meters
  streep?: boolean
  dekking?: number     // 0..1
  hoek?: number        // hoekradius in meters
  locked?: boolean; verborgen?: boolean
  groep?: string; laag?: string
  nr?: number
  partnerId?: string; mat?: string; voorziening?: string
  dik?: number; tekstgrootte?: number
  toonLabel?: boolean
}
type Laag = { id: string; naam: string; zichtbaar: boolean; vast: boolean }
type Bg = { src: string; x: number; y: number; w: number; h: number; opacity: number; locked: boolean }
type Doc = { objs: Obj[]; bg?: Bg | null; lagen?: Laag[]; gidsen?: { x: number[]; y: number[] }; nrGrootte?: number }
type PartnerRij = { id: string; naam: string; bedrijfsnaam: string | null; pakket: string; type: string; stand_breedte_m: number | null; stand_diepte_m: number | null; barlocatie: string | null }
type Maat = { pakket: string; label: string; breedte_m: number; diepte_m: number; kleur: string }
type Tool = 'select' | 'direct' | 'rect' | 'ellipse' | 'line' | 'pen' | 'text' | 'measure' | 'calibrate' | 'hand' | 'zoom' | 'pipet' | 'nummer' | 'hek'

const uid = () => Math.random().toString(36).slice(2, 10)
const r2 = (v: number) => Math.round(v * 100) / 100
const fmt = (v: number) => r2(v).toLocaleString('nl-NL', { maximumFractionDigits: 2 }) + ' m'
const STANDAARD_LAGEN: Laag[] = [
  { id: 'locatie', naam: 'Locatie', zichtbaar: true, vast: false },
  { id: 'infra', naam: 'Infra (stroom, hekken, sanitair)', zichtbaar: true, vast: false },
  { id: 'partners', naam: 'Partners', zichtbaar: true, vast: false },
  { id: 'teksten', naam: 'Teksten & legenda', zichtbaar: true, vast: false },
]
const leeg: Doc = { objs: [], bg: null, lagen: STANDAARD_LAGEN, gidsen: { x: [], y: [] } }
const bnaam = (p: { naam: string; bedrijfsnaam: string | null }) => (p.bedrijfsnaam || '').trim() || p.naam
// Blokken waar andere dingen in mogen staan, die tellen niet mee voor overlap
const OMHULLEND = new Set(['tent3', 'tent3x6', 'tent5', 'tent6x12', 'tent10x20', 'stretchtent', 'terras', 'verzamel', 'podium'])
const KLEUREN = ['#9b3737', '#c9a24b', '#2e6b3a', '#010341', '#5b6b8c', '#8b8574', '#d9cfb8', '#2b6cb0', '#c53030', '#d69e2e', '#4a5568', '#ffffff']

// ---- geometrie ----
const isBlok = (k: Kind) => k === 'rect' || k === 'ellipse' || k === 'partner' || k === 'materiaal' || k === 'text' || k === 'legenda' || k === 'voorziening'
const hoeken = (o: Obj): Pt[] => {
  if (o.pts) return o.pts
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2, a = (o.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return ([[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]] as Pt[]).map(([x, y]) => {
    const dx = x - cx, dy = y - cy
    return [cx + dx * c - dy * s, cy + dx * s + dy * c] as Pt
  })
}
const bbox = (pts: Pt[]) => {
  if (!pts.length) return { x1: 0, y1: 0, x2: 0, y2: 0 }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }
}
const overlapt = (a: Pt[], b: Pt[]) => {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i], p2 = poly[(i + 1) % poly.length]
    const nx = p2[1] - p1[1], ny = p1[0] - p2[0]
    const pa = a.map(p => p[0] * nx + p[1] * ny), pb = b.map(p => p[0] * nx + p[1] * ny)
    if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false
  }
  return true
}
const draaiPunt = ([x, y]: Pt, [cx, cy]: Pt, graden: number): Pt => {
  const a = (graden * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]
}
const lengte = (pts: Pt[]) => pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0)
const hekStuks = (o: Obj) => { const m = MATERIAAL[o.mat || '']; return m?.stuk ? Math.max(1, Math.ceil(lengte(o.pts || []) / m.stuk - 0.01)) : 0 }

// Oude documenten (eerste versie) bijwerken naar het huidige formaat
const migreer = (d: Doc): Doc => {
  const lagen = d.lagen?.length ? d.lagen : STANDAARD_LAGEN
  const objs = (d.objs || []).map(o => {
    let n = o
    if (o.kind === 'voorziening') n = { ...o, kind: 'materiaal', mat: OUDE_VOORZIENING[o.voorziening || ''] || 'bord', toonLabel: true }
    if (!n.laag || !lagen.some(l => l.id === n.laag)) n = { ...n, laag: n.kind === 'partner' ? (lagen.find(l => l.id === 'partners')?.id || lagen[0].id) : n.kind === 'poly' || n.kind === 'line' ? lagen[0].id : (lagen.find(l => l.id === 'infra')?.id || lagen[0].id) }
    return n
  })
  return { ...d, objs, lagen, gidsen: d.gidsen || { x: [], y: [] } }
}

export default function Plattegrond({ flash, demo }: { flash: (m: string, ms?: number) => void; demo?: { partners: PartnerRij[]; maten: Maat[] } }) {
  // ---- data ----
  const [lijst, setLijst] = useState<{ id: string; naam: string; updated_at: string }[]>([])
  const [huidigId, setHuidigId] = useState<string | null>(null)
  const [naam, setNaam] = useState('')
  const [doc, setDocRaw] = useState<Doc>(leeg)
  const docRef = useRef(doc); docRef.current = doc
  const [partners, setPartners] = useState<PartnerRij[]>([])
  const [maten, setMaten] = useState<Maat[]>([])
  const [opgeslagen, setOpgeslagen] = useState<'ja' | 'bezig' | 'nee'>('ja')
  const hist = useRef<{ past: Doc[]; future: Doc[] }>({ past: [], future: [] })

  // ---- editor ----
  const [tool, setToolRaw] = useState<Tool>('select')
  const [hekMat, setHekMat] = useState('bouwhek')
  const [sel, setSel] = useState<string[]>([])
  const [view, setView] = useState({ x: -5, y: -5, s: 14 })
  const [raster, setRaster] = useState(0.5)
  const [snap, setSnap] = useState(true)
  const [toonMaten, setToonMaten] = useState(true)
  const [linialen, setLinialen] = useState(true)
  const [toonGidsen, setToonGidsen] = useState(true)
  const [slim, setSlim] = useState(true)
  const [concept, setConcept] = useState<Pt[] | null>(null)
  const [muis, setMuis] = useState<Pt>([0, 0])
  const [gidsen, setGidsen] = useState<{ x?: number; y?: number; afst?: { a: Pt; b: Pt; l: number }[] }>({})
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null)
  const [nieuweGids, setNieuweGids] = useState<{ as: 'x' | 'y'; v: number } | null>(null)
  const [zoek, setZoek] = useState('')
  const [matZoek, setMatZoek] = useState('')
  const [zijTab, setZijTab] = useState<'partners' | 'materialen' | 'lagen' | 'lijst'>('partners')
  const [actieveLaag, setActieveLaag] = useState('infra')
  const [tekstEdit, setTekstEdit] = useState<{ id: string; waarde: string } | null>(null)
  const [verplaatsDlg, setVerplaatsDlg] = useState<{ dx: string; dy: string } | null>(null)
  const [nrVolgende, setNrVolgende] = useState(1)
  const [alt, setAlt] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<null | { type: string; start: Pt; orig: Obj[]; pre: Doc; handle?: string; screen?: Pt; view?: typeof view; extra?: unknown; kopie?: boolean }>(null)
  const klembord = useRef<Obj[]>([])
  const spatie = useRef(false)
  const meetVast = useRef(false)
  const laatsteTransform = useRef<{ dx: number; dy: number; kopie: boolean } | null>(null)

  const setTool = (t: Tool) => { setToolRaw(t); setConcept(null); meetVast.current = false }
  const lagen = doc.lagen || STANDAARD_LAGEN
  const laagIdx = useMemo(() => Object.fromEntries(lagen.map((l, i) => [l.id, i])), [lagen])
  const laagVan = (o: Obj) => lagen.find(l => l.id === o.laag) || lagen[0]

  const setDoc = useCallback((upd: Doc | ((d: Doc) => Doc), geschiedenis = true) => {
    const oud = docRef.current
    const nieuw = typeof upd === 'function' ? upd(oud) : upd
    if (nieuw === oud) return
    if (geschiedenis) { hist.current.past.push(oud); if (hist.current.past.length > 200) hist.current.past.shift(); hist.current.future = [] }
    docRef.current = nieuw
    setDocRaw(nieuw)
    setOpgeslagen('nee')
  }, [])
  const undo = () => { const p = hist.current.past.pop(); if (!p) return; hist.current.future.push(docRef.current); docRef.current = p; setDocRaw(p); setOpgeslagen('nee') }
  const redo = () => { const f = hist.current.future.pop(); if (!f) return; hist.current.past.push(docRef.current); docRef.current = f; setDocRaw(f); setOpgeslagen('nee') }

  // ---- laden ----
  const laadLijst = useCallback(async () => {
    const { data } = await supabase.from('plattegronden').select('id,naam,updated_at').order('updated_at', { ascending: false })
    setLijst(data || [])
    return data || []
  }, [])
  const open = useCallback(async (id: string) => {
    const { data, error } = await supabase.from('plattegronden').select('*').eq('id', id).single()
    if (error || !data) { flash('Kon plattegrond niet openen'); return }
    const d = migreer(Object.assign({ objs: [], bg: null }, data.data) as Doc)
    setHuidigId(id); setNaam(data.naam); docRef.current = d; setDocRaw(d); hist.current = { past: [], future: [] }; setSel([]); setOpgeslagen('ja')
    setNrVolgende(Math.max(0, ...d.objs.map(o => o.nr || 0)) + 1)
    try { localStorage.setItem('nvdw-plattegrond', id) } catch { }
  }, [flash])
  useEffect(() => {
    if (demo) { setPartners(demo.partners); setMaten(demo.maten); setLijst([{ id: 'demo', naam: 'Demo', updated_at: '' }]); setHuidigId('demo'); setNaam('Demo'); return }
    (async () => {
      const [{ data: p }, { data: m }] = await Promise.all([
        supabase.from('partners').select('id,naam,bedrijfsnaam,pakket,type,stand_breedte_m,stand_diepte_m,barlocatie'),
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
    const l = await laadLijst(); setHuidigId(null); docRef.current = leeg; setDocRaw(leeg)
    if (l[0]) open(l[0].id)
  }

  // autosave
  useEffect(() => {
    if (!huidigId || opgeslagen !== 'nee' || demo || drag.current) return
    const t = setTimeout(async () => {
      setOpgeslagen('bezig')
      const { error } = await supabase.from('plattegronden').update({ data: docRef.current, naam, updated_at: new Date().toISOString() }).eq('id', huidigId)
      if (error) { setOpgeslagen('nee'); flash('Opslaan mislukt: ' + error.message) } else setOpgeslagen('ja')
    }, 1200)
    return () => clearTimeout(t)
  }, [doc, naam, huidigId, opgeslagen, flash, demo])

  // ---- partnerafmetingen ----
  const maatVan = useCallback((p: PartnerRij) => {
    const std = maten.find(m => m.pakket === p.pakket)
    return {
      w: Number(p.stand_breedte_m || std?.breedte_m || 3), h: Number(p.stand_diepte_m || std?.diepte_m || 2),
      eigen: p.stand_breedte_m != null, kleur: std?.kleur || '#9b3737', label: std?.label || p.pakket,
    }
  }, [maten])
  const partnerById = useMemo(() => Object.fromEntries(partners.map(p => [p.id, p])), [partners])
  useEffect(() => {
    if (!partners.length) return
    const d = docRef.current
    let veranderd = false
    const objs = d.objs.map(o => {
      if (o.kind !== 'partner' || !o.partnerId) return o
      const p = partnerById[o.partnerId]; if (!p) return o
      const m = maatVan(p)
      if (Math.abs(m.w - o.w) < 0.001 && Math.abs(m.h - o.h) < 0.001) return o
      veranderd = true
      return { ...o, x: o.x + (o.w - m.w) / 2, y: o.y + (o.h - m.h) / 2, w: m.w, h: m.h }
    })
    if (veranderd) setDoc({ ...d, objs }, false)
  }, [partners, maten, partnerById, maatVan, setDoc, huidigId])
  const slaMaatOp = async (p: PartnerRij, w: string, h: string) => {
    const b = w === '' ? null : parseFloat(w.replace(',', '.')), dd = h === '' ? null : parseFloat(h.replace(',', '.'))
    if (demo) { setPartners(ps => ps.map(x => x.id === p.id ? { ...x, stand_breedte_m: b, stand_diepte_m: dd } : x)); return }
    const { error } = await supabase.from('partners').update({ stand_breedte_m: b, stand_diepte_m: dd }).eq('id', p.id)
    if (error) { flash(error.message); return }
    setPartners(ps => ps.map(x => x.id === p.id ? { ...x, stand_breedte_m: b, stand_diepte_m: dd } : x))
  }
  const slaStandaardOp = async (m: Maat, veld: 'breedte_m' | 'diepte_m', v: string) => {
    const n = parseFloat(v.replace(',', '.')); if (!n) return
    if (!demo) { const { error } = await supabase.from('plattegrond_standaardmaten').update({ [veld]: n }).eq('pakket', m.pakket); if (error) { flash(error.message); return } }
    setMaten(ms => ms.map(x => x.pakket === m.pakket ? { ...x, [veld]: n } : x))
  }

  // ---- coördinaten ----
  const naarM = useCallback((cx: number, cy: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect()
    return [(cx - r.left) / view.s + view.x, (cy - r.top) / view.s + view.y]
  }, [view])
  const naarScherm = (p: Pt): Pt => [(p[0] - view.x) * view.s, (p[1] - view.y) * view.s]
  const rs = (v: number) => (snap && raster ? Math.round(v / raster) * raster : v)
  const rsp = (p: Pt): Pt => {
    // punt vastklikken: eerst op hulplijnen, dan op raster
    const g = doc.gidsen, d = 6 / view.s
    const gx = toonGidsen && g ? g.x.find(v => Math.abs(v - p[0]) < d) : undefined
    const gy = toonGidsen && g ? g.y.find(v => Math.abs(v - p[1]) < d) : undefined
    return [gx ?? rs(p[0]), gy ?? rs(p[1])]
  }
  const midden = (): Pt => {
    const r = svgRef.current?.getBoundingClientRect()
    return r ? [view.x + r.width / 2 / view.s, view.y + r.height / 2 / view.s] : [0, 0]
  }

  // ---- zichtbaarheid / selectie ----
  const zichtbaar = (o: Obj) => !o.verborgen && laagVan(o).zichtbaar
  const selecteerbaar = (o: Obj) => zichtbaar(o) && !o.locked && !laagVan(o).vast
  const metGroep = (ids: string[]) => {
    if (tool === 'direct') return ids
    const groepen = new Set(doc.objs.filter(o => ids.includes(o.id) && o.groep).map(o => o.groep))
    return [...new Set([...ids, ...doc.objs.filter(o => o.groep && groepen.has(o.groep) && selecteerbaar(o)).map(o => o.id)])]
  }
  const gesorteerd = useMemo(() => doc.objs.map((o, i) => ({ o, i })).sort((a, b) => ((laagIdx[a.o.laag || ''] ?? 0) - (laagIdx[b.o.laag || ''] ?? 0)) || a.i - b.i).map(x => x.o), [doc.objs, laagIdx])
  const gesel = doc.objs.filter(o => sel.includes(o.id))

  // ---- objecten toevoegen ----
  const laagVoor = (kind: Kind) => {
    const actief = lagen.find(l => l.id === actieveLaag && !l.vast)
    if (kind === 'partner' && lagen.some(l => l.id === 'partners')) return 'partners'
    if (kind === 'legenda' && lagen.some(l => l.id === 'teksten')) return 'teksten'
    return actief?.id || lagen.find(l => !l.vast)?.id || lagen[0].id
  }
  const voegToe = (objs: Obj[]) => { setDoc(d => ({ ...d, objs: [...d.objs, ...objs] })); setSel(objs.map(o => o.id)) }
  const vrijePlek = (o: Obj): Obj => {
    const blokken = doc.objs.filter(q => (q.kind === 'partner' || q.kind === 'materiaal') && !OMHULLEND.has(q.mat || '')).map(hoeken)
    for (let i = 0; i < 80; i++) {
      const kand = { ...o, x: o.x + (i % 8) * (o.w + 0.5), y: o.y + Math.floor(i / 8) * (o.h + 0.5) }
      if (!blokken.some(b => overlapt(b, hoeken(kand)))) return kand
    }
    return o
  }
  const plaatsPartner = (p: PartnerRij, op?: Pt) => {
    const al = doc.objs.find(o => o.partnerId === p.id)
    if (al) { setSel([al.id]); centreerOp(al); return }
    const m = maatVan(p), c = op || midden()
    const basis: Obj = { id: uid(), kind: 'partner', partnerId: p.id, x: rs(c[0] - m.w / 2), y: rs(c[1] - m.h / 2), w: m.w, h: m.h, rot: 0, laag: laagVoor('partner') }
    voegToe([op ? basis : vrijePlek(basis)]); setTool('select')
  }
  const plaatsMateriaal = (m: Materiaal, op?: Pt) => {
    if (m.soort === 'lijn') { setHekMat(m.key); setTool('hek'); flash(`Teken de lijn waar de ${m.label.toLowerCase()} moeten komen. De tool telt de stuks.`, 4500); return }
    const c = op || midden()
    const basis: Obj = { id: uid(), kind: 'materiaal', mat: m.key, x: rs(c[0] - m.w / 2), y: rs(c[1] - m.h / 2), w: m.w, h: m.h, rot: 0, laag: laagVoor('materiaal') }
    voegToe([op ? basis : vrijePlek(basis)]); setTool('select')
  }
  const plaatsLegenda = () => {
    const pts = doc.objs.flatMap(hoeken)
    const b = pts.length ? bbox(pts) : { x1: 0, y1: 0, x2: 0, y2: 0 }
    const o: Obj = { id: uid(), kind: 'legenda', x: b.x2 + 3, y: b.y1, w: 16, h: 10, rot: 0, laag: laagVoor('legenda'), label: 'Legenda' }
    voegToe([o]); setTool('select'); setTimeout(() => centreerOp(o), 0)
  }
  const centreerOp = (o: Obj) => {
    const b = bbox(hoeken(o)), r = svgRef.current!.getBoundingClientRect()
    setView(v => ({ ...v, x: (b.x1 + b.x2) / 2 - r.width / 2 / v.s, y: (b.y1 + b.y2) / 2 - r.height / 2 / v.s }))
  }
  const passend = () => {
    const pts = doc.objs.filter(zichtbaar).flatMap(hoeken)
    if (doc.bg) pts.push([doc.bg.x, doc.bg.y], [doc.bg.x + doc.bg.w, doc.bg.y + doc.bg.h])
    if (!pts.length) return
    const b = bbox(pts), r = svgRef.current!.getBoundingClientRect()
    const s = Math.min(r.width / (b.x2 - b.x1 + 6), r.height / (b.y2 - b.y1 + 6))
    setView({ s, x: (b.x1 + b.x2) / 2 - r.width / 2 / s, y: (b.y1 + b.y2) / 2 - r.height / 2 / s })
  }
  const zoomOp = (f: number, scherm?: Pt) => {
    const r = svgRef.current!.getBoundingClientRect()
    const [sx, sy] = scherm || [r.width / 2, r.height / 2]
    setView(v => { const s = Math.min(400, Math.max(0.5, v.s * f)); const m = [v.x + sx / v.s, v.y + sy / v.s]; return { s, x: m[0] - sx / s, y: m[1] - sy / s } })
  }

  // ---- bewerken ----
  const wijzig = (ids: string[], f: (o: Obj) => Obj, geschiedenis = true) =>
    setDoc(d => ({ ...d, objs: d.objs.map(o => ids.includes(o.id) ? f(o) : o) }), geschiedenis)
  const verplaats = (o: Obj, dx: number, dy: number): Obj =>
    o.pts ? { ...o, pts: o.pts.map(([x, y]) => [x + dx, y + dy] as Pt) } : { ...o, x: o.x + dx, y: o.y + dy }
  const verwijder = () => {
    if (!sel.length) return
    setDoc(d => ({ ...d, objs: d.objs.filter(o => !sel.includes(o.id) || o.locked) })); setSel([])
  }
  const kopieer = (objs: Obj[], dx: number, dy: number) => {
    const groepMap: Record<string, string> = {}
    return objs.filter(o => o.kind !== 'partner').map(o => ({ ...verplaats(o, dx, dy), id: uid(), locked: false, groep: o.groep ? (groepMap[o.groep] ||= uid()) : undefined }))
  }
  const dupliceer = () => {
    if (gesel.some(o => o.kind === 'partner')) flash('Partners staan maar één keer op de kaart, die zijn niet gekopieerd')
    const k = kopieer(gesel, 1, 1); if (k.length) { voegToe(k); laatsteTransform.current = { dx: 1, dy: 1, kopie: true } }
  }
  const nogmaals = () => {
    const t = laatsteTransform.current; if (!t || !gesel.length) return
    if (t.kopie) { const k = kopieer(gesel, t.dx, t.dy); if (k.length) voegToe(k) }
    else wijzig(sel, o => o.locked ? o : verplaats(o, t.dx, t.dy))
  }
  const middenSel = (): Pt => { const b = bbox(gesel.flatMap(hoeken)); return [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2] }
  const draai = (graden: number) => {
    if (!gesel.length) return
    const c = gesel.length === 1 && isBlok(gesel[0].kind) ? [gesel[0].x + gesel[0].w / 2, gesel[0].y + gesel[0].h / 2] as Pt : middenSel()
    wijzig(sel, o => {
      if (o.locked) return o
      if (o.pts) return { ...o, pts: o.pts.map(p => draaiPunt(p, c, graden)) }
      const [nx, ny] = draaiPunt([o.x + o.w / 2, o.y + o.h / 2], c, graden)
      return { ...o, x: nx - o.w / 2, y: ny - o.h / 2, rot: (((o.rot + graden) % 360) + 360) % 360 }
    })
  }
  const spiegel = (as: 'h' | 'v') => {
    if (!gesel.length) return
    const [cx, cy] = middenSel()
    wijzig(sel, o => {
      if (o.locked) return o
      if (o.pts) return { ...o, pts: o.pts.map(([x, y]) => (as === 'h' ? [2 * cx - x, y] : [x, 2 * cy - y]) as Pt) }
      const mx = o.x + o.w / 2, my = o.y + o.h / 2
      const nx = as === 'h' ? 2 * cx - mx : mx, ny = as === 'v' ? 2 * cy - my : my
      return { ...o, x: nx - o.w / 2, y: ny - o.h / 2, rot: ((360 - o.rot) % 360) }
    })
  }
  const schik = (richting: 'voor' | 'achter' | 'boven' | 'onder') => setDoc(d => {
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
  const groepeer = () => { if (gesel.length < 2) return; const g = uid(); wijzig(sel, o => ({ ...o, groep: g })); flash('Gegroepeerd') }
  const degroepeer = () => wijzig(sel, o => ({ ...o, groep: undefined }))
  const vergrendel = () => { wijzig(sel, o => ({ ...o, locked: true })); setSel([]) }
  const ontgrendelAlles = () => { const ids = doc.objs.filter(o => o.locked).map(o => o.id); setDoc(d => ({ ...d, objs: d.objs.map(o => o.locked ? { ...o, locked: false } : o) })); setSel(ids) }
  const verberg = () => { wijzig(sel, o => ({ ...o, verborgen: true })); setSel([]) }
  const toonAlles = () => { const ids = doc.objs.filter(o => o.verborgen).map(o => o.id); setDoc(d => ({ ...d, objs: d.objs.map(o => o.verborgen ? { ...o, verborgen: false } : o) })); setSel(ids) }
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
  const verdeelMetTussenruimte = (as: 'x' | 'y') => {
    if (gesel.length < 2) return
    const t = parseFloat((prompt('Tussenruimte in meters', '1') || '').replace(',', '.')); if (isNaN(t)) return
    const srt = gesel.map(o => ({ o, b: bbox(hoeken(o)) })).sort((a, b) => a.b[`${as}1`] - b.b[`${as}1`])
    let pos = srt[0].b[`${as}1`]; const d: Record<string, number> = {}
    for (const q of srt) { d[q.o.id] = pos - q.b[`${as}1`]; pos += q.b[`${as}2`] - q.b[`${as}1`] + t }
    wijzig(sel, o => verplaats(o, as === 'x' ? d[o.id] : 0, as === 'y' ? d[o.id] : 0))
  }

  // ---- nummering ----
  const nummerAuto = () => {
    const doel = (gesel.length ? gesel : doc.objs.filter(o => o.kind === 'partner' || o.kind === 'materiaal')).filter(o => o.kind !== 'legenda')
    if (!doel.length) return
    const centra = doel.map(o => { const b = bbox(hoeken(o)); return { o, x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 } })
    // rijen van boven naar onder, binnen een rij van links naar rechts
    centra.sort((a, b) => Math.abs(a.y - b.y) < 2 ? a.x - b.x : a.y - b.y)
    const ids = new Set(doel.map(o => o.id))
    const andere = doc.objs.filter(o => !ids.has(o.id) && o.nr).map(o => o.nr!)
    let n = andere.length ? Math.max(...andere) + 1 : 1
    const nrs: Record<string, number> = {}
    for (const c of centra) nrs[c.o.id] = n++
    setDoc(d => ({ ...d, objs: d.objs.map(o => nrs[o.id] ? { ...o, nr: nrs[o.id] } : o) }))
    setNrVolgende(n)
    flash(`${centra.length} objecten genummerd, van linksboven naar rechtsonder`)
  }
  const nummersWissen = () => {
    const ids = gesel.length ? sel : doc.objs.map(o => o.id)
    setDoc(d => ({ ...d, objs: d.objs.map(o => ids.includes(o.id) ? { ...o, nr: undefined } : o) }))
    if (!gesel.length) setNrVolgende(1)
  }
  const naamVan = (o: Obj) => o.kind === 'partner' ? (partnerById[o.partnerId!] ? bnaam(partnerById[o.partnerId!]) : 'Partner (verwijderd)')
    : o.kind === 'materiaal' ? (o.label || MATERIAAL[o.mat || '']?.label || 'Materiaal')
      : o.kind === 'hek' ? `${MATERIAAL[o.mat || '']?.label || 'Hekwerk'} (${hekStuks(o)}×)`
        : o.label || ({ rect: 'Rechthoek', ellipse: 'Ellips', line: 'Lijn', poly: 'Vlak', text: 'Tekst', legenda: 'Legenda', partner: '', materiaal: '', hek: '', voorziening: '' } as Record<Kind, string>)[o.kind]

  // ---- toetsenbord (Illustrator-sneltoetsen) ----
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      setAlt(e.altKey)
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || tekstEdit || verplaatsDlg) return
      const cmd = e.metaKey || e.ctrlKey, key = e.key.toLowerCase(), code = e.code
      if (e.key === ' ') { spatie.current = true; e.preventDefault(); return }
      if (cmd) {
        const actie: Record<string, () => void> = {
          z: () => e.shiftKey ? redo() : undo(),
          y: redo,
          d: nogmaals,
          g: () => e.shiftKey ? degroepeer() : groepeer(),
          c: () => { klembord.current = gesel.filter(o => o.kind !== 'partner') },
          x: () => { klembord.current = gesel.filter(o => o.kind !== 'partner'); verwijder() },
          v: () => { const k = kopieer(klembord.current, 1, 1); klembord.current = k.map(o => ({ ...o })); if (k.length) voegToe(k) },
          f: () => { const k = kopieer(klembord.current, 0, 0); if (k.length) voegToe(k) },
          b: () => { const k = kopieer(klembord.current, 0, 0); if (k.length) { setDoc(d => ({ ...d, objs: [...k, ...d.objs] })); setSel(k.map(o => o.id)) } },
          a: () => e.shiftKey ? setSel([]) : setSel(doc.objs.filter(selecteerbaar).map(o => o.id)),
          '0': passend,
          '1': () => zoomOp(50 / view.s),
          '=': () => zoomOp(1.4), '+': () => zoomOp(1.4), '-': () => zoomOp(1 / 1.4),
          r: () => setLinialen(v => !v),
          ';': () => setToonGidsen(v => !v),
          u: () => setSlim(v => !v),
          ']': () => schik(e.shiftKey ? 'boven' : 'voor'),
          '[': () => schik(e.shiftKey ? 'onder' : 'achter'),
        }
        // ⌘2 / ⌘⌥2 vergrendelen, ⌘3 / ⌘⌥3 verbergen (code, want alt verandert de toets)
        if (code === 'Digit2') { e.preventDefault(); e.altKey ? ontgrendelAlles() : vergrendel(); return }
        if (code === 'Digit3') { e.preventDefault(); e.altKey ? toonAlles() : verberg(); return }
        const a = actie[code === 'BracketRight' ? ']' : code === 'BracketLeft' ? '[' : key]
        if (a) { e.preventDefault(); a() }
        return
      }
      if (e.key === 'Escape') {
        if (concept && (tool === 'pen' || tool === 'line' || tool === 'hek')) { afrondenLijn(); return }
        meetVast.current = false; setConcept(null); setSel([]); setTool('select'); return
      }
      if (e.key === 'Enter') {
        if (concept && (tool === 'pen' || tool === 'line' || tool === 'hek')) { afrondenLijn(); return }
        if (sel.length && (tool === 'select' || tool === 'direct')) { setVerplaatsDlg({ dx: '0', dy: '0' }); return }
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && sel.length) { e.preventDefault(); verwijder(); return }
      if (e.key.startsWith('Arrow') && sel.length) {
        e.preventDefault()
        const st = e.shiftKey ? 1 : 0.1
        const [dx, dy] = e.key === 'ArrowLeft' ? [-st, 0] : e.key === 'ArrowRight' ? [st, 0] : e.key === 'ArrowUp' ? [0, -st] : [0, st]
        wijzig(sel, o => o.locked ? o : verplaats(o, dx, dy)); laatsteTransform.current = { dx, dy, kopie: false }; return
      }
      if (key === 'r' && sel.length) { draai(e.shiftKey ? -90 : 90); return }
      if (key === 'o' && sel.length) { spiegel(e.shiftKey ? 'v' : 'h'); return }
      const map: Record<string, Tool> = { v: 'select', a: 'direct', m: 'rect', l: 'ellipse', '\\': 'line', p: 'pen', t: 'text', h: 'hand', z: 'zoom', i: 'pipet', n: 'nummer', u: 'measure' }
      if (map[key]) setTool(map[key])
    }
    const ku = (e: KeyboardEvent) => { setAlt(e.altKey); if (e.key === ' ') spatie.current = false }
    window.addEventListener('keydown', k); window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('keyup', ku) }
  })

  // ---- zoom met wiel/trackpad (pinch = ctrl+wiel) ----
  useEffect(() => {
    const el = svgRef.current; if (!el) return
    const w = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey || e.altKey) {
        setView(v => {
          const s = Math.min(400, Math.max(0.5, v.s * Math.exp(-e.deltaY * 0.01)))
          const mx = (e.clientX - r.left) / v.s + v.x, my = (e.clientY - r.top) / v.s + v.y
          return { s, x: mx - (e.clientX - r.left) / s, y: my - (e.clientY - r.top) / s }
        })
      } else setView(v => ({ ...v, x: v.x + (e.shiftKey ? e.deltaY : e.deltaX) / v.s, y: v.y + (e.shiftKey ? 0 : e.deltaY) / v.s }))
    }
    el.addEventListener('wheel', w, { passive: false })
    return () => el.removeEventListener('wheel', w)
  }, [huidigId])

  // ---- slimme hulplijnen: uitlijnen + afstanden ----
  const magneet = (orig: Obj[], dx: number, dy: number) => {
    const ids = new Set(orig.map(o => o.id))
    const b0 = bbox(orig.map(o => verplaats(o, dx, dy)).flatMap(hoeken))
    let cx = 0, cy = 0, bx: number | undefined, by: number | undefined
    if (snap) {
      const xs = [b0.x1, (b0.x1 + b0.x2) / 2, b0.x2], ys = [b0.y1, (b0.y1 + b0.y2) / 2, b0.y2]
      const doelX: number[] = [], doelY: number[] = []
      if (slim) for (const o of doc.objs) {
        if (ids.has(o.id) || !zichtbaar(o)) continue
        const q = bbox(hoeken(o)); doelX.push(q.x1, (q.x1 + q.x2) / 2, q.x2); doelY.push(q.y1, (q.y1 + q.y2) / 2, q.y2)
      }
      if (toonGidsen && doc.gidsen) { doelX.push(...doc.gidsen.x); doelY.push(...doc.gidsen.y) }
      let beste = 6 / view.s, besteY = 6 / view.s
      for (const x of xs) for (const t of doelX) if (Math.abs(t - x) < beste) { beste = Math.abs(t - x); cx = t - x; bx = t }
      for (const y of ys) for (const t of doelY) if (Math.abs(t - y) < besteY) { besteY = Math.abs(t - y); cy = t - y; by = t }
      if (bx === undefined && raster) cx = Math.round(b0.x1 / raster) * raster - b0.x1
      if (by === undefined && raster) cy = Math.round(b0.y1 / raster) * raster - b0.y1
    }
    const b = { x1: b0.x1 + cx, x2: b0.x2 + cx, y1: b0.y1 + cy, y2: b0.y2 + cy }
    return { dx: dx + cx, dy: dy + cy, g: { x: bx, y: by, afst: slim ? afstanden(b, ids) : [] } }
  }
  const afstanden = (b: { x1: number; y1: number; x2: number; y2: number }, ids: Set<string>) => {
    const res: { a: Pt; b: Pt; l: number }[] = []
    let L: number | null = null, R: number | null = null, T: number | null = null, B: number | null = null
    type BB = { x1: number; y1: number; x2: number; y2: number }
    let Lq: BB | null = null, Rq: BB | null = null, Tq: BB | null = null, Bq: BB | null = null
    for (const o of doc.objs) {
      if (ids.has(o.id) || !zichtbaar(o) || o.kind === 'legenda') continue
      const q = bbox(hoeken(o))
      // object dat ons omsluit (zaal, tent): afstand tot de binnenrand
      if (q.x1 <= b.x1 && q.x2 >= b.x2 && q.y1 <= b.y1 && q.y2 >= b.y2) continue
      if (q.y1 < b.y2 && q.y2 > b.y1) {
        if (q.x1 >= b.x2 - 1e-6 && (R === null || q.x1 - b.x2 < R)) { R = q.x1 - b.x2; Rq = q }
        if (q.x2 <= b.x1 + 1e-6 && (L === null || b.x1 - q.x2 < L)) { L = b.x1 - q.x2; Lq = q }
      }
      if (q.x1 < b.x2 && q.x2 > b.x1) {
        if (q.y1 >= b.y2 - 1e-6 && (B === null || q.y1 - b.y2 < B)) { B = q.y1 - b.y2; Bq = q }
        if (q.y2 <= b.y1 + 1e-6 && (T === null || b.y1 - q.y2 < T)) { T = b.y1 - q.y2; Tq = q }
      }
    }
    const my = (q: { y1: number; y2: number }) => (Math.max(q.y1, b.y1) + Math.min(q.y2, b.y2)) / 2
    const mx = (q: { x1: number; x2: number }) => (Math.max(q.x1, b.x1) + Math.min(q.x2, b.x2)) / 2
    if (R !== null && R < 40 && R > 0.01) res.push({ a: [b.x2, my(Rq!)], b: [b.x2 + R, my(Rq!)], l: R })
    if (L !== null && L < 40 && L > 0.01) res.push({ a: [b.x1 - L, my(Lq!)], b: [b.x1, my(Lq!)], l: L })
    if (B !== null && B < 40 && B > 0.01) res.push({ a: [mx(Bq!), b.y2], b: [mx(Bq!), b.y2 + B], l: B })
    if (T !== null && T < 40 && T > 0.01) res.push({ a: [mx(Tq!), b.y1 - T], b: [mx(Tq!), b.y1], l: T })
    return res
  }

  // ---- muis ----
  const geraakt = (p: Pt, alleenSelecteerbaar = true): Obj | undefined => {
    for (let i = gesorteerd.length - 1; i >= 0; i--) {
      const o = gesorteerd[i]
      if (!zichtbaar(o) || (alleenSelecteerbaar && !selecteerbaar(o))) continue
      if (o.kind === 'line' || o.kind === 'hek') {
        const tol = Math.max(0.25, 6 / view.s) + (o.kind === 'hek' ? (MATERIAAL[o.mat || '']?.breedte || 0.2) : (o.dik || 0.2)) / 2
        const pts = o.pts || []
        for (let j = 0; j < pts.length - 1; j++) if (afstandTotLijn(p, pts[j], pts[j + 1]) < tol) return o
      } else if (o.kind === 'poly' && (!o.color || o.color === 'none')) {
        const pts = o.pts || []
        for (let j = 0; j < pts.length; j++) if (afstandTotLijn(p, pts[j], pts[(j + 1) % pts.length]) < Math.max(0.25, 6 / view.s)) return o
      } else if (puntInPoly(p, hoeken(o))) return o
    }
  }
  const begin = (type: string, start: Pt, orig: Obj[], extra: Partial<NonNullable<typeof drag.current>> = {}) => {
    drag.current = { type, start, orig, pre: docRef.current, ...extra }
  }
  const onDown = (e: React.PointerEvent) => {
    if (tekstEdit) { bevestigTekst(); return }
    const p = naarM(e.clientX, e.clientY)
    const r = svgRef.current!.getBoundingClientRect()
    const sx = e.clientX - r.left, sy = e.clientY - r.top
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const doelEl = e.target as Element
    // liniaal: hulplijn uittrekken
    const lin = doelEl.getAttribute('data-ruler')
    if (lin) { begin('nieuweGids', p, [], { extra: lin }); setNieuweGids({ as: lin === 'top' ? 'y' : 'x', v: lin === 'top' ? p[1] : p[0] }); return }
    if (e.button === 1 || tool === 'hand' || spatie.current) { begin('pan', p, [], { screen: [e.clientX, e.clientY], view }); return }
    if (tool === 'zoom') { zoomOp(e.altKey ? 1 / 1.6 : 1.6, [sx, sy]); return }
    const sp = rsp(p)
    if (tool === 'rect' || tool === 'ellipse') {
      const o: Obj = { id: uid(), kind: tool, x: sp[0], y: sp[1], w: 0, h: 0, rot: 0, color: '#d9cfb8', lijn: '#8b8574', laag: laagVoor(tool) }
      begin('teken', sp, [o]); setDoc(d => ({ ...d, objs: [...d.objs, o] }), false); setSel([o.id]); return
    }
    if (tool === 'text') {
      const o: Obj = { id: uid(), kind: 'text', x: sp[0], y: sp[1], w: 4, h: 1.2, rot: 0, label: '', color: '#010341', tekstgrootte: 1, laag: laagVoor('text') }
      setDoc(d => ({ ...d, objs: [...d.objs, o] })); setSel([o.id]); setTekstEdit({ id: o.id, waarde: '' }); setTool('select'); return
    }
    if (tool === 'pipet') {
      const o = geraakt(p, false); if (!o) return
      if (!sel.length) { flash('Selecteer eerst wat je wilt opmaken, klik dan met de pipet op het voorbeeld'); return }
      const stijl = { color: o.color, lijn: o.lijn, lijnDik: o.lijnDik, streep: o.streep, dekking: o.dekking, hoek: o.hoek, tekstgrootte: o.tekstgrootte, dik: o.dik }
      wijzig(sel, q => ({ ...q, ...stijl })); return
    }
    if (tool === 'nummer') {
      const o = geraakt(p); if (!o || o.kind === 'legenda') return
      if (e.altKey) { wijzig([o.id], q => ({ ...q, nr: undefined })); return }
      const bezet = doc.objs.find(q => q.nr === nrVolgende && q.id !== o.id)
      setDoc(d => ({ ...d, objs: d.objs.map(q => q.id === o.id ? { ...q, nr: nrVolgende } : bezet && q.id === bezet.id ? { ...q, nr: undefined } : q) }))
      setNrVolgende(n => n + 1); return
    }
    if (tool === 'line' || tool === 'pen' || tool === 'hek' || tool === 'measure' || tool === 'calibrate') {
      const vorige = concept && concept[concept.length - 2]
      const q = e.shiftKey && vorige ? haaks(vorige, sp) : sp
      if (!concept || meetVast.current) { meetVast.current = false; setConcept([q, q]); return }
      if (tool === 'measure') { setConcept([concept[0], q]); meetVast.current = true; return }
      if (tool === 'calibrate') { kalibreer(concept[0], q); setConcept(null); setTool('select'); return }
      if (tool === 'pen' && concept.length > 2) {
        const [fx, fy] = concept[0]
        if (Math.hypot(fx - q[0], fy - q[1]) < 8 / view.s) { afrondenVlak(); return }
      }
      setConcept([...concept.slice(0, -1), q, q]); return
    }
    // selecteren
    const h = doelEl.getAttribute('data-handle')
    if (h && gesel.length >= 1) {
      begin(h === 'rot' ? 'rot' : h.startsWith('pt') ? 'pt' : 'resize', p, gesel.length === 1 ? [...gesel] : [...gesel], { handle: h }); return
    }
    const gidsAttr = doelEl.getAttribute('data-gids')
    if (gidsAttr) { const [as, i] = gidsAttr.split(':'); begin('gids', p, [], { extra: { as, i: parseInt(i) } }); return }
    const o = geraakt(p)
    if (o) {
      let nieuweSel = sel
      const groep = metGroep([o.id])
      if (e.shiftKey) nieuweSel = sel.includes(o.id) ? sel.filter(i => !groep.includes(i)) : [...new Set([...sel, ...groep])]
      else if (!sel.includes(o.id)) nieuweSel = groep
      setSel(nieuweSel)
      if (e.altKey) {
        const k = kopieer(doc.objs.filter(x => nieuweSel.includes(x.id)), 0, 0)
        if (k.length) { const pre = docRef.current; setDoc(d => ({ ...d, objs: [...d.objs, ...k] }), false); setSel(k.map(x => x.id)); drag.current = { type: 'move', start: p, orig: k, pre, kopie: true }; return }
      }
      begin('move', p, doc.objs.filter(x => nieuweSel.includes(x.id)))
      return
    }
    if (doelEl.getAttribute('data-bg') && doc.bg && !doc.bg.locked) { begin('bg', p, [], { extra: { ...doc.bg } }); if (!e.shiftKey) setSel([]); return }
    if (!e.shiftKey) setSel([])
    begin('marquee', p, [])
    setMarquee({ a: p, b: p })
  }
  const onMove = (e: React.PointerEvent) => {
    const p = naarM(e.clientX, e.clientY)
    setMuis(p)
    if (concept && !meetVast.current && ['line', 'pen', 'hek', 'measure', 'calibrate'].includes(tool)) {
      const sp = rsp(p)
      const vorige = concept[concept.length - 2]
      const q = e.shiftKey && vorige ? haaks(vorige, sp) : sp
      setConcept(c => c ? [...c.slice(0, -1), q] : c)
    }
    const d = drag.current; if (!d) return
    if (d.type === 'pan') { const v = d.view!; setView({ ...v, x: v.x - (e.clientX - d.screen![0]) / v.s, y: v.y - (e.clientY - d.screen![1]) / v.s }); return }
    if (d.type === 'marquee') { setMarquee({ a: d.start, b: p }); return }
    if (d.type === 'nieuweGids') { setNieuweGids({ as: d.extra === 'top' ? 'y' : 'x', v: d.extra === 'top' ? rs(p[1]) : rs(p[0]) }); return }
    if (d.type === 'gids') {
      const { as, i } = d.extra as { as: 'x' | 'y'; i: number }
      setDoc(x => { const g = { x: [...(x.gidsen?.x || [])], y: [...(x.gidsen?.y || [])] }; g[as][i] = rs(as === 'x' ? p[0] : p[1]); return { ...x, gidsen: g } }, false); return
    }
    let dx = p[0] - d.start[0], dy = p[1] - d.start[1]
    if (d.type === 'bg') { const b = d.extra as Bg; setDoc(x => ({ ...x, bg: { ...b, x: b.x + dx, y: b.y + dy } }), false); return }
    if (d.type === 'move') {
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0 }
      const m = magneet(d.orig, dx, dy)
      const mdx = e.shiftKey && dx === 0 ? 0 : m.dx, mdy = e.shiftKey && dy === 0 ? 0 : m.dy
      setGidsen(m.g)
      const origById = Object.fromEntries(d.orig.map(o => [o.id, o]))
      setDoc(x => ({ ...x, objs: x.objs.map(o => origById[o.id] ? verplaats(origById[o.id], mdx, mdy) : o) }), false)
      d.extra = { dx: mdx, dy: mdy }
      return
    }
    if (d.type === 'teken') {
      const o = d.orig[0], sp = rsp(p)
      let w = sp[0] - d.start[0], h = sp[1] - d.start[1]
      if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m }
      let x0 = Math.min(d.start[0], d.start[0] + w), y0 = Math.min(d.start[1], d.start[1] + h)
      if (e.altKey) { x0 = d.start[0] - Math.abs(w); y0 = d.start[1] - Math.abs(h); w *= 2; h *= 2 }
      wijzig([o.id], q => ({ ...q, x: x0, y: y0, w: Math.abs(w), h: Math.abs(h) }), false)
      return
    }
    if (d.type === 'rot') {
      const o = d.orig[0], cx = o.x + o.w / 2, cy = o.y + o.h / 2
      let a = (Math.atan2(p[1] - cy, p[0] - cx) * 180) / Math.PI + 90
      a = e.shiftKey ? Math.round(a / 45) * 45 : Math.round(a)
      wijzig([o.id], q => ({ ...q, rot: ((a % 360) + 360) % 360 }), false); return
    }
    if (d.type === 'pt') {
      const o = d.orig[0], i = parseInt(d.handle!.slice(2)), sp = rsp(p)
      const buur = o.pts![i - 1] || o.pts![i + 1]
      const q = e.shiftKey && buur ? haaks(buur, sp) : sp
      wijzig([o.id], x => ({ ...x, pts: x.pts!.map((pt, j) => j === i ? q : pt) }), false); return
    }
    if (d.type === 'resize') {
      const o = d.orig[0]; if (o.kind === 'partner') return
      const a = (-o.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
      const lx = dx * c - dy * s, ly = dx * s + dy * c
      const hd = d.handle!
      let x = 0, y = 0, w = o.w, h = o.h
      if (hd.includes('e')) w = o.w + lx
      if (hd.includes('s')) h = o.h + ly
      if (hd.includes('w')) { w = o.w - lx; x = lx }
      if (hd.includes('n')) { h = o.h - ly; y = ly }
      const vast = e.shiftKey || o.kind === 'legenda'
      if (snap && raster && !vast) { w = Math.max(raster, Math.round(w / raster) * raster); h = Math.max(raster, Math.round(h / raster) * raster); if (hd.includes('w')) x = o.w - w; if (hd.includes('n')) y = o.h - h }
      if (vast && o.w && o.h) { const f = hd.length === 1 ? (hd === 'e' || hd === 'w' ? w / o.w : h / o.h) : Math.max(w / o.w, h / o.h); w = o.w * f; h = o.h * f; if (hd.includes('w')) x = o.w - w; if (hd.includes('n')) y = o.h - h }
      w = Math.max(0.1, w); h = Math.max(0.1, h)
      if (e.altKey) { x = (o.w - w) / 2; y = (o.h - h) / 2 }
      const ar = (o.rot * Math.PI) / 180, cr = Math.cos(ar), sr = Math.sin(ar)
      const ocx = o.x + o.w / 2, ocy = o.y + o.h / 2
      const lcx = x + w / 2 - o.w / 2, lcy = y + h / 2 - o.h / 2
      const ncx = ocx + lcx * cr - lcy * sr, ncy = ocy + lcx * sr + lcy * cr
      const f = w / o.w
      wijzig([o.id], q => ({ ...q, x: ncx - w / 2, y: ncy - h / 2, w, h, ...(o.kind === 'text' ? { tekstgrootte: (o.tekstgrootte || 1) * f } : {}) }), false)
    }
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null; setGidsen({})
    if (!d) return
    const r = svgRef.current!.getBoundingClientRect()
    const sx = e.clientX - r.left, sy = e.clientY - r.top
    if (d.type === 'marquee' && marquee) {
      const b = bbox([marquee.a, marquee.b])
      if (b.x2 - b.x1 > 0.05 || b.y2 - b.y1 > 0.05) {
        // zoals Illustrator: alles wat de selectierechthoek raakt
        const rect: Pt[] = [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]]
        const binnen = doc.objs.filter(o => selecteerbaar(o) && (() => { const h = hoeken(o); return h.length > 2 ? overlapt(h, rect) : h.some(p => p[0] >= b.x1 && p[0] <= b.x2 && p[1] >= b.y1 && p[1] <= b.y2) })()).map(o => o.id)
        setSel(s => [...new Set([...s, ...metGroep(binnen)])])
      }
      setMarquee(null); return
    }
    if (d.type === 'nieuweGids') {
      setNieuweGids(null)
      const rand = 18
      if (d.extra === 'top' ? sy > rand : sx > rand) {
        const v = d.extra === 'top' ? rs(naarM(e.clientX, e.clientY)[1]) : rs(naarM(e.clientX, e.clientY)[0])
        setDoc(x => { const g = { x: [...(x.gidsen?.x || [])], y: [...(x.gidsen?.y || [])] }; g[d.extra === 'top' ? 'y' : 'x'].push(v); return { ...x, gidsen: g } })
        setToonGidsen(true)
      }
      return
    }
    if (d.type === 'gids') {
      const { as, i } = d.extra as { as: 'x' | 'y'; i: number }
      // terugslepen naar de liniaal = hulplijn weg
      if (as === 'y' ? sy < 18 : sx < 18) setDoc(x => { const g = { x: [...(x.gidsen?.x || [])], y: [...(x.gidsen?.y || [])] }; g[as].splice(i, 1); return { ...x, gidsen: g } }, false)
    }
    if (d.type === 'teken') {
      const o = docRef.current.objs.find(x => x.id === d.orig[0].id)
      if (o && (o.w < 0.1 || o.h < 0.1)) { docRef.current = d.pre; setDocRaw(d.pre); setSel([]) }
      else { hist.current.past.push(d.pre); hist.current.future = []; setTool('select'); setOpgeslagen('nee') }
      return
    }
    if (d.type === 'move' && d.extra) { const t = d.extra as { dx: number; dy: number }; laatsteTransform.current = { dx: t.dx, dy: t.dy, kopie: !!d.kopie } }
    if (['move', 'rot', 'resize', 'pt', 'bg', 'gids'].includes(d.type) && docRef.current !== d.pre) {
      hist.current.past.push(d.pre); hist.current.future = []; setOpgeslagen('nee')
    }
  }
  const onDouble = (e: React.MouseEvent) => {
    if ((tool === 'line' || tool === 'pen' || tool === 'hek') && concept) { afrondenLijn(); return }
    if (tool !== 'select' && tool !== 'direct') return
    const o = geraakt(naarM(e.clientX, e.clientY))
    if (!o) return
    if (o.kind === 'text' || o.kind === 'rect' || o.kind === 'ellipse' || o.kind === 'poly' || o.kind === 'materiaal' || o.kind === 'legenda') {
      setSel([o.id]); setTekstEdit({ id: o.id, waarde: o.label || '' })
    }
  }
  const bevestigTekst = () => {
    if (!tekstEdit) return
    const o = doc.objs.find(x => x.id === tekstEdit.id)
    if (o?.kind === 'text' && !tekstEdit.waarde.trim()) setDoc(d => ({ ...d, objs: d.objs.filter(x => x.id !== tekstEdit.id) }))
    else wijzig([tekstEdit.id], q => ({ ...q, label: tekstEdit.waarde, ...(q.kind === 'text' ? { w: Math.max(1, tekstEdit.waarde.length * (q.tekstgrootte || 1) * 0.55) } : q.kind === 'materiaal' ? { toonLabel: true } : {}) }))
    setTekstEdit(null)
  }
  const afrondenLijn = () => {
    if (!concept) return
    const pts = concept.slice(0, -1).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.01)
    if (pts.length >= 2) {
      const o: Obj = tool === 'hek'
        ? { id: uid(), kind: 'hek', mat: hekMat, x: 0, y: 0, w: 0, h: 0, rot: 0, pts, laag: laagVoor('hek') }
        : { id: uid(), kind: 'line', x: 0, y: 0, w: 0, h: 0, rot: 0, pts, color: '#010341', dik: tool === 'line' ? 0.2 : 0.1, laag: laagVoor('line') }
      voegToe([o])
      if (tool === 'hek') flash(`${hekStuks(o)}× ${MATERIAAL[hekMat]?.label.toLowerCase()} (${fmt(lengte(pts))})`)
    }
    setConcept(null)
  }
  const afrondenVlak = () => {
    if (!concept) return
    const pts = concept.slice(0, -1)
    if (pts.length >= 3) voegToe([{ id: uid(), kind: 'poly', x: 0, y: 0, w: 0, h: 0, rot: 0, pts, color: '#efe9da', lijn: '#010341', lijnDik: 0.15, laag: laagVoor('poly') }])
    setConcept(null); setTool('select')
  }

  // ---- plattegrond locatie (PDF/afbeelding) ----
  const pdfNaarBlob = async (f: File): Promise<Blob> => {
    // legacy-build: werkt ook in oudere Safari; worker staat los in /public
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise
    const pagina = await pdf.getPage(1)
    const basis = pagina.getViewport({ scale: 1 })
    const vp = pagina.getViewport({ scale: 5000 / Math.max(basis.width, basis.height) })
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height)
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    await pagina.render({ canvasContext: ctx, viewport: vp } as Parameters<typeof pagina.render>[0]).promise
    if (pdf.numPages > 1) flash(`De PDF heeft ${pdf.numPages} pagina's, de eerste is gebruikt`)
    return await new Promise<Blob>((ok, nee) => c.toBlob(b => b ? ok(b) : nee(new Error('PDF omzetten mislukt')), 'image/jpeg', 0.88))
  }
  const [uploadBezig, setUploadBezig] = useState(false)
  const kiesLocatie = async (f: File) => {
    setUploadBezig(true)
    try {
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      const blob: Blob = isPdf ? await pdfNaarBlob(f) : f
      const lokaal = URL.createObjectURL(blob)
      const img = await new Promise<HTMLImageElement>((ok, nee) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => nee(new Error('Afbeelding kon niet geladen worden')); i.src = lokaal })
      let src = lokaal
      if (!demo) {
        const ext = isPdf ? 'jpg' : (f.name.split('.').pop() || 'png').toLowerCase()
        const pad = `${huidigId}/${Date.now()}.${ext}`
        const { error } = await supabase.storage.from('plattegronden').upload(pad, blob, { contentType: isPdf ? 'image/jpeg' : f.type || 'image/png', upsert: false })
        if (error) throw new Error('Uploaden mislukt: ' + error.message)
        src = supabase.storage.from('plattegronden').getPublicUrl(pad).data.publicUrl
      }
      const w = 60, h = (60 * img.height) / img.width
      setDoc(d => ({ ...d, bg: { src, x: 0, y: 0, w, h, opacity: 0.5, locked: false } }))
      setTimeout(passend, 50)
      flash('Plattegrond van de locatie geplaatst. Zet hem nu op schaal: trek een lijn over een maat die je kent.', 7000)
      setTool('calibrate')
    } catch (e) { flash((e as Error).message || 'Bestand kon niet gelezen worden', 7000) }
    finally { setUploadBezig(false) }
  }
  const kalibreer = (a: Pt, b: Pt) => {
    const gemeten = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (!doc.bg || gemeten < 0.01) return
    const echt = parseFloat((prompt(`Deze lijn is nu ${fmt(gemeten)}. Hoe lang is hij in het echt (meters)?`) || '').replace(',', '.'))
    if (!echt) return
    const f = echt / gemeten
    setDoc(d => d.bg ? ({ ...d, bg: { ...d.bg, x: a[0] - (a[0] - d.bg.x) * f, y: a[1] - (a[1] - d.bg.y) * f, w: d.bg.w * f, h: d.bg.h * f } }) : d)
    setTimeout(passend, 50)
    flash('Plattegrond van de locatie staat op schaal')
  }

  // ---- afgeleide info ----
  const geplaatst = new Set(doc.objs.filter(o => o.partnerId).map(o => o.partnerId!))
  const relevante = partners.filter(p => p.type !== 'personeel')
  const overlappers = useMemo(() => {
    const s = new Set<string>()
    const blokken = doc.objs.filter(o => (o.kind === 'partner' || o.kind === 'materiaal') && !OMHULLEND.has(o.mat || '') && !o.verborgen)
    for (let i = 0; i < blokken.length; i++) for (let j = i + 1; j < blokken.length; j++)
      if (overlapt(hoeken(blokken[i]), hoeken(blokken[j]))) { s.add(blokken[i].id); s.add(blokken[j].id) }
    return s
  }, [doc.objs])
  const telling = useMemo(() => {
    const m: Record<string, { stuks: number; meter: number }> = {}
    for (const o of doc.objs) {
      if (o.kind === 'materiaal' && o.mat) { m[o.mat] ||= { stuks: 0, meter: 0 }; m[o.mat].stuks++ }
      if (o.kind === 'hek' && o.mat) { m[o.mat] ||= { stuks: 0, meter: 0 }; m[o.mat].stuks += hekStuks(o); m[o.mat].meter += lengte(o.pts || []) }
    }
    return MATERIALEN.filter(x => m[x.key]).map(x => ({ mat: x, ...m[x.key] }))
  }, [doc.objs])
  const pakketTelling = useMemo(() => {
    const c: Record<string, number> = {}
    for (const o of doc.objs) if (o.kind === 'partner' && partnerById[o.partnerId!]) { const k = partnerById[o.partnerId!].pakket; c[k] = (c[k] || 0) + 1 }
    return Object.entries(c).map(([pakket, n]) => ({ maat: maten.find(m => m.pakket === pakket) || { pakket, label: pakket, kleur: '#999', breedte_m: 0, diepte_m: 0 }, n }))
  }, [doc.objs, partnerById, maten])
  const genummerd = useMemo(() => doc.objs.filter(o => o.nr).sort((a, b) => a.nr! - b.nr!), [doc.objs])
  const oppervlak = (o: Obj) => {
    if (o.kind === 'poly' && o.pts) { let a = 0; for (let i = 0; i < o.pts.length; i++) { const [x1, y1] = o.pts[i], [x2, y2] = o.pts[(i + 1) % o.pts.length]; a += x1 * y2 - x2 * y1 } return Math.abs(a / 2) }
    if (o.kind === 'ellipse' || MATERIAAL[o.mat || '']?.rond) return Math.PI * o.w * o.h / 4
    return o.w * o.h
  }

  // ---- materiaallijst (CSV voor de verhuurder) ----
  const csv = () => {
    const rijen = [['Categorie', 'Materiaal', 'Aantal', 'Strekkende meters', 'Maat (m)']]
    for (const t of telling) rijen.push([t.mat.cat, t.mat.label, String(t.stuks), t.meter ? r2(t.meter).toString().replace('.', ',') : '', `${t.mat.w} x ${t.mat.h}`.replace(/\./g, ',')])
    for (const p of pakketTelling) rijen.push(['Partners', p.maat.label, String(p.n), '', ''])
    const tekst = rijen.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + tekst], { type: 'text/csv' })); a.download = `materiaallijst ${naam}.csv`; a.click()
  }

  // ---- export ----
  const svgVoorExport = async () => {
    const pts = doc.objs.filter(zichtbaar).flatMap(hoeken)
    if (doc.bg) pts.push([doc.bg.x, doc.bg.y], [doc.bg.x + doc.bg.w, doc.bg.y + doc.bg.h])
    if (!pts.length) { flash('Er staat nog niets op de kaart'); return null }
    const b = bbox(pts), m = 2
    const kloon = svgRef.current!.querySelector('#tekening')!.cloneNode(true) as SVGGElement
    kloon.querySelectorAll('[data-ui]').forEach(n => n.remove())
    // locatieplattegrond insluiten, anders valt hij weg in PNG/PDF
    const im = kloon.querySelector('image')
    if (im && doc.bg && !doc.bg.src.startsWith('data:')) {
      try { const bl = await (await fetch(doc.bg.src)).blob(); const du = await new Promise<string>(ok => { const rd = new FileReader(); rd.onload = () => ok(rd.result as string); rd.readAsDataURL(bl) }); im.setAttribute('href', du) } catch { }
    }
    const W = b.x2 - b.x1 + 2 * m, H = b.y2 - b.y1 + 2 * m
    const ppm = 20
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W * ppm}" height="${H * ppm}" viewBox="${b.x1 - m} ${b.y1 - m} ${W} ${H}"><rect x="${b.x1 - m}" y="${b.y1 - m}" width="${W}" height="${H}" fill="#ffffff"/>${kloon.innerHTML}</svg>`
    return { svg, W, H, ppm }
  }
  const bestandsnaam = (naam || 'plattegrond').replace(/[^\w\- ]+/g, '').trim()
  const download = (url: string, ext: string) => { const a = document.createElement('a'); a.href = url; a.download = `${bestandsnaam}.${ext}`; a.click() }
  const naarCanvas = (svg: string, w: number, h: number) => new Promise<HTMLCanvasElement>((ok, nee) => {
    const img = new Image()
    img.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0, w, h); ok(c) }
    img.onerror = () => nee(new Error('Renderen mislukt'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
  const exporteer = async (soort: 'svg' | 'png' | 'pdf') => {
    const sel0 = sel; setSel([])
    await new Promise(r => setTimeout(r, 30))
    const e = await svgVoorExport(); setSel(sel0); if (!e) return
    if (soort === 'svg') { download(URL.createObjectURL(new Blob([e.svg], { type: 'image/svg+xml' })), 'svg'); return }
    if (soort === 'png') { const c = await naarCanvas(e.svg, e.W * e.ppm * 2, e.H * e.ppm * 2); c.toBlob(bl => bl && download(URL.createObjectURL(bl), 'png')); return }
    // PDF A3 liggend, met titelblok en een echte schaal (1:N)
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ orientation: e.W >= e.H ? 'landscape' : 'portrait', unit: 'mm', format: 'a3' })
    const PW = pdf.internal.pageSize.getWidth(), PH = pdf.internal.pageSize.getHeight()
    const vakW = PW - 20, vakH = PH - 20 - 18
    const mmPerM = Math.min(vakW / e.W, vakH / e.H)
    const schalen = [50, 100, 125, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000, 10000]
    const N = schalen.find(n => 1000 / n <= mmPerM) || 10000
    const mm = 1000 / N
    const dw = e.W * mm, dh = e.H * mm
    const c = await naarCanvas(e.svg, Math.round(dw * 12), Math.round(dh * 12)) // ~300 dpi
    pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 10 + (vakW - dw) / 2, 10 + (vakH - dh) / 2, dw, dh)
    // titelblok
    const ty = PH - 24
    pdf.setDrawColor(1, 3, 65); pdf.setLineWidth(0.3); pdf.rect(10, ty, PW - 20, 14)
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(1, 3, 65); pdf.text(naam || 'Plattegrond', 14, ty + 6)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5)
    pdf.text(`Nacht van de Wijn  ·  technische tekening  ·  ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`, 14, ty + 11)
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.text(`Schaal 1:${N} (A3)`, PW - 14, ty + 6, { align: 'right' })
    // schaalbalk van 10 m
    const sbx = PW - 14 - 10 * mm, sby = ty + 9.5
    pdf.setFillColor(1, 3, 65); for (let i = 0; i < 10; i += 2) pdf.rect(sbx + i * mm, sby, mm, 1.4, 'F')
    pdf.rect(sbx, sby, 10 * mm, 1.4); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.text('0', sbx, sby + 3.8, { align: 'center' }); pdf.text('10 m', sbx + 10 * mm, sby + 3.8, { align: 'center' })
    pdf.save(`${bestandsnaam}.pdf`)
  }

  // ---- tekenen ----
  const sw = 1 / view.s
  const kleurVan = (o: Obj) => o.color || (o.kind === 'partner' ? (partnerById[o.partnerId!] ? maatVan(partnerById[o.partnerId!]).kleur : '#999') : o.kind === 'materiaal' || o.kind === 'hek' ? (MATERIAAL[o.mat || '']?.kleur || '#777') : '#8b8574')
  const lijnVan = (o: Obj, std: string) => o.lijn === 'none' ? 'none' : (o.lijn || std)

  const icoon = (m: Materiaal | undefined, cx: number, cy: number, s: number, kleur: string, rot: number) => m && (
    <g transform={`translate(${cx} ${cy}) rotate(${-rot}) scale(${s / 24}) translate(-12 -12)`} fill="none" stroke={kleur} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ color: kleur }} dangerouslySetInnerHTML={{ __html: m.icoon }} />
  )

  const renderLegenda = (o: Obj) => {
    const W = o.w, f = W / 20, rij = f * 1.9, pad = f * 1.1
    let y = o.y + pad
    const els: React.ReactNode[] = []
    const kop = (t: string) => { y += rij * 0.35; els.push(<text key={'k' + t} x={o.x + pad} y={y + f} fontSize={f * 0.85} fontWeight={700} fill="#8b8574" fontFamily="Inter, sans-serif" letterSpacing={f * 0.05}>{t.toUpperCase()}</text>); y += rij * 0.9 }
    els.push(<text key="t" x={o.x + pad} y={y + f * 1.3} fontSize={f * 1.6} fontWeight={700} fill="#010341" fontFamily="Fraunces, Georgia, serif">{o.label || 'Legenda'}</text>); y += rij * 1.3
    if (pakketTelling.length) {
      kop('Partners')
      for (const p of pakketTelling) {
        els.push(<rect key={'p' + p.maat.pakket} x={o.x + pad} y={y} width={f * 1.4} height={f * 1.1} rx={f * 0.15} fill={p.maat.kleur} />)
        els.push(<text key={'pt' + p.maat.pakket} x={o.x + pad + f * 2.1} y={y + f * 0.85} fontSize={f} fill="#010341" fontFamily="Inter, sans-serif">{p.maat.label}</text>)
        els.push(<text key={'pn' + p.maat.pakket} x={o.x + W - pad} y={y + f * 0.85} fontSize={f} fill="#8b8574" textAnchor="end" fontFamily="Inter, sans-serif">{p.n}×</text>)
        y += rij
      }
    }
    if (telling.length) {
      kop('Materialen')
      for (const t of telling) {
        els.push(<rect key={'mr' + t.mat.key} x={o.x + pad} y={y - f * 0.2} width={f * 1.5} height={f * 1.5} rx={f * 0.2} fill={t.mat.kleur} fillOpacity={0.14} stroke={t.mat.kleur} strokeWidth={f * 0.06} />)
        els.push(<g key={'mi' + t.mat.key}>{icoon(t.mat, o.x + pad + f * 0.75, y + f * 0.55, f * 1.25, t.mat.kleur, 0)}</g>)
        els.push(<text key={'mt' + t.mat.key} x={o.x + pad + f * 2.1} y={y + f * 0.85} fontSize={f} fill="#010341" fontFamily="Inter, sans-serif">{t.mat.label}</text>)
        els.push(<text key={'mn' + t.mat.key} x={o.x + W - pad} y={y + f * 0.85} fontSize={f} fill="#8b8574" textAnchor="end" fontFamily="Inter, sans-serif">{t.stuks}×{t.meter ? ` · ${Math.round(t.meter)} m` : ''}</text>)
        y += rij
      }
    }
    if (genummerd.length) {
      kop('Nummers')
      const kolommen = genummerd.length > 14 ? 2 : 1, kw = (W - pad * 2) / kolommen
      const perKol = Math.ceil(genummerd.length / kolommen)
      const y0 = y
      genummerd.forEach((q, i) => {
        const k = Math.floor(i / perKol), yy = y0 + (i % perKol) * rij, x0 = o.x + pad + k * kw
        els.push(<circle key={'nc' + q.id} cx={x0 + f * 0.7} cy={yy + f * 0.55} r={f * 0.7} fill="#010341" />)
        els.push(<text key={'nn' + q.id} x={x0 + f * 0.7} y={yy + f * 0.58} fontSize={f * 0.75} fill="#fff" textAnchor="middle" dominantBaseline="middle" fontWeight={700} fontFamily="Inter, sans-serif">{q.nr}</text>)
        els.push(<text key={'nt' + q.id} x={x0 + f * 2.1} y={yy + f * 0.85} fontSize={f} fill="#010341" fontFamily="Inter, sans-serif">{naamVan(q).slice(0, kolommen === 2 ? 22 : 40)}</text>)
      })
      y = y0 + perKol * rij
    }
    y += pad * 0.6
    els.push(<text key="schaal" x={o.x + pad} y={y + f * 0.6} fontSize={f * 0.75} fill="#a39d8c" fontFamily="Inter, sans-serif">Maten in meters · raster {String(raster).replace('.', ',')} m</text>)
    y += rij * 0.6 + pad * 0.4
    const h = y - o.y
    return { h, el: (<g key={o.id}><rect x={o.x} y={o.y} width={W} height={h} fill="#fff" stroke="#010341" strokeWidth={f * 0.08} rx={f * 0.4} />{els}</g>) }
  }
  // hoogte van de legenda volgt de inhoud
  useEffect(() => {
    const leg = doc.objs.filter(o => o.kind === 'legenda')
    if (!leg.length) return
    const upd: Record<string, number> = {}
    for (const o of leg) { const { h } = renderLegenda(o); if (Math.abs(h - o.h) > 0.01) upd[o.id] = h }
    if (Object.keys(upd).length) setDoc(d => ({ ...d, objs: d.objs.map(o => upd[o.id] ? { ...o, h: upd[o.id] } : o) }), false)
  })

  const renderObj = (o: Obj) => {
    if (!zichtbaar(o)) return null
    const c = kleurVan(o), isSel = sel.includes(o.id), fout = overlappers.has(o.id)
    const dek = o.dekking ?? 1
    if (o.kind === 'legenda') return renderLegenda(o).el
    if (o.kind === 'line') return (
      <g key={o.id} opacity={dek}>
        <polyline points={o.pts!.map(p => p.join(',')).join(' ')} fill="none" stroke={c} strokeWidth={o.dik || 0.2} strokeLinecap="square" strokeLinejoin="miter" strokeDasharray={o.streep ? `${(o.dik || 0.2) * 3} ${(o.dik || 0.2) * 2}` : undefined} />
        {toonMaten && view.s > 6 && o.pts!.slice(1).map((p, i) => { const a = o.pts![i]; const l = Math.hypot(p[0] - a[0], p[1] - a[1]); return l > 1 ? <text data-ui key={i} x={(a[0] + p[0]) / 2} y={(a[1] + p[1]) / 2 - 0.35} fontSize={11 * sw} textAnchor="middle" fill="#9b3737" fontFamily="Inter">{fmt(l)}</text> : null })}
      </g>
    )
    if (o.kind === 'hek') {
      const m = MATERIAAL[o.mat || '']; const br = m?.breedte || 0.2, stuk = m?.stuk || 1
      const pts = o.pts || []
      const ticks: React.ReactNode[] = []
      // streepjes op elke stuk-grens langs de lijn
      let rest = 0, k = 0
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], l = Math.hypot(bx - ax, by - ay); if (!l) continue
        const ux = (bx - ax) / l, uy = (by - ay) / l, nx = -uy * (br / 2 + 0.08), ny = ux * (br / 2 + 0.08)
        for (let t = rest; t <= l + 1e-6; t += stuk) { const px = ax + ux * t, py = ay + uy * t; ticks.push(<line key={k++} x1={px - nx} y1={py - ny} x2={px + nx} y2={py + ny} stroke={c} strokeWidth={Math.max(0.03, br * 0.15)} />) }
        rest = stuk - ((l - rest) % stuk); if (rest >= stuk - 1e-6) rest = 0
      }
      const mid = Math.floor((pts.length - 1) / 2), A = pts[mid], B = pts[mid + 1] || A
      let hoek = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI; if (hoek > 90 || hoek < -90) hoek += 180
      const lx = (A[0] + B[0]) / 2, ly = (A[1] + B[1]) / 2, fs = Math.max(0.45, br * 0.6)
      return (
        <g key={o.id} opacity={dek}>
          <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke={c} strokeOpacity={br > 0.6 ? 0.22 : 0.35} strokeWidth={br} strokeLinejoin="miter" />
          <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke={c} strokeWidth={Math.min(0.06, br * 0.3)} strokeDasharray={o.mat === 'dranghek' ? '0.3 0.15' : undefined} />
          {ticks}
          {(toonMaten || isSel) && <text x={lx} y={ly - br / 2 - 0.25} transform={`rotate(${hoek} ${lx} ${ly})`} fontSize={fs} textAnchor="middle" fill={c} fontFamily="Inter, sans-serif" fontWeight={700}>{hekStuks(o)}× {m?.label.toLowerCase()} · {fmt(lengte(pts))}</text>}
          {isSel && <polyline data-ui points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke="#2b6cb0" strokeWidth={1.5 * sw} />}
        </g>
      )
    }
    if (o.kind === 'poly') {
      const b = bbox(o.pts!)
      const ld = o.lijnDik ?? 0.15
      return (
        <g key={o.id} opacity={dek}>
          <polygon points={o.pts!.map(p => p.join(',')).join(' ')} fill={c === 'none' ? 'none' : c} fillOpacity={0.6} stroke={lijnVan(o, '#010341')} strokeWidth={ld} strokeLinejoin="miter" strokeDasharray={o.streep ? `${ld * 4} ${ld * 3}` : undefined} />
          {o.label && <text x={(b.x1 + b.x2) / 2} y={(b.y1 + b.y2) / 2} fontSize={Math.min(1.6, (b.x2 - b.x1) / 8)} textAnchor="middle" dominantBaseline="middle" fill="#010341" fillOpacity={0.55} fontFamily="Fraunces, Georgia, serif">{o.label}</text>}
          {toonMaten && isSel && <text data-ui x={(b.x1 + b.x2) / 2} y={(b.y1 + b.y2) / 2 + 1.6} fontSize={11 * sw} textAnchor="middle" fill="#2b6cb0" fontFamily="Inter">{r2(oppervlak(o))} m²</text>}
          {isSel && <polygon data-ui points={o.pts!.map(p => p.join(',')).join(' ')} fill="none" stroke="#2b6cb0" strokeWidth={1.5 * sw} />}
        </g>
      )
    }
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2
    const tr = `rotate(${o.rot} ${cx} ${cy})`
    if (o.kind === 'text') return (
      <g key={o.id} transform={tr} opacity={tekstEdit?.id === o.id ? 0 : dek}>
        <text x={o.x} y={o.y + (o.tekstgrootte || 1) * 0.85} fontSize={o.tekstgrootte || 1} fill={c} fontFamily="Fraunces, Georgia, serif" fontWeight={600}>{o.label}</text>
        {isSel && <rect data-ui x={o.x} y={o.y} width={o.w} height={o.h} fill="none" stroke="#2b6cb0" strokeWidth={sw} strokeDasharray={`${3 * sw} ${2 * sw}`} />}
      </g>
    )
    const leesRot = o.rot > 90 && o.rot <= 270 ? 180 : 0
    const staand = o.h > o.w * 1.3
    if (o.kind === 'materiaal') {
      const m = MATERIAAL[o.mat || '']
      const rond = m?.rond
      const s = Math.min(o.w, o.h) * (o.toonLabel && Math.min(o.w, o.h) > 1.5 ? 0.55 : 0.78)
      const ld = o.lijnDik ?? Math.min(0.06, Math.min(o.w, o.h) * 0.06)
      return (
        <g key={o.id} opacity={dek}>
          <g transform={tr}>
            {rond
              ? <ellipse cx={cx} cy={cy} rx={o.w / 2} ry={o.h / 2} fill={c} fillOpacity={0.14} stroke={lijnVan(o, c)} strokeWidth={ld} strokeDasharray={o.streep ? `${ld * 4} ${ld * 3}` : undefined} />
              : <rect x={o.x} y={o.y} width={o.w} height={o.h} rx={o.hoek ?? Math.min(o.w, o.h) * 0.08} fill={c} fillOpacity={OMHULLEND.has(o.mat || '') ? 0.07 : 0.14} stroke={lijnVan(o, c)} strokeWidth={ld} strokeDasharray={o.streep || OMHULLEND.has(o.mat || '') ? `${Math.max(ld, 0.05) * 4} ${Math.max(ld, 0.05) * 3}` : undefined} />}
            {fout && <rect data-ui x={o.x} y={o.y} width={o.w} height={o.h} fill="none" stroke="#e53935" strokeWidth={2.5 * sw} strokeDasharray={`${5 * sw} ${3 * sw}`} />}
            {isSel && <rect data-ui x={o.x} y={o.y} width={o.w} height={o.h} fill="none" stroke="#2b6cb0" strokeWidth={1.5 * sw} />}
          </g>
          {icoon(m, cx, o.toonLabel && Math.min(o.w, o.h) > 1.5 ? cy - s * 0.25 : cy, s, c, 0)}
          {o.toonLabel && <text x={cx} y={Math.min(o.w, o.h) > 1.5 ? cy + s * 0.55 : o.y + o.h + Math.max(0.35, s * 0.35)} fontSize={Math.max(0.3, Math.min(0.9, o.w / Math.max(6, (o.label || m?.label || '').length * 0.6)))} textAnchor="middle" dominantBaseline="middle" fill={c} fontFamily="Inter, sans-serif" fontWeight={600}>{o.label || m?.label}</text>}
        </g>
      )
    }
    const tekst = o.kind === 'partner' ? naamVan(o) : (o.label || '')
    const fs = Math.max(0.25, Math.min(o.h * 0.32, (staand ? o.h : o.w) / Math.max(4, tekst.length * 0.62), 1.1))
    const ld = o.lijnDik ?? (o.kind === 'rect' || o.kind === 'ellipse' ? 0.05 : 0)
    return (
      <g key={o.id} transform={tr} opacity={dek}>
        {o.kind === 'ellipse'
          ? <ellipse cx={cx} cy={cy} rx={o.w / 2} ry={o.h / 2} fill={c === 'none' ? 'none' : c} stroke={lijnVan(o, '#8b8574')} strokeWidth={ld} strokeDasharray={o.streep ? `${ld * 4} ${ld * 3}` : undefined} />
          : <rect x={o.x} y={o.y} width={o.w} height={o.h} fill={c === 'none' ? 'none' : c} fillOpacity={o.kind === 'rect' ? 0.7 : 0.92} stroke={o.kind === 'partner' && !o.lijn ? 'none' : lijnVan(o, '#8b8574')} strokeWidth={ld} strokeDasharray={o.streep ? `${ld * 4} ${ld * 3}` : undefined} rx={o.hoek ?? (o.kind === 'partner' ? Math.min(o.w, o.h) * 0.06 : 0)} />}
        {o.kind === 'partner' && <rect x={o.x} y={o.y + o.h - Math.min(0.35, o.h * 0.15)} width={o.w} height={Math.min(0.35, o.h * 0.15)} fill="#000" fillOpacity={0.18} />}
        {tekst && <text x={cx} y={cy} transform={`rotate(${leesRot + (staand ? -90 : 0)} ${cx} ${cy})`} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill={o.kind === 'partner' ? '#fff' : '#010341'} fontFamily="Inter, sans-serif" fontWeight={600}>{tekst}</text>}
        {toonMaten && view.s > 10 && o.kind === 'partner' && <text data-ui x={cx} y={cy + fs * 1.1} transform={`rotate(${leesRot + (staand ? -90 : 0)} ${cx} ${cy})`} fontSize={Math.min(fs * 0.7, 0.5)} textAnchor="middle" dominantBaseline="middle" fill="#fff" fillOpacity={0.8} fontFamily="Inter">{r2(o.w)} × {r2(o.h)}</text>}
        {fout && <rect data-ui x={o.x} y={o.y} width={o.w} height={o.h} fill="none" stroke="#e53935" strokeWidth={2.5 * sw} strokeDasharray={`${5 * sw} ${3 * sw}`} />}
        {isSel && <rect data-ui x={o.x} y={o.y} width={o.w} height={o.h} fill="none" stroke="#2b6cb0" strokeWidth={1.5 * sw} />}
      </g>
    )
  }
  const nrStraal = doc.nrGrootte || 0.6
  const renderNummer = (o: Obj) => {
    if (!o.nr || !zichtbaar(o)) return null
    const b = bbox(hoeken(o))
    // op de linkerbovenhoek, zodat het nooit over de naam valt
    const x = b.x1, y = b.y1
    return (
      <g key={'nr' + o.id}>
        <circle cx={x} cy={y} r={nrStraal} fill="#010341" stroke="#fff" strokeWidth={nrStraal * 0.12} />
        <text x={x} y={y + nrStraal * 0.04} fontSize={nrStraal * (o.nr > 99 ? 0.85 : 1.1)} fill="#fff" textAnchor="middle" dominantBaseline="middle" fontFamily="Inter, sans-serif" fontWeight={700}>{o.nr}</text>
      </g>
    )
  }

  const handles = () => {
    if (!gesel.length || !(tool === 'select' || tool === 'direct')) return null
    const hs = 8 * sw
    if (gesel.length > 1) {
      const b = bbox(gesel.flatMap(hoeken))
      return <g data-ui>
        <rect x={b.x1} y={b.y1} width={b.x2 - b.x1} height={b.y2 - b.y1} fill="none" stroke="#2b6cb0" strokeWidth={sw} strokeDasharray={`${4 * sw} ${3 * sw}`} />
        {toonMaten && <text x={(b.x1 + b.x2) / 2} y={b.y2 + 16 * sw} fontSize={11 * sw} textAnchor="middle" fill="#2b6cb0" fontFamily="Inter" fontWeight={600}>{fmt(b.x2 - b.x1)} × {fmt(b.y2 - b.y1)}</text>}
      </g>
    }
    const o = gesel[0]; if (o.locked) return null
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
        {toonMaten && o.kind !== 'text' && o.kind !== 'legenda' && <>
          <text x={cx} y={o.y + o.h + 16 * sw} fontSize={11 * sw} textAnchor="middle" fill="#2b6cb0" fontFamily="Inter" fontWeight={600}>{fmt(o.w)}</text>
          <text x={o.x + o.w + 8 * sw} y={cy} fontSize={11 * sw} dominantBaseline="middle" fill="#2b6cb0" fontFamily="Inter" fontWeight={600}>{fmt(o.h)}</text>
        </>}
      </g>
    )
  }

  // raster en linialen
  const rect = svgRef.current?.getBoundingClientRect()
  const vw = rect?.width || 1000, vh = rect?.height || 700
  const rasterStap = (() => { let s = raster || 1; while (s * view.s < 8) s *= 2; return s })()
  const grootStap = (() => { const stappen = [0.5, 1, 2, 5, 10, 20, 50, 100, 200]; return stappen.find(s => s * view.s >= 60) || 200 })()
  const liniaal = () => {
    if (!linialen) return null
    const t: React.ReactNode[] = []
    const kl = grootStap / 5
    const x0 = Math.floor(view.x / kl) * kl, y0 = Math.floor(view.y / kl) * kl
    for (let v = x0; v < view.x + vw / view.s; v += kl) {
      const sx = (v - view.x) * view.s; if (sx < 18) continue
      const groot = Math.abs(v / grootStap - Math.round(v / grootStap)) < 1e-6
      t.push(<line key={'tx' + v} x1={sx} x2={sx} y1={groot ? 4 : 12} y2={18} stroke="#a39d8c" strokeWidth={1} />)
      if (groot) t.push(<text key={'lx' + v} x={sx + 3} y={10} fontSize={9} fill="#777162" fontFamily="Inter">{r2(v)}</text>)
    }
    for (let v = y0; v < view.y + vh / view.s; v += kl) {
      const sy = (v - view.y) * view.s; if (sy < 18) continue
      const groot = Math.abs(v / grootStap - Math.round(v / grootStap)) < 1e-6
      t.push(<line key={'ty' + v} y1={sy} y2={sy} x1={groot ? 4 : 12} x2={18} stroke="#a39d8c" strokeWidth={1} />)
      if (groot) t.push(<text key={'ly' + v} x={10} y={sy + 3} fontSize={9} fill="#777162" fontFamily="Inter" transform={`rotate(-90 10 ${sy + 3})`}>{r2(v)}</text>)
    }
    const [mx, my] = naarScherm(muis)
    return (
      <g data-ui>
        <rect data-ruler="top" x={0} y={0} width={vw} height={18} fill="#f4efe3" style={{ cursor: 'row-resize' }} />
        <rect data-ruler="left" x={0} y={0} width={18} height={vh} fill="#f4efe3" style={{ cursor: 'col-resize' }} />
        <g style={{ pointerEvents: 'none' }}>
          {t}
          <line x1={mx} x2={mx} y1={0} y2={18} stroke="#e0338a" strokeWidth={1} />
          <line y1={my} y2={my} x1={0} x2={18} stroke="#e0338a" strokeWidth={1} />
          <line x1={18} x2={vw} y1={18} y2={18} stroke="#e3dcc9" /><line x1={18} x2={18} y1={18} y2={vh} stroke="#e3dcc9" />
        </g>
        <rect x={0} y={0} width={18} height={18} fill="#efe9da" />
      </g>
    )
  }

  const conceptLabel = concept && concept.length >= 2 ? (() => {
    const a = concept[concept.length - 2], b = concept[concept.length - 1]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]), hoek = ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 360) % 360
    const tot = lengte(concept)
    const extra = tool === 'hek' ? `  ${Math.max(1, Math.ceil(tot / (MATERIAAL[hekMat]?.stuk || 1) - 0.01))}× ${MATERIAAL[hekMat]?.label.toLowerCase()}` : (tool === 'line' || tool === 'pen') && concept.length > 2 ? `  Σ ${fmt(tot)}` : ''
    return { b, txt: `${fmt(l)} · ${Math.round(hoek)}°${extra}` }
  })() : null

  const cursor = tool === 'hand' ? 'grab' : tool === 'zoom' ? (alt ? 'zoom-out' : 'zoom-in') : tool === 'select' ? 'default' : tool === 'direct' ? 'default' : tool === 'pipet' ? 'copy' : 'crosshair'
  const enkel = gesel.length === 1 ? gesel[0] : null

  // afstanden tonen bij alt ingedrukt met selectie (zoals Illustrator)
  const altAfst = alt && gesel.length && !drag.current && slim ? afstanden(bbox(gesel.flatMap(hoeken)), new Set(sel)) : []

  // ---- UI ----
  const svgIcon = (d: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
  const knop = (t: Tool, icoon: string, titel: string, sneltoets: string) => (
    <button key={t} title={`${titel} (${sneltoets})`} onClick={() => setTool(t)}
      style={{ width: 36, height: 34, border: 'none', borderRadius: 8, cursor: 'pointer', background: tool === t ? 'var(--navy)' : 'transparent', color: tool === t ? 'var(--cream)' : 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <span dangerouslySetInnerHTML={{ __html: icoon }} />
      <span style={{ position: 'absolute', right: 2, bottom: 0, fontSize: 8, opacity: 0.5, fontFamily: 'Inter' }}>{sneltoets}</span>
    </button>
  )
  const mini: React.CSSProperties = { ...AS.input, padding: '4px 7px', fontSize: 12 }
  const klein: React.CSSProperties = { ...AS.btnSm, padding: '4px 8px', fontSize: 11.5 }
  const sectie: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#a39d8c', letterSpacing: 0.4, textTransform: 'uppercase', margin: '12px 0 5px' }
  const scheiding = <div style={{ height: 1, width: 24, background: '#e3dcc9', margin: '2px 0' }} />

  const gefilterd = relevante.filter(p => !zoek || (p.naam + ' ' + (p.bedrijfsnaam || '')).toLowerCase().includes(zoek.toLowerCase()))
  const groepen = maten.filter(m => m.pakket !== 'personeel').map(m => ({ m, ps: gefilterd.filter(p => p.pakket === m.pakket) })).filter(g => g.ps.length)
  const zonderGroep = gefilterd.filter(p => !maten.some(m => m.pakket === p.pakket))
  const matGefilterd = MATERIALEN.filter(m => !matZoek || (m.label + ' ' + m.cat).toLowerCase().includes(matZoek.toLowerCase()))

  const uiterlijk = (objs: Obj[]) => {
    const o = objs[0]; const ids = objs.map(x => x.id)
    const heeftVulling = objs.some(x => x.kind !== 'line' && x.kind !== 'hek' && x.kind !== 'text' && x.kind !== 'legenda')
    const heeftLijn = objs.some(x => x.kind !== 'text' && x.kind !== 'legenda')
    const kleurRij = (huidig: string, zet: (c: string) => void, geen = false) => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {geen && <button title="Geen" onClick={() => zet('none')} style={{ width: 17, height: 17, borderRadius: 4, border: huidig === 'none' ? '2px solid #2b6cb0' : '1px solid #ccc', background: 'linear-gradient(135deg,#fff 45%,#e53935 45%,#e53935 55%,#fff 55%)', cursor: 'pointer', padding: 0 }} />}
        {KLEUREN.map(c => <button key={c} onClick={() => zet(c)} style={{ width: 17, height: 17, borderRadius: 4, border: huidig === c ? '2px solid #2b6cb0' : '1px solid rgba(0,0,0,0.12)', background: c, cursor: 'pointer', padding: 0 }} />)}
        <input type="color" value={huidig && huidig !== 'none' ? huidig : '#000000'} onChange={e => zet(e.target.value)} style={{ width: 20, height: 18, border: 'none', padding: 0, background: 'none' }} />
      </div>
    )
    return <>
      {heeftVulling && <><div style={sectie}>Vulling</div>{kleurRij(o.kind === 'line' ? '' : kleurVan(o), c => wijzig(ids, q => q.kind === 'line' || q.kind === 'hek' ? q : { ...q, color: c }), true)}</>}
      {heeftLijn && <><div style={sectie}>Lijn</div>
        {kleurRij(o.kind === 'line' || o.kind === 'hek' ? kleurVan(o) : (o.lijn || ''), c => wijzig(ids, q => q.kind === 'line' || q.kind === 'hek' ? { ...q, color: c === 'none' ? q.color : c } : { ...q, lijn: c }), true)}
        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
          <label style={{ fontSize: 11, color: '#777162', display: 'flex', alignItems: 'center', gap: 4 }}>Dikte
            <input style={{ ...mini, width: 62 }} type="number" step={1} min={1} value={Math.round(((o.kind === 'line' ? o.dik : o.lijnDik) ?? (o.kind === 'line' ? 0.2 : 0.05)) * 100)}
              onChange={e => { const v = Math.max(0.01, (parseFloat(e.target.value) || 1) / 100); wijzig(ids, q => q.kind === 'line' ? { ...q, dik: v } : { ...q, lijnDik: v }) }} /> cm</label>
          <label style={{ fontSize: 11, color: '#777162', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><input type="checkbox" checked={!!o.streep} onChange={e => wijzig(ids, q => ({ ...q, streep: e.target.checked }))} /> Stippel</label>
        </div></>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <label style={{ fontSize: 11, color: '#777162', flex: 1 }}>Dekking {Math.round((o.dekking ?? 1) * 100)}%
          <input type="range" min={0.1} max={1} step={0.05} value={o.dekking ?? 1} onChange={e => wijzig(ids, q => ({ ...q, dekking: parseFloat(e.target.value) }), false)} onPointerUp={() => setOpgeslagen('nee')} style={{ width: '100%' }} /></label>
        {objs.every(x => x.kind === 'rect' || x.kind === 'materiaal' || x.kind === 'partner') && <label style={{ fontSize: 11, color: '#777162', width: 70 }}>Hoek (cm)
          <input style={mini} type="number" min={0} step={5} value={Math.round((o.hoek ?? 0) * 100)} onChange={e => wijzig(ids, q => ({ ...q, hoek: Math.max(0, (parseFloat(e.target.value) || 0) / 100) }))} /></label>}
      </div>
    </>
  }

  const schikKnoppen = (
    <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
      <button style={klein} title="⌘⇧]" onClick={() => schik('boven')}>Naar voren</button>
      <button style={klein} title="⌘⇧[" onClick={() => schik('onder')}>Naar achteren</button>
      <button style={klein} title="R / ⇧R" onClick={() => draai(90)}>⟳ 90°</button>
      <button style={klein} title="O" onClick={() => spiegel('h')}>⇋</button>
      <button style={klein} title="⇧O" onClick={() => spiegel('v')}>⇵</button>
      <button style={klein} title="⌘2" onClick={vergrendel}>Vergrendel</button>
      <button style={klein} title="⌘3" onClick={verberg}>Verberg</button>
      <button style={klein} title="⌘D herhaalt daarna" onClick={dupliceer}>Kopie</button>
      <button style={{ ...klein, color: '#b3261e' }} onClick={verwijder}>{enkel?.kind === 'partner' ? 'Van kaart' : 'Wis'}</button>
    </div>
  )

  const naarLaag = (laagId: string) => wijzig(sel, o => ({ ...o, laag: laagId }))
  const tekstObj = tekstEdit ? doc.objs.find(o => o.id === tekstEdit.id) : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={AS.title}>Plattegrond</div>
          <div style={{ ...AS.sub, marginBottom: 0 }}>Technische tekening op ware schaal. Werkt met de sneltoetsen van Illustrator.</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={{ ...mini, width: 'auto', minWidth: 210 }} value={huidigId || ''} onChange={e => open(e.target.value)}>
            {!lijst.length && <option value="">Nog geen plattegrond</option>}
            {lijst.map(l => <option key={l.id} value={l.id}>{l.naam}</option>)}
          </select>
          <button style={{ ...AS.btn, marginTop: 0, padding: '7px 14px' }} onClick={nieuw}>Nieuw</button>
          {huidigId && <>
            <button style={klein} onClick={dupliceerPlattegrond}>Kopie</button>
            <button style={klein} onClick={() => { const n = prompt('Nieuwe naam', naam); if (n) { setNaam(n); setOpgeslagen('nee'); setLijst(l => l.map(x => x.id === huidigId ? { ...x, naam: n } : x)) } }}>Hernoem</button>
            <span style={{ width: 1, height: 20, background: '#e3dcc9' }} />
            <button style={{ ...klein, background: 'var(--navy)', color: 'var(--cream)', borderColor: 'var(--navy)' }} onClick={() => exporteer('pdf')} title="A3 met titelblok en schaal">PDF op schaal</button>
            <button style={klein} onClick={() => exporteer('svg')}>SVG (Illustrator)</button>
            <button style={klein} onClick={() => exporteer('png')}>PNG</button>
            <button style={{ ...klein, color: '#999', borderColor: '#ddd' }} onClick={verwijderPlattegrond}>Verwijder</button>
          </>}
          <span style={{ fontSize: 11.5, color: opgeslagen === 'ja' ? '#2e6b3a' : '#9a5b00', minWidth: 78 }}>{opgeslagen === 'ja' ? '✓ Opgeslagen' : opgeslagen === 'bezig' ? 'Opslaan…' : 'Wijzigingen…'}</span>
        </div>
      </div>

      {!huidigId ? (
        <div style={{ ...AS.card, textAlign: 'center', padding: 60 }}>
          <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 20, color: 'var(--navy)', marginBottom: 8 }}>Begin met een lege plattegrond</div>
          <div style={{ fontSize: 13, color: '#8b8574', marginBottom: 4 }}>Upload de plattegrond van de locatie (PDF of afbeelding), zet hem op schaal met één bekende maat en sleep de partners en materialen erop.</div>
          <button style={AS.btn} onClick={nieuw}>Nieuwe plattegrond</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '46px 1fr 300px', gap: 10, height: 'calc(100vh - 180px)', minHeight: 600 }}>
          {/* gereedschap */}
          <div style={{ ...AS.card, padding: 4, margin: 0, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', overflowY: 'auto' }}>
            {knop('select', svgIcon('<path d="M5 3l14 8-6 2-3 6z" fill="currentColor"/>'), 'Selecteren', 'V')}
            {knop('direct', svgIcon('<path d="M5 3l14 8-6 2-3 6z"/>'), 'Direct selecteren: punten en losse objecten in een groep', 'A')}
            {scheiding}
            {knop('pen', svgIcon('<path d="M12 19l7-7 3 3-7 7z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z"/><circle cx="11" cy="11" r="2"/>'), 'Pen: vlak of pad. Klik op beginpunt = gesloten vlak, Enter/dubbelklik = open pad', 'P')}
            {knop('line', svgIcon('<path d="M4 20L20 4"/>'), 'Muur / lijn (shift = haaks)', '\\')}
            {knop('rect', svgIcon('<rect x="4" y="6" width="16" height="12" rx="1"/>'), 'Rechthoek (alt = vanuit midden, shift = vierkant)', 'M')}
            {knop('ellipse', svgIcon('<ellipse cx="12" cy="12" rx="8" ry="6"/>'), 'Ellips', 'L')}
            {knop('text', svgIcon('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'), 'Tekst', 'T')}
            {knop('hek', svgIcon('<path d="M3 7h18M3 17h18M5 7v10M10 7v10M14 7v10M19 7v10"/>'), 'Hekwerk / rijplaten tekenen (kies soort bij Materialen)', '')}
            {scheiding}
            {knop('nummer', svgIcon('<circle cx="12" cy="12" r="9"/><path d="M10 8l2-1v10"/>'), 'Nummeren: klik objecten op volgorde (alt-klik = nummer weg)', 'N')}
            {knop('pipet', svgIcon('<path d="M2 22l1-1h3l9-9M3 21v-3l9-9"/><path d="M15 6l3-3 3 3-3 3M12 9l3 3"/>'), 'Pipet: kopieer opmaak naar selectie', 'I')}
            {knop('measure', svgIcon('<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>'), 'Meetlat', 'U')}
            {scheiding}
            {knop('hand', svgIcon('<path d="M8 13V5a1.5 1.5 0 013 0v6m0-1V3.5a1.5 1.5 0 013 0V11m0-5.5a1.5 1.5 0 013 0V13m0-4.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-2a6 6 0 01-5-3l-2.7-4.5a1.5 1.5 0 012.5-1.6L8 14"/>'), 'Handje (of spatie ingedrukt)', 'H')}
            {knop('zoom', svgIcon('<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 11h6M11 8v6"/>'), 'Zoom (alt = uitzoomen)', 'Z')}
            <div style={{ flex: 1 }} />
            <button title="Ongedaan maken (⌘Z)" onClick={undo} style={{ ...klein, border: 'none', fontSize: 16 }}>↶</button>
            <button title="Opnieuw (⇧⌘Z)" onClick={redo} style={{ ...klein, border: 'none', fontSize: 16 }}>↷</button>
          </div>

          {/* canvas */}
          <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(1,3,65,0.08)', background: '#fbf8f1' }}>
            <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block', cursor, touchAction: 'none', userSelect: 'none' }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={onDouble}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                const p = naarM(e.clientX, e.clientY)
                const pid = e.dataTransfer.getData('partner'), mk = e.dataTransfer.getData('materiaal')
                const f = e.dataTransfer.files[0]
                if (pid && partnerById[pid]) plaatsPartner(partnerById[pid], p)
                else if (mk && MATERIAAL[mk]) plaatsMateriaal(MATERIAAL[mk], p)
                else if (f && (f.type.startsWith('image/') || f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))) kiesLocatie(f)
              }}>
              <defs>
                <pattern id="r-klein" width={rasterStap * view.s} height={rasterStap * view.s} patternUnits="userSpaceOnUse" x={-view.x * view.s} y={-view.y * view.s}>
                  <path d={`M ${rasterStap * view.s} 0 L 0 0 0 ${rasterStap * view.s}`} fill="none" stroke="rgba(1,3,65,0.05)" strokeWidth="1" />
                </pattern>
                <pattern id="r-groot" width={grootStap * view.s} height={grootStap * view.s} patternUnits="userSpaceOnUse" x={-view.x * view.s} y={-view.y * view.s}>
                  <path d={`M ${grootStap * view.s} 0 L 0 0 0 ${grootStap * view.s}`} fill="none" stroke="rgba(1,3,65,0.12)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#r-klein)" />
              <rect width="100%" height="100%" fill="url(#r-groot)" />
              <g id="tekening" transform={`scale(${view.s}) translate(${-view.x} ${-view.y})`}>
                {doc.bg && <image data-bg="1" href={doc.bg.src} x={doc.bg.x} y={doc.bg.y} width={doc.bg.w} height={doc.bg.h} opacity={doc.bg.opacity} preserveAspectRatio="none" style={{ pointerEvents: doc.bg.locked ? 'none' : 'auto' }} />}
                {gesorteerd.map(renderObj)}
                {gesorteerd.map(renderNummer)}
                <g data-ui>
                  {toonGidsen && doc.gidsen?.x.map((v, i) => <g key={'gx' + i}><line x1={v} x2={v} y1={view.y} y2={view.y + vh / view.s} stroke="#00b5d8" strokeWidth={sw} /><line data-gids={`x:${i}`} x1={v} x2={v} y1={view.y} y2={view.y + vh / view.s} stroke="transparent" strokeWidth={8 * sw} style={{ cursor: 'col-resize' }} /></g>)}
                  {toonGidsen && doc.gidsen?.y.map((v, i) => <g key={'gy' + i}><line y1={v} y2={v} x1={view.x} x2={view.x + vw / view.s} stroke="#00b5d8" strokeWidth={sw} /><line data-gids={`y:${i}`} y1={v} y2={v} x1={view.x} x2={view.x + vw / view.s} stroke="transparent" strokeWidth={8 * sw} style={{ cursor: 'row-resize' }} /></g>)}
                  {nieuweGids && (nieuweGids.as === 'x' ? <line x1={nieuweGids.v} x2={nieuweGids.v} y1={view.y} y2={view.y + vh / view.s} stroke="#00b5d8" strokeWidth={sw} /> : <line y1={nieuweGids.v} y2={nieuweGids.v} x1={view.x} x2={view.x + vw / view.s} stroke="#00b5d8" strokeWidth={sw} />)}
                  {handles()}
                  {gidsen.x !== undefined && <line x1={gidsen.x} x2={gidsen.x} y1={view.y} y2={view.y + vh / view.s} stroke="#e0338a" strokeWidth={sw} />}
                  {gidsen.y !== undefined && <line y1={gidsen.y} y2={gidsen.y} x1={view.x} x2={view.x + vw / view.s} stroke="#e0338a" strokeWidth={sw} />}
                  {[...(gidsen.afst || []), ...altAfst].map((a, i) => {
                    const hor = Math.abs(a.a[1] - a.b[1]) < 1e-6, mx = (a.a[0] + a.b[0]) / 2, my = (a.a[1] + a.b[1]) / 2
                    return <g key={'af' + i}>
                      <line x1={a.a[0]} y1={a.a[1]} x2={a.b[0]} y2={a.b[1]} stroke="#e0338a" strokeWidth={sw} />
                      {hor ? <><line x1={a.a[0]} x2={a.a[0]} y1={a.a[1] - 4 * sw} y2={a.a[1] + 4 * sw} stroke="#e0338a" strokeWidth={sw} /><line x1={a.b[0]} x2={a.b[0]} y1={a.b[1] - 4 * sw} y2={a.b[1] + 4 * sw} stroke="#e0338a" strokeWidth={sw} /></>
                        : <><line y1={a.a[1]} y2={a.a[1]} x1={a.a[0] - 4 * sw} x2={a.a[0] + 4 * sw} stroke="#e0338a" strokeWidth={sw} /><line y1={a.b[1]} y2={a.b[1]} x1={a.b[0] - 4 * sw} x2={a.b[0] + 4 * sw} stroke="#e0338a" strokeWidth={sw} /></>}
                      <rect x={mx - 26 * sw} y={my - 8 * sw} width={52 * sw} height={16 * sw} rx={4 * sw} fill="#e0338a" />
                      <text x={mx} y={my + 0.5 * sw} fontSize={10.5 * sw} fill="#fff" textAnchor="middle" dominantBaseline="middle" fontFamily="Inter" fontWeight={600}>{fmt(a.l)}</text>
                    </g>
                  })}
                  {marquee && (() => { const b = bbox([marquee.a, marquee.b]); return <rect x={b.x1} y={b.y1} width={b.x2 - b.x1} height={b.y2 - b.y1} fill="rgba(43,108,176,0.08)" stroke="#2b6cb0" strokeWidth={sw} /> })()}
                  {concept && tool === 'pen' && concept.length > 2 && <polygon points={concept.map(p => p.join(',')).join(' ')} fill="rgba(43,108,176,0.08)" stroke="none" />}
                  {concept && <polyline points={concept.map(p => p.join(',')).join(' ')} fill="none" stroke={tool === 'measure' ? '#e0338a' : tool === 'calibrate' ? '#d69e2e' : tool === 'hek' ? (MATERIAAL[hekMat]?.kleur || '#4a5568') : '#010341'} strokeOpacity={tool === 'hek' ? 0.5 : 1} strokeWidth={tool === 'line' ? 0.2 : tool === 'hek' ? (MATERIAAL[hekMat]?.breedte || 0.2) : 2 * sw} strokeDasharray={tool === 'measure' || tool === 'calibrate' ? `${6 * sw} ${3 * sw}` : undefined} />}
                  {concept && concept.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={(i === 0 && tool === 'pen' ? 5 : 3.5) * sw} fill="#fff" stroke="#2b6cb0" strokeWidth={1.5 * sw} />)}
                  {conceptLabel && (
                    <g transform={`translate(${conceptLabel.b[0] + 12 * sw} ${conceptLabel.b[1] - 12 * sw})`}>
                      <rect x={0} y={-16 * sw} width={(conceptLabel.txt.length * 6.4 + 14) * sw} height={22 * sw} rx={5 * sw} fill="#010341" />
                      <text x={8 * sw} y={-1 * sw} fontSize={12 * sw} fill="#fff" fontFamily="Inter" fontWeight={600}>{conceptLabel.txt}</text>
                    </g>
                  )}
                </g>
              </g>
              {liniaal()}
            </svg>

            {/* tekst bewerken op het canvas */}
            {tekstEdit && tekstObj && (() => {
              const [sx, sy] = naarScherm([tekstObj.x, tekstObj.y])
              const fs = tekstObj.kind === 'text' ? Math.max(12, (tekstObj.tekstgrootte || 1) * view.s) : 14
              return <input autoFocus value={tekstEdit.waarde} placeholder={tekstObj.kind === 'text' ? 'Typ tekst…' : 'Label…'}
                onChange={e => setTekstEdit({ ...tekstEdit, waarde: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') bevestigTekst(); if (e.key === 'Escape') setTekstEdit(null); e.stopPropagation() }}
                onBlur={bevestigTekst}
                style={{ position: 'absolute', left: sx, top: sy, fontSize: fs, fontFamily: 'Fraunces, Georgia, serif', fontWeight: 600, color: 'var(--navy)', background: 'rgba(255,255,255,0.9)', border: '1.5px solid #2b6cb0', borderRadius: 4, padding: '0 4px', outline: 'none', minWidth: 160 }} />
            })()}

            {/* verplaatsen-dialoog (Enter) */}
            {verplaatsDlg && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(1,3,65,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }} onPointerDown={e => { if (e.target === e.currentTarget) setVerplaatsDlg(null) }}>
                <div style={{ ...AS.card, width: 280, margin: 0 }}>
                  <div style={AS.cardTitle}>Verplaatsen</div>
                  {(['dx', 'dy'] as const).map((k, i) => (
                    <label key={k} style={{ fontSize: 12, color: '#777162', display: 'block', marginBottom: 8 }}>{k === 'dx' ? 'Horizontaal (m)' : 'Verticaal (m)'}
                      <input autoFocus={i === 0} style={AS.input} value={verplaatsDlg[k]} onChange={e => setVerplaatsDlg({ ...verplaatsDlg, [k]: e.target.value })}
                        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') setVerplaatsDlg(null); if (e.key === 'Enter') (e.currentTarget.closest('div')!.parentElement!.querySelector('[data-ok]') as HTMLButtonElement).click() }} /></label>
                  ))}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button style={{ ...AS.btnSm }} onClick={() => setVerplaatsDlg(null)}>Annuleer</button>
                    <button style={{ ...AS.btnSm }} onClick={() => { const dx = parseFloat(verplaatsDlg.dx.replace(',', '.')) || 0, dy = parseFloat(verplaatsDlg.dy.replace(',', '.')) || 0; const k = kopieer(gesel, dx, dy); if (k.length) voegToe(k); laatsteTransform.current = { dx, dy, kopie: true }; setVerplaatsDlg(null) }}>Kopie</button>
                    <button data-ok style={{ ...AS.btnSm, background: 'var(--navy)', color: 'var(--cream)' }} onClick={() => { const dx = parseFloat(verplaatsDlg.dx.replace(',', '.')) || 0, dy = parseFloat(verplaatsDlg.dy.replace(',', '.')) || 0; wijzig(sel, o => o.locked ? o : verplaats(o, dx, dy)); laatsteTransform.current = { dx, dy, kopie: false }; setVerplaatsDlg(null) }}>OK</button>
                  </div>
                  <div style={{ fontSize: 10.5, color: '#a39d8c', marginTop: 8 }}>Tip: Kopie en daarna ⌘D herhaalt het, handig voor een rij statafels.</div>
                </div>
              </div>
            )}

            {/* schaalbalk en coördinaten */}
            <div style={{ position: 'absolute', left: linialen ? 28 : 12, bottom: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: '#777162', fontFamily: 'Inter', pointerEvents: 'none' }}>
              <div>
                <div style={{ width: grootStap * view.s, height: 6, borderLeft: '2px solid #010341', borderRight: '2px solid #010341', borderBottom: '2px solid #010341' }} />
                <div style={{ textAlign: 'center', marginTop: 2 }}>{String(grootStap).replace('.', ',')} m</div>
              </div>
              <span style={{ background: 'rgba(255,255,255,0.85)', padding: '2px 6px', borderRadius: 5 }}>x {r2(muis[0])} · y {r2(muis[1])} m</span>
            </div>
            <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', gap: 3, background: 'rgba(255,255,255,0.94)', borderRadius: 10, padding: 4, boxShadow: '0 2px 10px rgba(1,3,65,0.08)', alignItems: 'center' }}>
              <button style={{ ...klein, border: 'none' }} onClick={() => zoomOp(1 / 1.3)} title="⌘-">−</button>
              <span style={{ fontSize: 11, color: '#777162', minWidth: 62, textAlign: 'center' }}>1 m = {Math.round(view.s)} px</span>
              <button style={{ ...klein, border: 'none' }} onClick={() => zoomOp(1.3)} title="⌘+">+</button>
              <button style={{ ...klein, border: 'none' }} onClick={passend} title="⌘0">Passend</button>
            </div>
            <div style={{ position: 'absolute', left: linialen ? 26 : 10, top: linialen ? 26 : 10, display: 'flex', gap: 10, background: 'rgba(255,255,255,0.94)', borderRadius: 10, padding: '5px 10px', fontSize: 11.5, color: 'var(--navy)', boxShadow: '0 2px 10px rgba(1,3,65,0.08)', alignItems: 'center', flexWrap: 'wrap', maxWidth: 'calc(100% - 60px)' }}>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> Magnetisch</label>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }} title="⌘U"><input type="checkbox" checked={slim} onChange={e => setSlim(e.target.checked)} /> Slimme hulplijnen</label>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>raster
                <select value={raster} onChange={e => setRaster(parseFloat(e.target.value))} style={{ fontSize: 11.5, border: '1px solid #e3dcc9', borderRadius: 6, padding: '1px 3px' }}>
                  {[0.1, 0.25, 0.5, 1, 2, 5].map(v => <option key={v} value={v}>{String(v).replace('.', ',')} m</option>)}
                </select></label>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={toonMaten} onChange={e => setToonMaten(e.target.checked)} /> Maten</label>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }} title="⌘R"><input type="checkbox" checked={linialen} onChange={e => setLinialen(e.target.checked)} /> Linialen</label>
              {overlappers.size > 0 && <span style={{ color: '#e53935', fontWeight: 600 }}>⚠ {overlappers.size} blokken overlappen</span>}
            </div>
            {(tool !== 'select' && tool !== 'hand' && tool !== 'direct') && (
              <div style={{ position: 'absolute', left: '50%', top: linialen ? 62 : 48, transform: 'translateX(-50%)', background: 'var(--navy)', color: 'var(--cream)', fontSize: 12, padding: '6px 12px', borderRadius: 8, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                {({ rect: 'Sleep een rechthoek. Shift = vierkant, alt = vanuit het midden.', ellipse: 'Sleep een ellips. Shift = cirkel.', line: 'Klik punten voor een muur. Shift = haaks. Dubbelklik, Enter of Esc = klaar.', pen: 'Klik punten. Klik op het beginpunt voor een gesloten vlak, Enter voor een open pad.', text: 'Klik waar de tekst moet komen.', measure: 'Klik twee punten om te meten. Esc = stoppen.', calibrate: 'Trek een lijn over een maat die je kent, bijvoorbeeld een muur.', zoom: 'Klik om in te zoomen, alt-klik om uit te zoomen.', pipet: 'Klik op een object om de opmaak over te nemen op je selectie.', nummer: `Klik objecten op volgorde. Volgende nummer: ${nrVolgende}. Alt-klik = nummer weg.`, hek: `${MATERIAAL[hekMat]?.label}: klik de route. Shift = haaks, dubbelklik of Enter = klaar.`, hand: '', select: '', direct: '' } as Record<Tool, string>)[tool]}
              </div>
            )}
            {uploadBezig && <div style={{ position: 'absolute', inset: 0, background: 'rgba(251,248,241,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--navy)', fontFamily: 'Fraunces, Georgia, serif' }}>Plattegrond van de locatie inladen…</div>}
          </div>

          {/* rechterpaneel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
            <div style={{ ...AS.card, margin: 0, padding: '12px 14px', maxHeight: '48%', overflowY: 'auto', flexShrink: 0 }}>
              {enkel ? <>
                <div style={{ ...AS.cardTitle, marginBottom: 6, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{naamVan(enkel)}</span>
                  <span style={{ fontWeight: 400, color: '#8b8574', fontSize: 11.5, whiteSpace: 'nowrap' }}>{enkel.kind === 'line' || enkel.kind === 'hek' ? fmt(lengte(enkel.pts!)) : enkel.kind === 'legenda' ? '' : `${r2(oppervlak(enkel))} m²`}</span>
                </div>
                {isBlok(enkel.kind) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
                    {([['x', 'X'], ['y', 'Y'], ['rot', 'Hoek °'], ['w', 'B'], ['h', 'D']] as [keyof Obj, string][]).map(([k, l]) => (
                      <label key={k} style={{ fontSize: 10.5, color: '#777162' }}>{l}
                        <input style={mini} type="number" step={k === 'rot' ? 15 : 0.1} value={r2(enkel[k] as number)} disabled={enkel.locked || (enkel.kind === 'partner' && (k === 'w' || k === 'h')) || (enkel.kind === 'legenda' && k === 'h')}
                          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) wijzig([enkel.id], o => ({ ...o, [k]: k === 'w' || k === 'h' ? Math.max(0.1, v) : v })) }} />
                      </label>
                    ))}
                    <label style={{ fontSize: 10.5, color: '#777162' }}>Nr.
                      <input style={mini} type="number" min={1} value={enkel.nr ?? ''} onChange={e => { const v = parseInt(e.target.value); wijzig([enkel.id], o => ({ ...o, nr: isNaN(v) ? undefined : v })) }} />
                    </label>
                  </div>
                )}
                {enkel.kind === 'hek' && <div style={{ fontSize: 12, color: 'var(--navy)' }}>{hekStuks(enkel)} stuks van {String(MATERIAAL[enkel.mat || '']?.stuk).replace('.', ',')} m
                  <select style={{ ...mini, marginTop: 6 }} value={enkel.mat} onChange={e => wijzig([enkel.id], o => ({ ...o, mat: e.target.value }))}>
                    {MATERIALEN.filter(m => m.soort === 'lijn').map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select></div>}
                {enkel.kind === 'partner' && <div style={{ fontSize: 10.5, color: '#8b8574', marginTop: 5 }}>Maat komt van de partner. Aanpassen kan in de partnerlijst.</div>}
                {enkel.kind === 'materiaal' && <label style={{ fontSize: 11, color: '#777162', display: 'flex', gap: 5, alignItems: 'center', marginTop: 6, cursor: 'pointer' }}><input type="checkbox" checked={!!enkel.toonLabel} onChange={e => wijzig([enkel.id], o => ({ ...o, toonLabel: e.target.checked }))} /> Naam tonen</label>}
                {enkel.kind === 'text' && <label style={{ fontSize: 11, color: '#777162', display: 'block', marginTop: 4 }}>Lettergrootte (m)
                  <input style={mini} type="number" step={0.1} value={r2(enkel.tekstgrootte || 1)} onChange={e => wijzig([enkel.id], o => ({ ...o, tekstgrootte: Math.max(0.1, parseFloat(e.target.value) || 1) }))} /></label>}
                {enkel.kind !== 'partner' && enkel.kind !== 'hek' && <label style={{ fontSize: 11, color: '#777162', display: 'block', marginTop: 4 }}>{enkel.kind === 'legenda' ? 'Titel' : 'Label'}
                  <input style={mini} value={enkel.label || ''} placeholder={MATERIAAL[enkel.mat || '']?.label} onChange={e => wijzig([enkel.id], o => ({ ...o, label: e.target.value }), false)} onBlur={() => setOpgeslagen('nee')} /></label>}
                {enkel.kind !== 'legenda' && uiterlijk([enkel])}
                <label style={{ fontSize: 11, color: '#777162', display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>Laag
                  <select style={{ ...mini, flex: 1 }} value={enkel.laag} onChange={e => naarLaag(e.target.value)}>{lagen.map(l => <option key={l.id} value={l.id}>{l.naam}</option>)}</select></label>
                {schikKnoppen}
              </> : gesel.length > 1 ? <>
                <div style={{ ...AS.cardTitle, marginBottom: 4 }}>{gesel.length} objecten{gesel.every(o => o.groep && o.groep === gesel[0].groep) ? ' (groep)' : ''}</div>
                <div style={sectie}>Uitlijnen</div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {([['links', '⇤', 'Links'], ['hmidden', '↔', 'Horizontaal midden'], ['rechts', '⇥', 'Rechts'], ['boven', '⤒', 'Boven'], ['vmidden', '↕', 'Verticaal midden'], ['onder', '⤓', 'Onder']] as const).map(([k, i, t]) => <button key={k} style={klein} title={t} onClick={() => lijnUit(k)}>{i}</button>)}
                </div>
                <div style={{ display: 'flex', gap: 3, marginTop: 5, flexWrap: 'wrap' }}>
                  {gesel.length > 2 && <><button style={klein} onClick={() => lijnUit('hverdeel')}>Verdeel ↔</button><button style={klein} onClick={() => lijnUit('vverdeel')}>Verdeel ↕</button></>}
                  <button style={klein} onClick={() => verdeelMetTussenruimte('x')}>Tussenruimte ↔</button>
                  <button style={klein} onClick={() => verdeelMetTussenruimte('y')}>Tussenruimte ↕</button>
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                  <button style={klein} title="⌘G" onClick={groepeer}>Groepeer</button>
                  <button style={klein} title="⇧⌘G" onClick={degroepeer}>Groep opheffen</button>
                  <button style={klein} onClick={nummerAuto}>Nummer deze</button>
                </div>
                {uiterlijk(gesel)}
                <label style={{ fontSize: 11, color: '#777162', display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>Naar laag
                  <select style={{ ...mini, flex: 1 }} value="" onChange={e => e.target.value && naarLaag(e.target.value)}><option value="">Kies…</option>{lagen.map(l => <option key={l.id} value={l.id}>{l.naam}</option>)}</select></label>
                {schikKnoppen}
              </> : <>
                <div style={{ ...AS.cardTitle, marginBottom: 6 }}>Upload plattegrond locatie</div>
                {doc.bg ? <>
                  <label style={{ fontSize: 11, color: '#777162' }}>Doorzichtigheid
                    <input type="range" min={0.05} max={1} step={0.05} value={doc.bg.opacity} onChange={e => setDoc(d => d.bg ? { ...d, bg: { ...d.bg, opacity: parseFloat(e.target.value) } } : d, false)} style={{ width: '100%' }} /></label>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button style={klein} onClick={() => setTool('calibrate')}>Op schaal zetten</button>
                    <button style={klein} onClick={() => setDoc(d => d.bg ? { ...d, bg: { ...d.bg, locked: !d.bg.locked } } : d)}>{doc.bg.locked ? 'Ontgrendel' : 'Vergrendel'}</button>
                    <label style={{ ...klein, cursor: 'pointer' }}>Vervang<input type="file" accept="image/*,application/pdf,.pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) kiesLocatie(f) }} /></label>
                    <button style={{ ...klein, color: '#999' }} onClick={() => setDoc(d => ({ ...d, bg: null }))}>Weg</button>
                  </div>
                  <div style={{ fontSize: 11, color: '#8b8574', marginTop: 5 }}>{fmt(doc.bg.w)} × {fmt(doc.bg.h)}</div>
                </> : <>
                  <div style={{ fontSize: 12, color: '#8b8574', marginBottom: 6 }}>PDF, PNG of JPG van de locatie. Hij komt onder je tekening te liggen, zodat je kunt overtrekken. Slepen op de tekening kan ook.</div>
                  <label style={{ ...klein, display: 'inline-block', cursor: 'pointer' }}>{uploadBezig ? 'Bezig…' : 'Bestand kiezen'}
                    <input type="file" accept="image/*,application/pdf,.pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) kiesLocatie(f) }} /></label>
                </>}
                <div style={sectie}>Nummering & legenda</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button style={klein} onClick={nummerAuto} title="Alle partners en materialen, van linksboven naar rechtsonder">Automatisch nummeren</button>
                  <button style={klein} onClick={() => setTool('nummer')}>Met de hand (N)</button>
                  <button style={{ ...klein, color: '#999' }} onClick={nummersWissen}>Wis nummers</button>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                  <button style={{ ...klein, background: 'var(--navy)', color: 'var(--cream)', borderColor: 'var(--navy)' }} onClick={plaatsLegenda}>Legenda plaatsen</button>
                  <label style={{ fontSize: 11, color: '#777162', display: 'flex', alignItems: 'center', gap: 4 }}>nummer Ø
                    <input style={{ ...mini, width: 56 }} type="number" step={0.1} min={0.2} value={r2(nrStraal * 2)} onChange={e => setDoc(d => ({ ...d, nrGrootte: Math.max(0.1, (parseFloat(e.target.value) || 1.2) / 2) }))} /> m</label>
                </div>
                <div style={{ fontSize: 10.5, color: '#a39d8c', marginTop: 10, lineHeight: 1.55 }}>
                  <b>Sneltoetsen zoals Illustrator</b><br />
                  V selecteer · A direct · P pen · \ lijn · M rechthoek · L ellips · T tekst · N nummer · I pipet · U meet · H hand · Z zoom<br />
                  ⌘G groep · ⌘2 vergrendel · ⌘3 verberg · ⌘D nogmaals · Enter verplaatsen · ⌘F/⌘B plak voor/achter · ⌘[ ] schikken · R draai 90° · O spiegel · alt-slepen kopie · alt ingedrukt = afstanden · ⌘R linialen (sleep er hulplijnen uit) · ⌘; hulplijnen · ⌘0 passend · ⌘1 1 m = 50 px
                </div>
              </>}
            </div>

            {/* tabbladen */}
            <div style={{ ...AS.card, margin: 0, padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(1,3,65,0.07)' }}>
                {([['partners', `Partners ${relevante.filter(p => geplaatst.has(p.id)).length}/${relevante.length}`], ['materialen', 'Materialen'], ['lagen', 'Lagen'], ['lijst', 'Lijst']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setZijTab(k)} style={{ flex: 1, padding: '9px 2px', border: 'none', background: 'none', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', color: zijTab === k ? 'var(--navy)' : '#a39d8c', borderBottom: zijTab === k ? '2px solid var(--bordeaux)' : '2px solid transparent', whiteSpace: 'nowrap' }}>{l}</button>
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
                        const ob = doc.objs.find(o => o.partnerId === p.id)
                        return (
                          <div key={p.id} draggable={!op} onDragStart={e => e.dataTransfer.setData('partner', p.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 7, cursor: op ? 'pointer' : 'grab', background: op ? 'transparent' : '#fbf8f1', marginBottom: 2, border: op ? '1px solid transparent' : '1px dashed #e3dcc9' }}
                            onClick={() => plaatsPartner(p)}>
                            <span style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', background: op ? (ob?.nr ? '#010341' : '#2e6b3a') : 'transparent', border: op ? 'none' : '1.5px solid #c9c1ab' }}>{op ? (ob?.nr ?? '✓') : ''}</span>
                            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--navy)', opacity: op ? 0.6 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.naam}>{bnaam(p)}</span>
                            <span onClick={e => e.stopPropagation()} style={{ fontSize: 10.5, color: mt.eigen ? '#2e6b3a' : '#a39d8c', whiteSpace: 'nowrap' }} title={mt.eigen ? 'Door partner ingevuld' : 'Standaardmaat, nog niet ingevuld door partner'}>
                              <input defaultValue={p.stand_breedte_m ?? ''} placeholder={String(mt.w)} onBlur={e => e.target.value !== String(p.stand_breedte_m ?? '') && slaMaatOp(p, e.target.value, String(p.stand_diepte_m ?? ''))} style={{ width: 28, fontSize: 10.5, border: '1px solid #eee5d2', borderRadius: 4, padding: '0 2px', textAlign: 'right' }} />×<input defaultValue={p.stand_diepte_m ?? ''} placeholder={String(mt.h)} onBlur={e => e.target.value !== String(p.stand_diepte_m ?? '') && slaMaatOp(p, String(p.stand_breedte_m ?? ''), e.target.value)} style={{ width: 28, fontSize: 10.5, border: '1px solid #eee5d2', borderRadius: 4, padding: '0 2px' }} />
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                  <div style={{ fontSize: 10.5, color: '#a39d8c', lineHeight: 1.5 }}>Sleep een partner op de tekening of klik erop. Groene maat = door de partner zelf ingevuld, grijs = standaardmaat van het pakket.</div>
                </>}
                {zijTab === 'materialen' && <>
                  <input style={{ ...mini, marginBottom: 6 }} placeholder="Zoek materiaal… (aggregaat, hek, tent)" value={matZoek} onChange={e => setMatZoek(e.target.value)} />
                  {CATEGORIEEN.map(cat => {
                    const items = matGefilterd.filter(m => m.cat === cat); if (!items.length) return null
                    return <div key={cat} style={{ marginBottom: 10 }}>
                      <div style={{ ...sectie, marginTop: 6 }}>{cat}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                        {items.map(m => {
                          const n = telling.find(t => t.mat.key === m.key)
                          return (
                            <div key={m.key} draggable={m.soort !== 'lijn'} onDragStart={e => e.dataTransfer.setData('materiaal', m.key)} onClick={() => plaatsMateriaal(m)}
                              title={`${m.label} · ${m.soort === 'lijn' ? `teken een lijn, ${String(m.stuk).replace('.', ',')} m per stuk` : `${m.w} × ${m.h} m`}`}
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 8, cursor: m.soort === 'lijn' ? 'crosshair' : 'grab', border: tool === 'hek' && hekMat === m.key ? '1.5px solid var(--navy)' : '1px solid #eee5d2', background: '#fff', position: 'relative' }}>
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={m.kleur} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: m.kleur }} dangerouslySetInnerHTML={{ __html: m.icoon }} />
                              <span style={{ fontSize: 11, color: 'var(--navy)', lineHeight: 1.2, overflow: 'hidden' }}>{m.label}<br /><span style={{ color: '#a39d8c', fontSize: 10 }}>{m.soort === 'lijn' ? `lijn · ${String(m.stuk).replace('.', ',')} m/st` : `${String(m.w).replace('.', ',')}×${String(m.h).replace('.', ',')}`}</span></span>
                              {n && <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 9.5, fontWeight: 700, color: '#2e6b3a' }}>{n.stuks}</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  })}
                  <div style={{ fontSize: 10.5, color: '#a39d8c', lineHeight: 1.5 }}>Klik of sleep op de tekening. Hekken, rijplaten en kabelbruggen teken je als lijn; de tool rekent uit hoeveel stuks je nodig hebt.</div>
                </>}
                {zijTab === 'lagen' && <>
                  {[...lagen].reverse().map((l, ri) => {
                    const i = lagen.length - 1 - ri
                    const objs = gesorteerd.filter(o => o.laag === l.id).reverse()
                    const zetLaag = (p: Partial<Laag>) => setDoc(d => ({ ...d, lagen: (d.lagen || STANDAARD_LAGEN).map(x => x.id === l.id ? { ...x, ...p } : x) }))
                    return <div key={l.id} style={{ marginBottom: 6 }}>
                      <div onClick={() => setActieveLaag(l.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 6px', borderRadius: 7, background: actieveLaag === l.id ? 'rgba(1,3,65,0.06)' : 'transparent', cursor: 'pointer' }}>
                        <button title="Zichtbaar" onClick={e => { e.stopPropagation(); zetLaag({ zichtbaar: !l.zichtbaar }) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, opacity: l.zichtbaar ? 1 : 0.25, width: 18 }}>👁</button>
                        <button title="Vergrendelen" onClick={e => { e.stopPropagation(); zetLaag({ vast: !l.vast }) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, opacity: l.vast ? 1 : 0.25, width: 18 }}>🔒</button>
                        <span onDoubleClick={() => { const n = prompt('Naam van de laag', l.naam); if (n) zetLaag({ naam: n }) }} style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--navy)' }}>{l.naam}</span>
                        <span style={{ fontSize: 10.5, color: '#a39d8c' }}>{objs.length}</span>
                        <button title="Omhoog" disabled={i === lagen.length - 1} onClick={e => { e.stopPropagation(); setDoc(d => { const ls = [...(d.lagen || [])];[ls[i], ls[i + 1]] = [ls[i + 1], ls[i]]; return { ...d, lagen: ls } }) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, opacity: 0.5 }}>▲</button>
                        <button title="Omlaag" disabled={i === 0} onClick={e => { e.stopPropagation(); setDoc(d => { const ls = [...(d.lagen || [])];[ls[i], ls[i - 1]] = [ls[i - 1], ls[i]]; return { ...d, lagen: ls } }) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, opacity: 0.5 }}>▼</button>
                        {lagen.length > 1 && <button title="Laag verwijderen (inhoud gaat naar de laag eronder)" onClick={e => { e.stopPropagation(); if (!confirm(`Laag "${l.naam}" verwijderen? De objecten gaan naar een andere laag.`)) return; const doel = lagen.find(x => x.id !== l.id)!.id; setDoc(d => ({ ...d, lagen: (d.lagen || []).filter(x => x.id !== l.id), objs: d.objs.map(o => o.laag === l.id ? { ...o, laag: doel } : o) })) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, opacity: 0.4 }}>×</button>}
                      </div>
                      {objs.map(o => (
                        <div key={o.id} onClick={() => { if (selecteerbaar(o)) setSel(metGroep([o.id])); centreerOp(o) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 6px 2px 28px', borderRadius: 6, cursor: 'pointer', background: sel.includes(o.id) ? 'rgba(43,108,176,0.1)' : 'transparent', fontSize: 11.5, color: 'var(--navy)', opacity: o.verborgen ? 0.4 : 1 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: kleurVan(o) === 'none' ? '#fff' : kleurVan(o), border: '1px solid rgba(0,0,0,0.1)' }} />
                          {o.nr && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', background: '#010341', borderRadius: 8, padding: '0 4px' }}>{o.nr}</span>}
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{naamVan(o)}{o.groep ? ' ⧉' : ''}</span>
                          <button onClick={e => { e.stopPropagation(); wijzig([o.id], q => ({ ...q, verborgen: !q.verborgen })) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, opacity: o.verborgen ? 1 : 0.25 }} title="Verbergen">👁</button>
                          <button onClick={e => { e.stopPropagation(); wijzig([o.id], q => ({ ...q, locked: !q.locked })); setSel(s => s.filter(i => i !== o.id)) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, opacity: o.locked ? 1 : 0.25 }} title="Vergrendelen">🔒</button>
                        </div>
                      ))}
                    </div>
                  })}
                  <button style={klein} onClick={() => { const n = prompt('Naam van de nieuwe laag', 'Nieuwe laag'); if (!n) return; const id = uid(); setDoc(d => ({ ...d, lagen: [...(d.lagen || STANDAARD_LAGEN), { id, naam: n, zichtbaar: true, vast: false }] })); setActieveLaag(id) }}>+ Nieuwe laag</button>
                  <div style={{ fontSize: 10.5, color: '#a39d8c', marginTop: 8, lineHeight: 1.5 }}>Klik op een laag om erin te tekenen. Dubbelklik om te hernoemen. Vergrendel de laag Locatie als je de zaal klaar hebt.</div>
                </>}
                {zijTab === 'lijst' && <>
                  <div style={{ fontSize: 12, color: '#8b8574', marginBottom: 8 }}>Alles wat op de tekening staat, geteld. Handig voor de bestelling bij de verhuurder.</div>
                  {!telling.length && !pakketTelling.length && <div style={{ fontSize: 12, color: '#a39d8c' }}>Nog niets geteld.</div>}
                  {CATEGORIEEN.map(cat => {
                    const items = telling.filter(t => t.mat.cat === cat); if (!items.length) return null
                    return <div key={cat}>
                      <div style={sectie}>{cat}</div>
                      {items.map(t => (
                        <div key={t.mat.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 12.5, color: 'var(--navy)', borderBottom: '1px solid #f3eee2' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.mat.kleur} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ color: t.mat.kleur }} dangerouslySetInnerHTML={{ __html: t.mat.icoon }} />
                          <span style={{ flex: 1 }}>{t.mat.label}</span>
                          <span style={{ fontWeight: 700 }}>{t.stuks}×</span>
                          {t.meter > 0 && <span style={{ fontSize: 11, color: '#8b8574', width: 48, textAlign: 'right' }}>{Math.round(t.meter)} m</span>}
                        </div>
                      ))}
                    </div>
                  })}
                  {pakketTelling.length > 0 && <><div style={sectie}>Partners</div>{pakketTelling.map(p => <div key={p.maat.pakket} style={{ display: 'flex', gap: 6, padding: '3px 0', fontSize: 12.5, color: 'var(--navy)', borderBottom: '1px solid #f3eee2' }}><span style={{ width: 10, height: 10, borderRadius: 2, background: p.maat.kleur, marginTop: 3 }} /><span style={{ flex: 1 }}>{p.maat.label}</span><b>{p.n}×</b></div>)}</>}
                  {(telling.length > 0 || pakketTelling.length > 0) && <button style={{ ...klein, marginTop: 12 }} onClick={csv}>Download materiaallijst (CSV)</button>}
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

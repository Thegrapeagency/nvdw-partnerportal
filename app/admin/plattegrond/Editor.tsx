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
import type React from 'react'
import { AS } from './stijl'
import { MATERIALEN, MATERIAAL, CATEGORIEEN, OUDE_VOORZIENING, isLijn, stijlVan, symboolSvg, leesbaarOp, LIJNKLEUR, VAKLAGEN, laagVanMateriaal, type Materiaal } from './materialen'
import type { Pt, Kind, Obj, Laag, Bg, Doc, Meta, PartnerRij, Maat, Adapter } from './types'
import { STANDAARD_NORMEN } from './types'
import { r2, fmt, isBlok, hoeken, bbox, overlapt, draaiPunt, lengte, hekStuks, oppervlak, puntInPoly, afstandTotLijn, haaks } from './geo'
import { kaartTegels, zoekAdres, type Adres } from './kaart'
import { controleer, kengetallen, OMHULLEND, type Check } from './controle'
import { maakBlad, kiesSchaal, PAPIER, SCHALEN, type Gebied } from './blad'

type Tool = 'select' | 'direct' | 'rect' | 'ellipse' | 'line' | 'pen' | 'text' | 'measure' | 'calibrate' | 'hand' | 'zoom' | 'pipet' | 'nummer' | 'hek' | 'maat'

const uid = () => Math.random().toString(36).slice(2, 10)
const STANDAARD_LAGEN: Laag[] = VAKLAGEN.map(v => ({ id: v.id, naam: v.naam, zichtbaar: true, vast: false }))
const leeg: Doc = { objs: [], bg: null, kaart: null, lagen: STANDAARD_LAGEN, gidsen: { x: [], y: [] }, meta: {} }
const bnaam = (p: { naam: string; bedrijfsnaam: string | null }) => (p.bedrijfsnaam || '').trim() || p.naam
const KLEUREN = ['#9b3737', '#c9a24b', '#2e6b3a', '#010341', '#5b6b8c', '#8b8574', '#d9cfb8', '#2b6cb0', '#c53030', '#d69e2e', '#4a5568', '#ffffff']

// Oude documenten bijwerken naar het huidige formaat
const migreer = (d: Doc): Doc => {
  // tekeningen van voor de vakgebied-lagen: alles uit 'Infra' naar de juiste laag
  const oudeIndeling = !!d.lagen?.some(l => l.id === 'infra') && !d.lagen.some(l => l.id === 'stroom')
  const lagen = oudeIndeling ? [...STANDAARD_LAGEN, ...d.lagen!.filter(l => !['locatie', 'infra', 'partners', 'teksten'].includes(l.id))] : d.lagen?.length ? d.lagen : STANDAARD_LAGEN
  const herlaag = (o: Obj): Obj => oudeIndeling && o.laag === 'infra' ? { ...o, laag: o.kind === 'materiaal' || o.kind === 'hek' ? laagVanMateriaal(MATERIAAL[o.mat || '']) : 'locatie' } : o
  const objs = (d.objs || []).map(herlaag).map(o => {
    let n = o
    if (o.kind === 'voorziening') n = { ...o, kind: 'materiaal', mat: OUDE_VOORZIENING[o.voorziening || ''] || 'bord', toonLabel: true }
    if (!n.laag || !lagen.some(l => l.id === n.laag)) n = { ...n, laag: n.kind === 'partner' ? (lagen.find(l => l.id === 'partners')?.id || lagen[0].id) : n.kind === 'poly' || n.kind === 'line' ? lagen[0].id : (lagen.find(l => l.id === 'infra')?.id || lagen[0].id) }
    return n
  })
  return { ...d, objs, lagen, versies: d.versies?.map(v => ({ ...v, objs: v.objs.map(herlaag) })), gidsen: d.gidsen || { x: [], y: [] }, meta: d.meta || {} }
}

export default function PlattegrondEditor({ adapter, flash }: { adapter: Adapter; flash: (m: string, ms?: number) => void }) {
  // ---- data ----
  const [lijst, setLijst] = useState<{ id: string; naam: string; updated_at: string }[]>([])
  const [huidigId, setHuidigId] = useState<string | null>(null)
  const [naam, setNaam] = useState('')
  const [doc, setDocRaw] = useState<Doc>(leeg)
  const docRef = useRef(doc); docRef.current = doc
  const [basisPartners, setPartners] = useState<PartnerRij[]>([])
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
  const [zijTab, setZijTab] = useState<'locatie' | 'partners' | 'materialen' | 'check' | 'lagen'>('locatie')
  const [metaDlg, setMetaDlg] = useState<(Meta & { nieuw?: boolean }) | null>(null)
  const [exportDlg, setExportDlg] = useState<{ papier: string; schaal: number | 'auto'; titel: string; vakken?: boolean; bezig?: boolean } | null>(null)
  const [adresQ, setAdresQ] = useState('')
  const [adressen, setAdressen] = useState<Adres[] | null>(null)
  const [toonNormen, setToonNormen] = useState(false)
  const [groepHoek, setGroepHoek] = useState<number | null>(null) // tijdens het draaien van een groep
  const [draaiInvoer, setDraaiInvoer] = useState('45')
  const [meerOpen, setMeerOpen] = useState(false)
  const [tentDlg, setTentDlg] = useState<{ key: string; w: string; h: string; op?: Pt; publiek: boolean } | null>(null)
  const [toonHulp, setToonHulp] = useState(false)
  const [maat, setMaatSvg] = useState({ w: 1000, h: 700 })
  // losse deelnemers uit de tekening tellen mee met die uit de app
  const partners = useMemo(() => [...basisPartners, ...(doc.deelnemers || [])], [basisPartners, doc.deelnemers])
  const normen = useMemo(() => ({ ...STANDAARD_NORMEN, ...(doc.normen || {}) }), [doc.normen])
  const meta = doc.meta || {}
  const [actieveLaag, setActieveLaag] = useState('locatie')
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

  const toolRef = useRef<Tool>('select'); toolRef.current = tool
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

  // ---- laden en opslaan (via de adapter van de app) ----
  const passendRef = useRef<() => void>(() => {})
  const laadLijst = useCallback(async () => { const l = await adapter.lijst(); setLijst(l); return l }, [adapter])
  const open = useCallback(async (id: string) => {
    const r = await adapter.open(id)
    if (!r) { flash('Kon plattegrond niet openen'); return }
    const d = migreer(Object.assign({ objs: [], bg: null }, r.data) as Doc)
    setHuidigId(id); setNaam(r.naam); docRef.current = d; setDocRaw(d); hist.current = { past: [], future: [] }; setSel([]); setOpgeslagen('ja')
    setNrVolgende(Math.max(0, ...d.objs.map(o => o.nr || 0)) + 1)
    setZijTab(d.kaart || d.bg ? (d.objs.length ? 'check' : 'partners') : 'locatie')
    try { localStorage.setItem(adapter.sleutel, id) } catch { }
    setTimeout(() => passendRef.current(), 120)
  }, [adapter, flash])
  useEffect(() => {
    (async () => {
      const dn = await adapter.deelnemers()
      setPartners([...dn.partners].sort((a, b) => bnaam(a).localeCompare(bnaam(b), 'nl'))); setMaten(dn.maten)
      const l = await laadLijst()
      let laatst: string | null = null
      try { laatst = localStorage.getItem(adapter.sleutel) } catch { }
      const kies = l.find(x => x.id === laatst) || l[0]
      if (kies) open(kies.id)
    })()
  }, [adapter, laadLijst, open])

  const nieuw = () => setMetaDlg({ nieuw: true, organisator: adapter.merk })
  const bewaarMeta = async () => {
    if (!metaDlg) return
    const { nieuw: isNieuw, ...m } = metaDlg
    if (!m.evenement?.trim()) { flash('Geef het evenement een naam'); return }
    if (isNieuw) {
      const r = await adapter.nieuw(m.evenement.trim(), { ...leeg, meta: m })
      if (r.fout || !r.id) { flash(r.fout || 'Aanmaken mislukt'); return }
      await laadLijst(); await open(r.id); setZijTab('locatie')
    } else {
      setDoc(d => ({ ...d, meta: m }))
    }
    setMetaDlg(null)
  }
  const dupliceerPlattegrond = async () => {
    if (!huidigId) return
    const r = await adapter.nieuw(naam + ' (kopie)', docRef.current)
    if (r.fout || !r.id) { flash(r.fout || 'Kopie maken mislukt'); return }
    await laadLijst(); open(r.id); flash('Kopie gemaakt, je werkt nu in de kopie')
  }
  const verwijderPlattegrond = async () => {
    if (!huidigId || !confirm(`"${naam}" verwijderen? Dit kan niet ongedaan worden.`)) return
    await adapter.verwijder(huidigId)
    const l = await laadLijst(); setHuidigId(null); docRef.current = leeg; setDocRaw(leeg)
    if (l[0]) open(l[0].id)
  }

  // opslaan; wijzigingen die binnenkomen tijdens het opslaan blijven op 'nee' staan
  const naamRef = useRef(naam); naamRef.current = naam
  const opslaan = useCallback(async (): Promise<boolean> => {
    if (!huidigId) return true
    const snap = docRef.current
    setOpgeslagen('bezig')
    const fout = await adapter.opslaan(huidigId, naamRef.current, snap)
    if (fout) { setOpgeslagen('nee'); flash('Opslaan mislukt: ' + fout, 8000); return false }
    setOpgeslagen(docRef.current === snap ? 'ja' : 'nee')
    return true
  }, [huidigId, adapter, flash])
  useEffect(() => {
    if (!huidigId || opgeslagen !== 'nee') return
    const t = setTimeout(() => { opslaan() }, 1200)
    return () => clearTimeout(t)
  }, [doc, naam, huidigId, opgeslagen, opslaan])
  // niet weggaan met onopgeslagen werk
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (opgeslagen !== 'ja') { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [opgeslagen])

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
    if ((doc.deelnemers || []).some(x => x.id === p.id)) { setDoc(d => ({ ...d, deelnemers: (d.deelnemers || []).map(x => x.id === p.id ? { ...x, stand_breedte_m: b, stand_diepte_m: dd } : x) })); return }
    const fout = adapter.slaMaatOp ? await adapter.slaMaatOp(p.id, b, dd) : null
    if (fout) { flash(fout); return }
    setPartners(ps => ps.map(x => x.id === p.id ? { ...x, stand_breedte_m: b, stand_diepte_m: dd } : x))
  }
  const slaStandaardOp = async (m: Maat, veld: 'breedte_m' | 'diepte_m', v: string) => {
    const n = parseFloat(v.replace(',', '.')); if (!n) return
    const fout = adapter.slaStandaardOp ? await adapter.slaStandaardOp(m.pakket, veld, n) : null
    if (fout) { flash(fout); return }
    setMaten(ms => ms.map(x => x.pakket === m.pakket ? { ...x, [veld]: n } : x))
  }
  const voegDeelnemerToe = () => {
    const nm = prompt('Naam van de deelnemer of stand'); if (!nm) return
    // soort bepaalt de kleur, de standaardmaat en of hij meetelt als bar
    let soort: Maat | undefined
    if (maten.length) { const k = prompt('Wat voor soort?\n' + maten.map((m, i) => `${i + 1} = ${m.label}`).join('\n'), '1'); if (k === null) return; soort = maten[(parseInt(k) || 0) - 1] }
    const mt = (prompt('Afmeting in meters, breedte x diepte', soort ? `${soort.breedte_m} x ${soort.diepte_m}` : '3 x 3') || '').replace(/,/g, '.').split(/[x×*]/i).map(v => parseFloat(v))
    const p: PartnerRij = { id: 'x' + uid(), naam: nm, bedrijfsnaam: nm, pakket: soort?.pakket || 'los', type: soort?.pakket || 'los', stand_breedte_m: mt[0] || soort?.breedte_m || 3, stand_diepte_m: mt[1] || mt[0] || soort?.diepte_m || 3 }
    setDoc(d => ({ ...d, deelnemers: [...(d.deelnemers || []), p] }))
  }

  // ---- coördinaten ----
  const naarM = useCallback((cx: number, cy: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect()
    return [(cx - r.left) / view.s + view.x, (cy - r.top) / view.s + view.y]
  }, [view])
  const naarScherm = (p: Pt): Pt => [(p[0] - view.x) * view.s, (p[1] - view.y) * view.s]
  const rs = (v: number) => (snap && raster ? Math.round(v / raster) * raster : v)
  const rsp = (p: Pt): Pt => {
    if (toolRef.current === 'maat' || toolRef.current === 'measure') {
      // maatlijnen klikken vast op hoeken en randen van objecten
      const d = 9 / view.s; let best: Pt | null = null, bd = d
      for (const o of docRef.current.objs) { if (o.verborgen || o.kind === 'maat' || o.kind === 'legenda') continue
        const h = hoeken(o)
        for (let i = 0; i < h.length; i++) {
          const a = h[i], b = h[(i + 1) % h.length]
          for (const q of [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt]) { const dd = Math.hypot(q[0] - p[0], q[1] - p[1]); if (dd < bd) { bd = dd; best = q } }
        } }
      if (best) return best
    }
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

  useEffect(() => {
    const el = svgRef.current; if (!el) return
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setMaatSvg({ w: r.width, h: r.height }) })
    ro.observe(el); return () => ro.disconnect()
  }, [huidigId])

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
  const laagVoor = (kind: Kind, mat?: string) => {
    const heeft = (id: string) => lagen.some(l => l.id === id)
    const actief = lagen.find(l => l.id === actieveLaag && !l.vast)
    if (kind === 'partner' && heeft('partners')) return 'partners'
    if ((kind === 'legenda' || kind === 'maat' || kind === 'text') && heeft('teksten')) return 'teksten'
    // materiaal komt vanzelf op de laag van zijn vakgebied
    if ((kind === 'materiaal' || kind === 'hek') && mat) { const l = laagVanMateriaal(MATERIAAL[mat]); if (heeft(l)) return l }
    return actief?.id || lagen.find(l => !l.vast)?.id || lagen[0].id
  }
  // wat je toevoegt moet je ook zien: de laag gaat aan als die uit stond
  const voegToe = (objs: Obj[]) => { const ls = new Set(objs.map(o => o.laag)); setDoc(d => ({ ...d, objs: [...d.objs, ...objs], lagen: (d.lagen || STANDAARD_LAGEN).some(l => ls.has(l.id) && !l.zichtbaar) ? (d.lagen || STANDAARD_LAGEN).map(l => ls.has(l.id) ? { ...l, zichtbaar: true } : l) : d.lagen })); setSel(objs.map(o => o.id)) }
  const vrijePlek = (o: Obj): Obj => {
    const blokken = doc.objs.filter(q => (q.kind === 'partner' || q.kind === 'materiaal') && !OMHULLEND.has(q.mat || '') && !(q.kind === 'materiaal' && stijlVan(MATERIAAL[q.mat || '']).s === 'bord')).map(hoeken)
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
  const plaatsTent = () => {
    if (!tentDlg) return
    const m = MATERIAAL[tentDlg.key]; if (!m) return
    const g = (v: string, std: number) => Math.max(1, parseFloat(v.replace(',', '.')) || std)
    const w = g(tentDlg.w, m.w), h = m.rond ? w : g(tentDlg.h, m.h), c = tentDlg.op || midden()
    const basis: Obj = { id: uid(), kind: 'materiaal', mat: m.key, x: rs(c[0] - Math.max(w, h) / 2), y: rs(c[1] - Math.min(w, h) / 2), w: Math.max(w, h), h: Math.min(w, h), rot: 0, laag: laagVoor('materiaal', m.key), publiek: tentDlg.publiek || undefined }
    voegToe([tentDlg.op ? basis : vrijePlek(basis)]); setTentDlg(null); setTool('select')
  }
  const plaatsMateriaal = (m: Materiaal, op?: Pt) => {
    if (m.tent) { setTentDlg({ key: m.key, w: String(m.w), h: String(m.h), op, publiek: false }); return }
    if (isLijn(m)) { setHekMat(m.key); setTool('hek'); flash(m.soort === 'route' ? `Klik de ${m.label.toLowerCase()} aan, punt voor punt. De band laat zien wat vrij moet blijven.` : `Teken de lijn waar de ${m.label.toLowerCase()} moeten komen. De tool telt de stuks.`, 5000); return }
    const c = op || midden()
    const basis: Obj = { id: uid(), kind: 'materiaal', mat: m.key, x: rs(c[0] - m.w / 2), y: rs(c[1] - m.h / 2), w: m.w, h: m.h, rot: 0, laag: laagVoor('materiaal', m.key), ...(m.uitgang ? { toonLabel: true } : {}) }
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
    if (!pts.length && doc.kaart) pts.push([-90, -90], [90, 90])
    if (!pts.length || !svgRef.current) return
    const b = bbox(pts), r = svgRef.current.getBoundingClientRect()
    if (!r.width) return
    const s = Math.min(r.width / (b.x2 - b.x1 + 6), r.height / (b.y2 - b.y1 + 6))
    setView({ s, x: (b.x1 + b.x2) / 2 - r.width / 2 / s, y: (b.y1 + b.y2) / 2 - r.height / 2 / s })
  }
  passendRef.current = passend
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
      : o.kind === 'hek' ? (MATERIAAL[o.mat || '']?.soort === 'route' ? (o.label || MATERIAAL[o.mat || '']!.label) : `${MATERIAAL[o.mat || '']?.label || 'Hekwerk'} (${hekStuks(o)}×)`)
        : o.label || ({ rect: 'Rechthoek', ellipse: 'Ellips', line: 'Lijn', poly: 'Vlak', text: 'Tekst', legenda: 'Legenda', maat: 'Maatlijn', partner: '', materiaal: '', hek: '', voorziening: '' } as Record<Kind, string>)[o.kind]

  // ---- toetsenbord (Illustrator-sneltoetsen) ----
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      setAlt(e.altKey)
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || tekstEdit || verplaatsDlg || metaDlg || exportDlg || tentDlg) return
      const cmd = e.metaKey || e.ctrlKey, key = e.key.toLowerCase(), code = e.code
      if (e.key === ' ') { spatie.current = true; e.preventDefault(); return }
      if (cmd) {
        const actie: Record<string, () => void> = {
          z: () => e.shiftKey ? redo() : undo(),
          s: () => { opslaan().then(ok => ok && flash('Opgeslagen')) },
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
      const map: Record<string, Tool> = { v: 'select', a: 'direct', m: 'rect', l: 'ellipse', '\\': 'line', p: 'pen', t: 'text', h: 'hand', z: 'zoom', i: 'pipet', n: 'nummer', u: 'measure', d: 'maat' }
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
      if (o.kind === 'line' || o.kind === 'hek' || o.kind === 'maat') {
        const tol = Math.max(0.25, 6 / view.s) + (o.kind === 'hek' ? (o.dik ?? MATERIAAL[o.mat || '']?.breedte ?? 0.2) : (o.dik || 0.2)) / 2
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
    if (tool === 'line' || tool === 'pen' || tool === 'hek' || tool === 'measure' || tool === 'calibrate' || tool === 'maat') {
      const vorige = concept && concept[concept.length - 2]
      const q = e.shiftKey && vorige ? haaks(vorige, sp) : sp
      if (!concept || meetVast.current) { meetVast.current = false; setConcept([q, q]); return }
      if (tool === 'measure') { setConcept([concept[0], q]); meetVast.current = true; return }
      if (tool === 'calibrate') { kalibreer(concept[0], q); setConcept(null); setTool('select'); return }
      if (tool === 'maat') { if (Math.hypot(q[0] - concept[0][0], q[1] - concept[0][1]) > 0.05) voegToe([{ id: uid(), kind: 'maat', x: 0, y: 0, w: 0, h: 0, rot: 0, pts: [concept[0], q], laag: laagVoor('maat') }]); setConcept(null); return }
      if (tool === 'pen' && concept.length > 2) {
        const [fx, fy] = concept[0]
        if (Math.hypot(fx - q[0], fy - q[1]) < 8 / view.s) { afrondenVlak(); return }
      }
      setConcept([...concept.slice(0, -1), q, q]); return
    }
    // selecteren
    const h = doelEl.getAttribute('data-handle')
    if (h && gesel.length >= 1) {
      if (h === 'rotg') { const c = middenSel(); begin('rotg', p, gesel.filter(o => !o.locked), { extra: { c, a0: Math.atan2(p[1] - c[1], p[0] - c[0]) } }); setGroepHoek(0); return }
      begin(h === 'rot' ? 'rot' : h.startsWith('pt') ? 'pt' : 'resize', p, [...gesel], { handle: h }); return
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
    if (concept && !meetVast.current && ['line', 'pen', 'hek', 'measure', 'calibrate', 'maat'].includes(tool)) {
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
    if (d.type === 'rotg') {
      // hele selectie als één geheel om het midden draaien
      const { c, a0 } = d.extra as { c: Pt; a0: number }
      let g = ((Math.atan2(p[1] - c[1], p[0] - c[0]) - a0) * 180) / Math.PI
      g = e.shiftKey ? Math.round(g / 15) * 15 : Math.round(g)
      const origById = Object.fromEntries(d.orig.map(o => [o.id, o]))
      setDoc(x => ({ ...x, objs: x.objs.map(q => { const o = origById[q.id]; if (!o) return q
        if (o.pts) return { ...o, pts: o.pts.map(pt => draaiPunt(pt, c, g)) }
        const [nx, ny] = draaiPunt([o.x + o.w / 2, o.y + o.h / 2], c, g)
        return { ...o, x: nx - o.w / 2, y: ny - o.h / 2, rot: (((o.rot + g) % 360) + 360) % 360 } }) }), false)
      setGroepHoek(((g % 360) + 360) % 360); return
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
    const d = drag.current; drag.current = null; setGidsen({}); setGroepHoek(null)
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
    if (['move', 'rot', 'rotg', 'resize', 'pt', 'bg', 'gids'].includes(d.type) && docRef.current !== d.pre) {
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
        ? { id: uid(), kind: 'hek', mat: hekMat, x: 0, y: 0, w: 0, h: 0, rot: 0, pts, laag: laagVoor('hek', hekMat) }
        : { id: uid(), kind: 'line', x: 0, y: 0, w: 0, h: 0, rot: 0, pts, color: '#010341', dik: tool === 'line' ? 0.2 : 0.1, laag: laagVoor('line') }
      voegToe([o])
      if (tool === 'hek') flash(MATERIAAL[hekMat]?.soort === 'route' ? `${MATERIAAL[hekMat]!.label}: ${fmt(lengte(pts))}` : `${hekStuks(o)}× ${MATERIAAL[hekMat]?.label.toLowerCase()} (${fmt(lengte(pts))})`)
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
    pdfjs.GlobalWorkerOptions.workerSrc = adapter.pdfWorker
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
      const src = await adapter.upload(huidigId!, blob, isPdf ? 'jpg' : (f.name.split('.').pop() || 'png').toLowerCase(), isPdf ? 'image/jpeg' : f.type || 'image/png')
      const w = 60, h = (60 * img.height) / img.width
      const [mx, my] = midden()
      setDoc(d => ({ ...d, bg: { src, x: mx - w / 2, y: my - h / 2, w, h, opacity: 1, locked: false, opSchaal: false } }))
      if (!(await opslaan())) return
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
    setDoc(d => d.bg ? ({ ...d, bg: { ...d.bg, x: a[0] - (a[0] - d.bg.x) * f, y: a[1] - (a[1] - d.bg.y) * f, w: d.bg.w * f, h: d.bg.h * f, opSchaal: true } }) : d)
    setTimeout(passend, 50)
    flash('Plattegrond van de locatie staat op schaal')
  }

  // ---- afgeleide info ----
  const geplaatst = new Set(doc.objs.filter(o => o.partnerId).map(o => o.partnerId!))
  const relevante = partners.filter(p => p.type !== 'personeel')
  const overlappers = useMemo(() => {
    const s = new Set<string>()
    const blokken = doc.objs.filter(o => (o.kind === 'partner' || o.kind === 'materiaal') && !OMHULLEND.has(o.mat || '') && !o.verborgen && !(o.kind === 'materiaal' && stijlVan(MATERIAAL[o.mat || '']).s === 'bord'))
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
  const checks = useMemo(() => controleer(doc, partnerById), [doc, partnerById])
  const kg = useMemo(() => kengetallen(doc, partnerById), [doc, partnerById])
  // ---- versies van de indeling ----
  const versies = doc.versies || []
  const wisselVersie = (id: string) => { if (id === doc.versie) return; setSel([]); setDoc(d => { const vs = (d.versies || []).map(v => v.id === d.versie ? { ...v, objs: d.objs } : v); const doel = vs.find(v => v.id === id); return doel ? { ...d, versies: vs, versie: id, objs: doel.objs } : d }) }
  const nieuweVersie = () => {
    const nm = prompt('Naam van de nieuwe versie. Je begint met een kopie van wat er nu staat.', `Versie ${String.fromCharCode(65 + Math.max(1, versies.length))}`); if (!nm) return
    setSel([])
    setDoc(d => {
      const eerste = uid()
      const huidig = d.versies?.length ? d.versies.map(v => v.id === d.versie ? { ...v, objs: d.objs } : v) : [{ id: eerste, naam: 'Versie A', objs: d.objs }]
      const id = uid(), kopie: Obj[] = JSON.parse(JSON.stringify(d.objs))
      return { ...d, versies: [...huidig, { id, naam: nm, objs: kopie }], versie: id, objs: kopie }
    })
    flash(`${nm} is een kopie van de vorige. Wissel bovenin om ze te vergelijken.`, 5000)
  }
  const hernoemVersie = (id: string) => { const v = versies.find(x => x.id === id); const nm = v && prompt('Naam van deze versie', v.naam); if (nm) setDoc(d => ({ ...d, versies: (d.versies || []).map(x => x.id === id ? { ...x, naam: nm } : x) })) }
  const verwijderVersie = () => {
    const v = versies.find(x => x.id === doc.versie); if (!v || versies.length < 2 || !confirm(`${v.naam} verwijderen? De andere versies blijven staan.`)) return
    setSel([]); setDoc(d => { const rest = (d.versies || []).filter(x => x.id !== d.versie); return { ...d, versies: rest.length > 1 ? rest : undefined, versie: rest.length > 1 ? rest[0].id : undefined, objs: rest[0].objs } })
  }
  const checkActies = checks.filter(c => c.status === 'actie').length
  const tegels = useMemo(() => doc.kaart && doc.kaart.zichtbaar
    ? kaartTegels(doc.kaart, { x1: view.x, y1: view.y, x2: view.x + maat.w / view.s, y2: view.y + maat.h / view.s }, view.s * 1.5)
    : [], [doc.kaart, view, maat])
  const zoomNaar = (ids: string[]) => {
    const os = doc.objs.filter(o => ids.includes(o.id)); if (!os.length || !svgRef.current) return
    const b = bbox(os.flatMap(hoeken)), r = svgRef.current.getBoundingClientRect()
    const sc = Math.min(40, r.width / (b.x2 - b.x1 + 20), r.height / (b.y2 - b.y1 + 20))
    setView({ s: sc, x: (b.x1 + b.x2) / 2 - r.width / 2 / sc, y: (b.y1 + b.y2) / 2 - r.height / 2 / sc })
    setSel(os.filter(selecteerbaar).map(o => o.id)); setTool('select')
  }
  const kiesAdres = (a: Adres) => {
    setAdressen(null); setAdresQ(a.naam)
    const k = docRef.current.kaart
    if (k && docRef.current.objs.length) {
      // er staat al een tekening: nulpunt laten staan, alleen ernaartoe schuiven
      const r = svgRef.current!.getBoundingClientRect()
      setView(v => ({ ...v, x: a.rd[0] - k.rd[0] - r.width / 2 / v.s, y: k.rd[1] - a.rd[1] - r.height / 2 / v.s }))
      return
    }
    setDoc(d => ({ ...d, kaart: { rd: a.rd, adres: a.naam, type: d.kaart?.type || 'luchtfoto', opacity: 1, zichtbaar: true }, meta: { ...(d.meta || {}), locatie: d.meta?.locatie || a.naam } }))
    setTimeout(() => passendRef.current(), 60)
    flash('De kaart staat op schaal, noord is boven. Teken nu het terrein en zet de deelnemers erop.', 6000)
  }
  const zoekOpAdres = async () => {
    if (adresQ.trim().length < 3) return
    try { const r = await zoekAdres(adresQ); setAdressen(r); if (!r.length) flash('Geen adres gevonden. Probeer straat en plaats.') } catch (e) { flash((e as Error).message) }
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
  const inhoudBbox = (): Gebied | null => {
    const pts = doc.objs.filter(zichtbaar).flatMap(hoeken)
    if (doc.bg) pts.push([doc.bg.x, doc.bg.y], [doc.bg.x + doc.bg.w, doc.bg.y + doc.bg.h])
    return pts.length ? bbox(pts) : null
  }
  const dataUrl = (bl: Blob) => new Promise<string>(ok => { const rd = new FileReader(); rd.onload = () => ok(rd.result as string); rd.readAsDataURL(bl) })
  // De tekening als SVG-tekst voor een gebied: kaarttegels op de resolutie van
  // de export, en alle afbeeldingen ingesloten zodat ze meekomen in PNG en PDF.
  const tekeningInhoud = async (g: Gebied, pxPerM: number) => {
    const kloon = svgRef.current!.querySelector('#tekening')!.cloneNode(true) as SVGGElement
    kloon.querySelectorAll('[data-ui]').forEach(n => n.remove())
    kloon.querySelectorAll('[data-lw]').forEach(n => n.setAttribute('stroke-width', String(Math.max(parseFloat(n.getAttribute('data-lw') || '0'), (2.4 / pxPerM) * parseFloat(n.getAttribute('data-lwf') || '1')))))
    const kl = kloon.querySelector('#kaartlaag')
    if (kl && doc.kaart?.zichtbaar) kl.innerHTML = kaartTegels(doc.kaart, g, pxPerM, 220).map(t => `<image href="${t.href}" x="${t.x}" y="${t.y}" width="${t.s * 1.002}" height="${t.s * 1.002}"/>`).join('')
    await Promise.all([...kloon.querySelectorAll('image')].map(async im => {
      const href = im.getAttribute('href') || ''
      if (!href || href.startsWith('data:')) return
      try { im.setAttribute('href', await dataUrl(await (await fetch(href)).blob())) } catch { im.remove() }
    }))
    return kloon.innerHTML
  }
  const bestandsnaam = (naam || 'plattegrond').replace(/[^\w\- ]+/g, '').trim()
  const download = (url: string, nm: string) => { const a = document.createElement('a'); a.href = url; a.download = nm; a.click() }
  const naarCanvas = (svg: string, w: number, h: number) => new Promise<HTMLCanvasElement>((ok, nee) => {
    const img = new Image()
    img.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h); ok(c) }
    img.onerror = () => nee(new Error('Renderen mislukt'))
    img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  })
  const exporteer = async (soort: 'svg' | 'png') => {
    const b = inhoudBbox(); if (!b) { flash('Er staat nog niets op de tekening'); return }
    const sel0 = sel; setSel([]); await new Promise(r => setTimeout(r, 40))
    const m = 2, g = { x1: b.x1 - m, y1: b.y1 - m, x2: b.x2 + m, y2: b.y2 + m }, W = g.x2 - g.x1, H = g.y2 - g.y1
    const ppm = Math.min(20, 6000 / Math.max(W, H))
    const inhoud = await tekeningInhoud(g, ppm * 2); setSel(sel0)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W * ppm}" height="${H * ppm}" viewBox="${g.x1} ${g.y1} ${W} ${H}"><rect x="${g.x1}" y="${g.y1}" width="${W}" height="${H}" fill="#ffffff"/>${inhoud}</svg>`
    if (soort === 'svg') { download(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), bestandsnaam + '.svg'); return }
    const c = await naarCanvas(svg, Math.round(W * ppm * 2), Math.round(H * ppm * 2)); c.toBlob(bl => bl && download(URL.createObjectURL(bl), bestandsnaam + '.png'))
  }
  // PDF: tekenblad op echte schaal met legenda, noordpijl, schaalbalk en titelblok
  const exporteerPdf = async () => {
    if (!exportDlg) return
    const b = inhoudBbox(); if (!b) { flash('Er staat nog niets op de tekening'); return }
    const inst = exportDlg
    setExportDlg({ ...inst, bezig: true }); setSel([]); await new Promise(r => setTimeout(r, 40))
    try {
      const blad = await maakBlad({
        inhoud: tekeningInhoud, bbox: b, papier: inst.papier, schaal: inst.schaal, titel: inst.titel, vakken: inst.vakken,
        meta: { ...meta, evenement: meta.evenement || naam, versie: [meta.versie, versies.find(v => v.id === doc.versie)?.naam].filter(Boolean).join(' · ') || undefined }, merk: adapter.merk,
        noordHoek: doc.kaart ? 0 : (meta.noordHoek ?? 0),
        bron: doc.kaart?.zichtbaar ? `Ondergrond: PDOK ${doc.kaart.type === 'luchtfoto' ? 'Luchtfoto' : 'BGT'} (CC BY 4.0)` : '',
        legenda: { vlakken: pakketTelling.map(p => ({ kleur: p.maat.kleur, label: p.maat.label, aantal: p.n })), symbolen: telling, nummers: genummerd.map(o => ({ nr: o.nr!, naam: naamVan(o) })) },
      })
      const pxmm = blad.dpi / 25.4
      const c = await naarCanvas(blad.svg, Math.round(blad.W * pxmm), Math.round(blad.H * pxmm))
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: inst.papier.toLowerCase() })
      pdf.addImage(c.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, blad.W, blad.H)
      const nm = `${bestandsnaam} ${inst.titel} 1-${blad.N} ${inst.papier}.pdf`
      if (typeof window !== 'undefined' && (window as unknown as { __pgTest?: (b: Blob, n: string) => void }).__pgTest) (window as unknown as { __pgTest: (b: Blob, n: string) => void }).__pgTest(pdf.output('blob'), nm)
      else pdf.save(nm)
      setExportDlg(null)
    } catch (e) { flash('PDF maken mislukt: ' + (e as Error).message, 8000); setExportDlg(d => d && { ...d, bezig: false }) }
  }

  // ---- tekenen ----
  const sw = 1 / view.s
  // T = hoogte van tekst op de tekening, in meters. Automatisch zo gekozen dat
  // tekst op papier ongeveer 2 mm hoog wordt; zelf in te stellen bij 'Tekst en nummers'.
  const T = doc.nrGrootte ? doc.nrGrootte * 2 : (() => {
    const pts = doc.objs.filter(o => o.kind !== 'legenda' && !o.verborgen).flatMap(hoeken)
    return pts.length < 2 ? 1 : Math.max(0.6, Math.min(6, 2 * kiesSchaal(bbox(pts), 'A2') / 1000))
  })()
  const FONT = 'Helvetica, Arial, sans-serif'
  // Dunne lijnen blijven op het scherm minstens ruim een pixel dik. De echte
  // dikte staat in data-lw; bij het exporteren rekent tekeningInhoud die om
  // naar een minimum op papier, los van hoe ver je hebt ingezoomd.
  const dun = (w: number, f = 1) => ({ strokeWidth: Math.max(w, 1.3 * f * sw), 'data-lw': w, 'data-lwf': f })
  // Tekst in of bij een blok: past hij erin, dan groot erin. Past hij niet en is
  // er een nummer, dan alleen het nummer (de naam staat in de legenda).
  const blokTekst = (o: Obj, tekst: string, kleurTekst: string, extraRot: number) => {
    if (!tekst) return null
    const staand = o.h > o.w * 1.3
    const lang = staand ? o.h : o.w, krt = staand ? o.w : o.h
    const past = Math.min(krt * 0.55, (lang * 0.9) / (tekst.length * 0.6))
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2
    const rot = `rotate(${extraRot + (staand ? -90 : 0)} ${cx} ${cy})`
    if (past >= T * 0.5) return <text x={cx} y={cy} transform={rot} fontSize={Math.min(past, T * 1.6)} textAnchor="middle" dominantBaseline="central" fill={kleurTekst} fontFamily={FONT} fontWeight={700}>{tekst}</text>
    if (o.nr) return null
    return <text x={cx} y={cy} transform={`rotate(${extraRot} ${cx} ${cy})`} fontSize={T * 0.62} textAnchor="middle" dominantBaseline="central" fill="#111" fontFamily={FONT} fontWeight={700} stroke="#fff" strokeWidth={T * 0.14} paintOrder="stroke">{tekst}</text>
  }
  const kleurVan = (o: Obj) => o.color || (o.kind === 'partner' ? (partnerById[o.partnerId!] ? maatVan(partnerById[o.partnerId!]).kleur : '#999') : o.kind === 'materiaal' ? stijlVan(MATERIAAL[o.mat || '']).vul : o.kind === 'hek' ? (LIJNKLEUR[o.mat || ''] || MATERIAAL[o.mat || '']?.kleur || '#777') : '#8b8574')
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
        els.push(<g key={'mi' + t.mat.key} transform={`translate(${o.x + pad} ${y - f * 0.2}) scale(${f * 1.5 / 24})`} dangerouslySetInnerHTML={{ __html: symboolSvg(t.mat) }} />)
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
    if (o.kind === 'maat') {
      const [a, b] = o.pts!, l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!l) return null
      const ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l, tg = T * 0.8, tk = tg * 0.45
      let hk = Math.atan2(uy, ux) * 180 / Math.PI; if (hk > 90 || hk < -90) hk += 180
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, kl = o.color || '#010341'
      return (
        <g key={o.id} opacity={dek}>
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={kl} strokeWidth={tg * 0.07} />
          {[a, b].map((q, i) => <g key={i}><line x1={q[0] - uy * tk} y1={q[1] + ux * tk} x2={q[0] + uy * tk} y2={q[1] - ux * tk} stroke={kl} strokeWidth={tg * 0.07} /><line x1={q[0] - (ux + uy) * tk * 0.6} y1={q[1] - (uy - ux) * tk * 0.6} x2={q[0] + (ux + uy) * tk * 0.6} y2={q[1] + (uy - ux) * tk * 0.6} stroke={kl} strokeWidth={tg * 0.1} /></g>)}
          <text x={mx} y={my - tg * 0.35} transform={`rotate(${hk} ${mx} ${my})`} fontSize={tg} textAnchor="middle" fill={kl} fontFamily="Helvetica, Arial, sans-serif" fontWeight={700} stroke="#fff" strokeWidth={tg * 0.18} paintOrder="stroke">{fmt(l)}</text>
          {isSel && <line data-ui x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#2b6cb0" strokeWidth={1.5 * sw} />}
        </g>
      )
    }
    if (o.kind === 'hek') {
      const m = MATERIAAL[o.mat || '']; const br = o.dik ?? m?.breedte ?? 0.2, stuk = m?.stuk || 1
      const pts = o.pts || []
      if (m?.soort === 'route') {
        const pijlen: React.ReactNode[] = []
        const stapP = Math.max(8, br * 3), ps = Math.min(1.2, Math.max(0.5, br * 0.3))
        let k2 = 0
        for (let i = 1; i < pts.length; i++) {
          const [ax, ay] = pts[i - 1], [bx, by] = pts[i], l = Math.hypot(bx - ax, by - ay); if (!l) continue
          const ux = (bx - ax) / l, uy = (by - ay) / l
          for (let t = Math.min(stapP / 2, l / 2); t < l; t += stapP) { const px = ax + ux * t, py = ay + uy * t; pijlen.push(<path key={k2++} d={`M${px + ux * ps} ${py + uy * ps} L${px - ux * ps * 0.6 - uy * ps * 0.7} ${py - uy * ps * 0.6 + ux * ps * 0.7} L${px - ux * ps * 0.6 + uy * ps * 0.7} ${py - uy * ps * 0.6 - ux * ps * 0.7} Z`} fill={c} />) }
        }
        const mid = Math.floor((pts.length - 1) / 2), A = pts[mid], B = pts[mid + 1] || A
        let hk = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI; if (hk > 90 || hk < -90) hk += 180
        const lx = (A[0] + B[0]) / 2, ly = (A[1] + B[1]) / 2, fs = T * 0.75
        return (
          <g key={o.id} opacity={dek}>
            <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke={c} strokeOpacity={0.2} strokeWidth={br} strokeLinejoin="round" strokeLinecap="butt" />
            <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke={c} strokeWidth={Math.max(0.08, br * 0.035)} strokeDasharray={`${br * 0.4} ${br * 0.25}`} />
            {pijlen}
            <text x={lx} y={ly - br / 2 - fs * 0.4} transform={`rotate(${hk} ${lx} ${ly})`} fontSize={fs} textAnchor="middle" fill={c} fontFamily="Helvetica, Arial, sans-serif" fontWeight={700} stroke="#fff" strokeWidth={fs * 0.2} paintOrder="stroke">{o.label || m.label} · {String(r2(br)).replace('.', ',')} m breed</text>
            {isSel && <polyline data-ui points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke="#2b6cb0" strokeWidth={1.5 * sw} />}
          </g>
        )
      }
      // Naden: elk punt waar een nieuw hek of een nieuwe plaat begint
      const naden: { x: number; y: number; ux: number; uy: number }[] = []
      let rest = 0
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], l = Math.hypot(bx - ax, by - ay); if (!l) continue
        const ux = (bx - ax) / l, uy = (by - ay) / l
        for (let t = rest; t <= l + 1e-6; t += stuk) naden.push({ x: ax + ux * t, y: ay + uy * t, ux, uy })
        rest = stuk - ((l - rest) % stuk); if (rest >= stuk - 1e-6) rest = 0
        if (i === pts.length - 1) naden.push({ x: bx, y: by, ux, uy })
      }
      const lw = Math.max(0.1, T * 0.06), pl = pts.map(p => p.join(',')).join(' ')
      const band = ['rijplaat', 'looppad', 'kabelbrug'].includes(o.mat || '') // deze teken je op echte breedte
      const mid = Math.floor((pts.length - 1) / 2), A = pts[mid], B = pts[mid + 1] || A
      let hoek = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI; if (hoek > 90 || hoek < -90) hoek += 180
      const lx = (A[0] + B[0]) / 2, ly = (A[1] + B[1]) / 2
      return (
        <g key={o.id} opacity={dek}>
          {band ? <>
            <polyline points={pl} fill="none" stroke="#555" strokeWidth={br + lw} strokeLinejoin="miter" />
            <polyline points={pl} fill="none" stroke={c} strokeWidth={br} strokeLinejoin="miter" />
            {naden.map((n, i) => <line key={i} x1={n.x + n.uy * br / 2} y1={n.y - n.ux * br / 2} x2={n.x - n.uy * br / 2} y2={n.y + n.ux * br / 2} stroke={o.mat === 'kabelbrug' ? '#111' : '#555'} strokeWidth={o.mat === 'kabelbrug' ? lw * 1.6 : lw * 0.6} />)}
          </> : o.mat === 'bouwhek' ? <>
            <polyline points={pl} fill="none" stroke={c} {...dun(lw)} strokeLinejoin="miter" />
            {naden.map((n, i) => <line key={i} x1={n.x} y1={n.y} x2={n.x + n.ux * 0.001} y2={n.y + n.uy * 0.001} stroke="#444" strokeLinecap="square" {...dun(T * 0.26, 3)} />)}
          </> : <>
            <polyline points={pl} fill="none" stroke={c} {...dun(lw, 1)} strokeLinejoin="miter" />
            {o.mat === 'schrikhek' && <polyline points={pl} fill="none" stroke="#fff" {...dun(lw, 1)} strokeDasharray={`${T * 0.3} ${T * 0.3}`} />}
            {naden.map((n, i) => <line key={i} x1={n.x + n.uy * T * 0.22} y1={n.y - n.ux * T * 0.22} x2={n.x - n.uy * T * 0.22} y2={n.y + n.ux * T * 0.22} stroke={c} {...dun(lw, 1)} />)}
          </>}
          {isSel && <text data-ui x={lx} y={ly - br / 2 - T * 0.4} transform={`rotate(${hoek} ${lx} ${ly})`} fontSize={12 * sw} textAnchor="middle" fill="#2b6cb0" fontFamily={FONT} fontWeight={700} stroke="#fff" strokeWidth={3 * sw} paintOrder="stroke">{hekStuks(o)}× {m?.label.toLowerCase()} · {fmt(lengte(pts))}</text>}
          {isSel && <polyline data-ui points={pl} fill="none" stroke="#2b6cb0" strokeWidth={1.5 * sw} strokeDasharray={`${4 * sw} ${3 * sw}`} />}
        </g>
      )
    }
    if (o.kind === 'poly') {
      const b = bbox(o.pts!)
      const ld = o.lijnDik ?? 0.15
      return (
        <g key={o.id} opacity={dek}>
          <polygon points={o.pts!.map(p => p.join(',')).join(' ')} fill={c === 'none' ? 'none' : c} fillOpacity={0.6} stroke={lijnVan(o, '#010341')} strokeWidth={ld} strokeLinejoin="miter" strokeDasharray={o.streep ? `${ld * 4} ${ld * 3}` : undefined} />
          {o.label && <text x={(b.x1 + b.x2) / 2} y={(b.y1 + b.y2) / 2} fontSize={Math.max(T, Math.min(T * 2.2, (b.x2 - b.x1) / Math.max(4, o.label.length * 0.62)))} textAnchor="middle" dominantBaseline="central" fill="#111" fontFamily={FONT} fontWeight={700} stroke="#fff" strokeWidth={T * 0.16} paintOrder="stroke">{o.label}</text>}
          {o.publiek && (() => { const mx = (b.x1 + b.x2) / 2, my = (b.y1 + b.y2) / 2 + (o.label ? T * 1.6 : 0), r1 = `± ${Math.round(oppervlak(o)).toLocaleString('nl-NL')} m²`, r2t = `± ${Math.floor(oppervlak(o) * (o.dichtheid || normen.dichtheid)).toLocaleString('nl-NL')} pax`, bw = Math.max(r1.length, r2t.length) * T * 0.5 + T * 0.6
            return <g><rect x={mx - bw / 2} y={my - T * 1.15} width={bw} height={T * 2.3} rx={T * 0.2} fill="#333" /><text x={mx} y={my - T * 0.5} fontSize={T * 0.8} textAnchor="middle" dominantBaseline="central" fill="#fff" fontFamily={FONT} fontWeight={700}>{r1}</text><text x={mx} y={my + T * 0.5} fontSize={T * 0.8} textAnchor="middle" dominantBaseline="central" fill="#fff" fontFamily={FONT} fontWeight={700}>{r2t}</text></g> })()}
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
    const rand = o.lijnDik ?? Math.max(0.04, T * 0.035)
    const kaders = <>
      {fout && <rect data-ui x={o.x} y={o.y} width={o.w} height={o.h} fill="none" stroke="#e53935" strokeWidth={2.5 * sw} strokeDasharray={`${5 * sw} ${3 * sw}`} />}
      {isSel && <rect data-ui x={o.x} y={o.y} width={o.w} height={o.h} fill="none" stroke="#2b6cb0" strokeWidth={1.5 * sw} />}
    </>
    if (o.kind === 'materiaal') {
      const m = MATERIAAL[o.mat || ''], st = stijlVan(m), vul = o.color || st.vul, tk = leesbaarOp(vul === 'none' ? '#ffffff' : vul)
      const kl = Math.min(o.w, o.h)
      if (st.s === 'bord') return (
        // veiligheidspictogram: staat altijd rechtop, wit symbool op gekleurd vlak
        <g key={o.id} opacity={dek}>
          <rect x={o.x} y={o.y} width={o.w} height={o.h} rx={kl * 0.12} fill={vul} stroke="#fff" strokeWidth={kl * 0.05} />
          {icoon(m, cx, cy, kl * 0.74, '#fff', 0)}
          {o.toonLabel && <text x={cx} y={o.y + o.h + T * 0.5} fontSize={T * 0.6} textAnchor="middle" dominantBaseline="central" fill="#111" fontFamily={FONT} fontWeight={700} stroke="#fff" strokeWidth={T * 0.14} paintOrder="stroke">{o.label || m?.label}</text>}
          {kaders}
        </g>
      )
      const nlm = (v: number) => String(r2(v)).replace('.', ',')
      const tekst = (o.label || (m?.tent ? `${m.tent.kort} ${m.rond ? 'Ø' + nlm(o.w) : nlm(o.w) + '×' + nlm(o.h)}` : st.tekst) || (o.toonLabel ? m?.label : '') || '') + (m?.uitgang ? ` ${fmt(Math.max(o.w, o.h))}` : '')
      const stap = m?.tent ? m.tent.stap : Math.max(0.5, (o.w > o.h ? o.w : o.h) / Math.max(3, Math.round((o.w > o.h ? o.w : o.h) / 1.5)))
      return (
        <g key={o.id} opacity={dek}>
          <g transform={tr}>
            {m?.rond
              ? <ellipse cx={cx} cy={cy} rx={o.w / 2} ry={o.h / 2} fill={vul} fillOpacity={o.mat === 'boom' ? 0.6 : 1} stroke={lijnVan(o, '#222')} strokeWidth={rand} strokeDasharray={o.streep ? `${rand * 4} ${rand * 3}` : undefined} />
              : <rect x={o.x} y={o.y} width={o.w} height={o.h} rx={o.hoek ?? 0} fill={vul} fillOpacity={OMHULLEND.has(o.mat || '') ? 0.75 : 1} stroke={lijnVan(o, '#222')} strokeWidth={rand} strokeDasharray={o.streep ? `${rand * 4} ${rand * 3}` : undefined} />}
            {st.patroon === 'kruis' && !m?.rond && <path d={`M${o.x} ${o.y}L${o.x + o.w} ${o.y + o.h}M${o.x + o.w} ${o.y}L${o.x} ${o.y + o.h}`} stroke="#8a8a8a" strokeWidth={rand * 0.8} fill="none" />}
            {st.patroon === 'strepen' && <path d={Array.from({ length: Math.max(0, Math.round((o.w > o.h ? o.w : o.h) / stap) - 1) }, (_, i) => o.w > o.h ? `M${o.x + (i + 1) * stap} ${o.y}v${o.h}` : `M${o.x} ${o.y + (i + 1) * stap}h${o.w}`).join('')} stroke="#222" strokeOpacity={0.35} strokeWidth={rand * 0.8} fill="none" />}
            {o.mat === 'lichtmast' && <rect x={cx - kl * 0.18} y={cy - kl * 0.18} width={kl * 0.36} height={kl * 0.36} fill="#7b3f2a" />}
            {kaders}
          </g>
          {st.icoon && o.mat !== 'lichtmast' && icoon(m, cx, tekst && kl > T * 1.6 ? cy - kl * 0.16 : cy, kl * (tekst && kl > T * 1.6 ? 0.5 : 0.7), tk, 0)}
          {st.icoon && tekst && kl > T * 1.6 ? <text x={cx} y={cy + kl * 0.3} fontSize={Math.min(T * 0.9, o.w / Math.max(4, tekst.length * 0.62))} textAnchor="middle" dominantBaseline="central" fill={tk} fontFamily={FONT} fontWeight={700}>{tekst}</text> : null}
          {!st.icoon && <g transform={tr}>{blokTekst(o, tekst, tk, leesRot)}</g>}
        </g>
      )
    }
    const tekst = o.kind === 'partner' ? naamVan(o) : (o.label || '')
    const tk = o.kind === 'partner' ? leesbaarOp(c) : '#111111'
    return (
      <g key={o.id} transform={tr} opacity={dek}>
        {o.kind === 'ellipse'
          ? <ellipse cx={cx} cy={cy} rx={o.w / 2} ry={o.h / 2} fill={c === 'none' ? 'none' : c} stroke={lijnVan(o, '#222')} strokeWidth={rand} strokeDasharray={o.streep ? `${rand * 4} ${rand * 3}` : undefined} />
          : <rect x={o.x} y={o.y} width={o.w} height={o.h} fill={c === 'none' ? 'none' : c} fillOpacity={o.kind === 'rect' ? 0.8 : 1} stroke={lijnVan(o, '#222')} strokeWidth={rand} strokeDasharray={o.streep ? `${rand * 4} ${rand * 3}` : undefined} rx={o.hoek ?? 0} />}
        {blokTekst(o, tekst, tk, leesRot)}
        {toonMaten && isSel && o.kind === 'partner' && <text data-ui x={cx} y={o.y - 8 * sw} fontSize={11 * sw} textAnchor="middle" fill="#2b6cb0" fontFamily={FONT} fontWeight={700}>{r2(o.w)} × {r2(o.h)} m</text>}
        {kaders}
      </g>
    )
  }
  const nrStraal = T * 0.62
  const renderNummer = (o: Obj) => {
    if (!o.nr || !zichtbaar(o)) return null
    const b = bbox(hoeken(o))
    // op de linkerbovenhoek, zodat het nooit over de naam valt
    const x = b.x1, y = b.y1
    return (
      <g key={'nr' + o.id}>
        <circle cx={x} cy={y} r={nrStraal} fill="#5e35b1" stroke="#fff" strokeWidth={nrStraal * 0.14} />
        <text x={x} y={y + nrStraal * 0.04} fontSize={nrStraal * (o.nr > 99 ? 0.85 : 1.15)} fill="#fff" textAnchor="middle" dominantBaseline="central" fontFamily={FONT} fontWeight={700}>{o.nr}</text>
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
        {toonMaten && groepHoek === null && <text x={(b.x1 + b.x2) / 2} y={b.y2 + 16 * sw} fontSize={11 * sw} textAnchor="middle" fill="#2b6cb0" fontFamily="Inter" fontWeight={600}>{fmt(b.x2 - b.x1)} × {fmt(b.y2 - b.y1)}</text>}
        {groepHoek === null && <>
          <line x1={(b.x1 + b.x2) / 2} y1={b.y1} x2={(b.x1 + b.x2) / 2} y2={b.y1 - 24 * sw} stroke="#2b6cb0" strokeWidth={sw} />
          <circle data-handle="rotg" cx={(b.x1 + b.x2) / 2} cy={b.y1 - 24 * sw} r={6 * sw} fill="#fff" stroke="#2b6cb0" strokeWidth={1.5 * sw} style={{ cursor: 'grab' }}><title>Sleep om de hele selectie te draaien. Shift = stappen van 15 graden.</title></circle>
        </>}
        {groepHoek !== null && <text x={(b.x1 + b.x2) / 2} y={b.y1 - 12 * sw} fontSize={13 * sw} textAnchor="middle" fill="#2b6cb0" fontFamily="Inter" fontWeight={700} stroke="#fff" strokeWidth={3 * sw} paintOrder="stroke">{Math.round(groepHoek)}°</text>}
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
    const extra = tool === 'hek' ? (MATERIAAL[hekMat]?.soort === 'route' ? `  Σ ${fmt(tot)}` : `  ${Math.max(1, Math.ceil(tot / (MATERIAAL[hekMat]?.stuk || 1) - 0.01))}× ${MATERIAAL[hekMat]?.label.toLowerCase()}`) : (tool === 'line' || tool === 'pen') && concept.length > 2 ? `  Σ ${fmt(tot)}` : ''
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
      style={{ width: 38, height: 36, border: 'none', borderRadius: 10, cursor: 'pointer', background: tool === t ? 'var(--pg-inkt)' : 'transparent', color: tool === t ? 'var(--pg-papier)' : 'var(--pg-inkt)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', boxShadow: tool === t ? '0 2px 6px rgba(0,0,0,0.18)' : undefined }}>
      <span dangerouslySetInnerHTML={{ __html: icoon }} />
      <span style={{ position: 'absolute', right: 2, bottom: 0, fontSize: 8, opacity: 0.5, fontFamily: 'var(--pg-sans)' }}>{sneltoets}</span>
    </button>
  )
  const mini: React.CSSProperties = { ...AS.input, padding: '4px 7px', fontSize: 12 }
  const klein: React.CSSProperties = { ...AS.btnSm, padding: '4px 8px', fontSize: 11.5 }
  const sectie: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#a39d8c', letterSpacing: 0.4, textTransform: 'uppercase', margin: '12px 0 5px' }
  const scheiding = <div style={{ height: 1, width: 24, background: 'rgba(0,0,0,0.09)', margin: '3px 0' }} />
  const ik = (d: string, s = 14) => <span style={{ display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>` }} />
  const OOG = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
  const OOG_UIT = '<path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4M6.5 6.6A16.6 16.6 0 002 12s3.6 7 10 7a10 10 0 004.3-1"/>'
  const SLOT = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>'
  const SLOT_OPEN = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.5-2"/>'
  const schakel = (label: string, aan: boolean, zet: (v: boolean) => void, titel?: string) => (
    <button key={label} title={titel} onClick={() => zet(!aan)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--pg-sans)', cursor: 'pointer', borderRadius: 7, padding: '4px 8px', border: 'none', background: aan ? 'color-mix(in srgb, var(--pg-inkt) 10%, transparent)' : 'transparent', color: aan ? 'var(--pg-inkt)' : '#a39d8c' }}>
      <span style={{ width: 7, height: 7, borderRadius: 4, background: aan ? 'var(--pg-accent)' : 'transparent', border: '1.5px solid ' + (aan ? 'var(--pg-accent)' : '#c9c1ab') }} />{label}
    </button>
  )
  const CSS = `.pg button{transition:background .12s,border-color .12s,box-shadow .12s,color .12s,opacity .12s}
.pg button:not(:disabled):hover{box-shadow:inset 0 0 0 99px rgba(0,0,0,.05)}
.pg button:not(:disabled):active{box-shadow:inset 0 0 0 99px rgba(0,0,0,.1)}
.pg button:disabled{opacity:.45;cursor:default}
.pg button:focus-visible{outline:2px solid var(--pg-accent);outline-offset:1px}
.pg input:not([type=checkbox]):not([type=range]):not([type=color]):focus,.pg select:focus{outline:none;border-color:var(--pg-accent)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--pg-accent) 18%,transparent)}
.pg input[type=checkbox],.pg input[type=range]{accent-color:var(--pg-inkt)}
.pg .pg-rij{transition:background .12s}.pg .pg-rij:hover{background:color-mix(in srgb,var(--pg-inkt) 5%,transparent)!important}
.pg .pg-tegel{transition:border-color .12s,box-shadow .12s,transform .12s}.pg .pg-tegel:hover{border-color:color-mix(in srgb,var(--pg-inkt) 35%,transparent)!important;box-shadow:0 3px 10px rgba(0,0,0,.07);transform:translateY(-1px)}
.pg .pg-menu button{display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;font-size:12.5px;font-family:var(--pg-sans);color:var(--pg-inkt);border-radius:7px;cursor:pointer}
.pg ::-webkit-scrollbar{width:9px;height:9px}.pg ::-webkit-scrollbar-thumb{background:rgba(0,0,0,.13);border-radius:9px;border:2px solid transparent;background-clip:content-box}.pg ::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);background-clip:content-box}
@keyframes pg-in{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}.pg .pg-dlg{animation:pg-in .16s ease-out}`

  const gefilterd = relevante.filter(p => !zoek || (p.naam + ' ' + (p.bedrijfsnaam || '')).toLowerCase().includes(zoek.toLowerCase()))
  const groepen = maten.filter(m => m.pakket !== 'personeel').map(m => ({ m, ps: gefilterd.filter(p => p.pakket === m.pakket) })).filter(g => g.ps.length)
  const zonderGroep = gefilterd.filter(p => !maten.some(m => m.pakket === p.pakket))
  const matGefilterd = MATERIALEN.filter(m => !m.oud).filter(m => !matZoek || (m.label + ' ' + m.cat).toLowerCase().includes(matZoek.toLowerCase()))

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
    <div style={{ '--pg-inkt': adapter.thema.inkt, '--pg-papier': adapter.thema.papier, '--pg-kaart': adapter.thema.kaart, '--pg-accent': adapter.thema.accent, '--pg-serif': adapter.thema.serif, '--pg-sans': adapter.thema.sans, fontFamily: adapter.thema.sans, ...(adapter.volledig ? { height: '100vh', display: 'flex', flexDirection: 'column', padding: '0 14px 12px', boxSizing: 'border-box', background: adapter.thema.papier, overflow: 'hidden' } : {}) } as React.CSSProperties} className="pg">
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', ...(adapter.volledig ? { margin: '0 -14px 10px', padding: '9px 16px', background: 'var(--pg-kaart)', borderBottom: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 8px rgba(0,0,0,0.03)' } : { marginBottom: 12 }) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
          <div>
            <div style={{ ...AS.title, ...(adapter.volledig ? { fontSize: 18, marginBottom: 0 } : {}) }}>{adapter.titel || 'Plattegrond'}</div>
            {!adapter.volledig && <div style={{ ...AS.sub, marginBottom: 0 }}>Technische tekening op ware schaal, klaar om in te dienen bij de gemeente.</div>}
          </div>
          <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.1)' }} />
          <select title="Wissel van tekening" style={{ ...AS.input, width: 'auto', minWidth: 200, maxWidth: 300, padding: '7px 10px', fontWeight: 600, cursor: 'pointer' }} value={huidigId || ''} onChange={e => open(e.target.value)}>
            {!lijst.length && <option value="">Nog geen plattegrond</option>}
            {lijst.map(l => <option key={l.id} value={l.id}>{l.naam}</option>)}
          </select>
          <button style={{ ...AS.btnSm, padding: '7px 12px' }} onClick={nieuw} title="Nieuwe tekening">+ Nieuw</button>
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          {huidigId && (opgeslagen === 'ja'
            ? <span style={{ fontSize: 11.5, color: '#2e6b3a', display: 'flex', alignItems: 'center', gap: 5, marginRight: 4 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: '#3d9a50' }} />Opgeslagen</span>
            : <button style={{ ...AS.btnSm, padding: '7px 12px', color: '#9a5b00', border: '1px solid #e8c98a', background: '#fff8e8' }} onClick={() => opslaan()} title="⌘S">{opgeslagen === 'bezig' ? 'Opslaan…' : 'Opslaan'}</button>)}
          {huidigId && <>
            <button style={{ ...AS.btnSm, padding: '7px 12px' }} onClick={() => setMetaDlg({ ...meta, evenement: meta.evenement || naam })} title="Naam, locatie, datum en bezoekers van het evenement">Gegevens</button>
            <button style={{ ...AS.btn, marginTop: 0, padding: '8px 15px', display: 'flex', alignItems: 'center', gap: 7 }} onClick={() => setExportDlg({ papier: 'A3', schaal: 'auto', titel: 'Situatietekening', vakken: true })} title="Tekenblad op schaal met legenda, noordpijl en titelblok">{ik('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>')}PDF voor gemeente</button>
            <div style={{ position: 'relative' }}>
              <button style={{ ...AS.btnSm, padding: '7px 11px' }} onClick={() => setMeerOpen(v => !v)} title="Meer: kopie, hernoemen, exporteren, verwijderen">Meer ▾</button>
              {meerOpen && <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 70 }} onPointerDown={() => setMeerOpen(false)} />
                <div className="pg-menu pg-dlg" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 71, width: 230, background: 'var(--pg-kaart)', borderRadius: 12, padding: 5, border: '1px solid rgba(0,0,0,0.09)', boxShadow: '0 12px 36px rgba(0,0,0,0.16)' }} onClick={() => setMeerOpen(false)}>
                  <button onClick={dupliceerPlattegrond}>Kopie van deze tekening</button>
                  <button onClick={() => { const n = prompt('Nieuwe naam', naam); if (n) { setNaam(n); setOpgeslagen('nee'); setLijst(l => l.map(x => x.id === huidigId ? { ...x, naam: n } : x)) } }}>Naam wijzigen</button>
                  <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '4px 6px' }} />
                  <button onClick={() => exporteer('svg')}>Exporteer als SVG (Illustrator)</button>
                  <button onClick={() => exporteer('png')}>Exporteer als PNG</button>
                  <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '4px 6px' }} />
                  <button style={{ color: '#b3261e' }} onClick={verwijderPlattegrond}>Tekening verwijderen</button>
                </div>
              </>}
            </div>
          </>}
        </div>
      </div>

            {metaDlg && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,20,0.32)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }} onPointerDown={e => { if (e.target === e.currentTarget && !metaDlg.nieuw) setMetaDlg(null) }}>
                <div className="pg-dlg" style={{ ...AS.card, width: 420, margin: 0, maxHeight: '92%', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.22)' }}>
                  <div style={{ ...AS.cardTitle, fontSize: 16, marginBottom: 4 }}>{metaDlg.nieuw ? 'Nieuwe tekening' : 'Gegevens van het evenement'}</div>
                  <div style={{ fontSize: 12, color: '#8b8574', marginBottom: 10 }}>Dit komt in het titelblok van de tekening. Met het aantal bezoekers reken ik uitgangen, toiletten en EHBO na.</div>
                  {([['evenement', 'Naam evenement', 'text', 'APÉRO Festival 2027'], ['locatie', 'Locatie', 'text', 'Naam en adres van het terrein'], ['datum', 'Datum (eerste dag)', 'date', ''], ['bezoekers', 'Bezoekers tegelijk aanwezig (piek)', 'number', '1500'], ['organisator', 'Organisator', 'text', ''], ['tekenaar', 'Getekend door', 'text', ''], ['versie', 'Versie', 'text', '1']] as const).map(([k, l, type, ph], i) => (
                    <label key={k} style={{ fontSize: 12, color: '#777162', display: 'block', marginBottom: 8 }}>{l}
                      <input autoFocus={i === 0} style={AS.input} type={type} placeholder={ph} value={(metaDlg[k] as string | number | undefined) ?? ''}
                        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') bewaarMeta() }}
                        onChange={e => setMetaDlg({ ...metaDlg, [k]: type === 'number' ? (e.target.value === '' ? undefined : parseInt(e.target.value)) : e.target.value })} /></label>
                  ))}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                    <button style={AS.btnSm} onClick={() => setMetaDlg(null)}>Annuleer</button>
                    <button style={{ ...AS.btnSm, background: 'var(--pg-inkt)', color: 'var(--pg-papier)', border: '1px solid var(--pg-inkt)' }} onClick={bewaarMeta}>{metaDlg.nieuw ? 'Maak tekening' : 'Bewaar'}</button>
                  </div>
                </div>
              </div>
            )}
      {tentDlg && (() => {
        const m = MATERIAAL[tentDlg.key]!, t = m.tent!
        const g = (v: string) => parseFloat(v.replace(',', '.')) || 0
        const w = g(tentDlg.w), h = m.rond ? w : g(tentDlg.h), opp = m.rond ? Math.PI * w * w / 4 : w * h
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,20,0.32)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }} onPointerDown={e => { if (e.target === e.currentTarget) setTentDlg(null) }}>
            <div className="pg-dlg" style={{ ...AS.card, width: 420, margin: 0, boxShadow: '0 20px 60px rgba(0,0,0,0.22)' }}>
              <div style={{ ...AS.cardTitle, fontSize: 16, marginBottom: 10 }}>Tent plaatsen</div>
              <label style={{ fontSize: 12, color: '#777162', display: 'block', marginBottom: 10 }}>Type tent
                <select style={AS.input} value={tentDlg.key} onChange={e => { const n = MATERIAAL[e.target.value]!; setTentDlg({ ...tentDlg, key: n.key, w: String(n.w), h: String(n.h) }) }}>
                  {MATERIALEN.filter(x => x.tent).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select></label>
              <div style={{ fontSize: 12, color: '#777162', marginBottom: 4 }}>{m.rond ? 'Doorsnede' : 'Breedte'} (m)</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                {t.breedtes.map(b => <button key={b} onClick={() => setTentDlg({ ...tentDlg, w: String(b), ...(tentDlg.key === 'pagode' ? { h: String(b) } : {}) })} style={{ ...AS.btnSm, ...(g(tentDlg.w) === b ? { background: 'var(--pg-inkt)', color: 'var(--pg-papier)', border: '1px solid var(--pg-inkt)' } : {}) }}>{b}</button>)}
                <input style={{ ...AS.input, width: 76 }} value={tentDlg.w} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') plaatsTent() }} onChange={e => setTentDlg({ ...tentDlg, w: e.target.value })} />
              </div>
              {!m.rond && <label style={{ fontSize: 12, color: '#777162', display: 'block', marginBottom: 10 }}>Lengte (m){t.stap > 1 ? `, per ${String(t.stap).replace('.', ',')} m` : ''}
                <input autoFocus style={AS.input} type="number" step={t.stap} min={1} value={tentDlg.h} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') plaatsTent() }} onChange={e => setTentDlg({ ...tentDlg, h: e.target.value })} /></label>}
              <div style={{ fontSize: 12, color: 'var(--pg-inkt)', background: '#f6f2e8', borderRadius: 8, padding: '8px 10px', lineHeight: 1.6 }}>
                <b>{Math.round(opp).toLocaleString('nl-NL')} m²</b> · staand ± {Math.floor(opp * normen.dichtheid).toLocaleString('nl-NL')} personen · zittend aan tafels ± {Math.floor(opp).toLocaleString('nl-NL')}
                {opp > 25 && <><br /><span style={{ color: '#9a5b00' }}>Groter dan 25 m²: tentboek en brandcertificaat meesturen.</span></>}
              </div>
              <label style={{ fontSize: 12, color: '#777162', display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, cursor: 'pointer' }}><input type="checkbox" checked={tentDlg.publiek} onChange={e => setTentDlg({ ...tentDlg, publiek: e.target.checked })} /> Telt mee als publieksruimte (voor de capaciteit)</label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <button style={AS.btnSm} onClick={() => setTentDlg(null)}>Annuleer</button>
                <button style={{ ...AS.btnSm, background: 'var(--pg-inkt)', color: 'var(--pg-papier)', border: '1px solid var(--pg-inkt)' }} onClick={plaatsTent}>Plaats tent</button>
              </div>
            </div>
          </div>
        )
      })()}
      {huidigId && <>
        {/* kengetallen: wat heb je, wat heb je nodig bij dit aantal bezoekers */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap', marginBottom: 9 }}>
          <label className="pg-tegel" style={{ flex: '0 0 auto', width: 172, background: 'var(--pg-inkt)', color: 'var(--pg-papier)', borderRadius: 13, padding: '8px 12px 9px', border: '1px solid var(--pg-inkt)', boxSizing: 'border-box' }} title="Het hoogste aantal bezoekers dat tegelijk op het terrein is. Hier reken ik alles mee na.">
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', opacity: 0.75, whiteSpace: 'nowrap' }}>Bezoekers tegelijk</div>
            <input type="number" min={0} step={50} value={meta.bezoekers ?? ''} placeholder="aantal" onChange={e => setDoc(d => ({ ...d, meta: { ...(d.meta || {}), bezoekers: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value) || 0) } }))}
              style={{ width: '100%', marginTop: 3, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', borderRadius: 7, padding: '2px 7px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--pg-sans)', color: 'inherit', boxSizing: 'border-box' }} /></label>
          {(() => {
            const nl = (v: number, d = 0) => v.toLocaleString('nl-NL', { maximumFractionDigits: d })
            const chip = (label: string, heb: string, nodig: string | null, staat: 'ok' | 'tekort' | 'leeg', titel: string, deel: number | null) => {
              const kl = staat === 'ok' ? '#2e8b47' : staat === 'tekort' ? '#c9392e' : '#b5ae9c'
              return (
                <button key={label} className="pg-tegel" title={titel} onClick={() => setZijTab('check')} style={{ flex: '1 1 128px', minWidth: 124, textAlign: 'left', fontFamily: 'var(--pg-sans)', cursor: 'pointer', borderRadius: 13, padding: '8px 12px 9px', border: '1px solid ' + (staat === 'tekort' ? '#f0c4bf' : 'rgba(0,0,0,0.08)'), background: staat === 'tekort' ? '#fff7f6' : 'var(--pg-kaart)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#8b8574' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 4, background: kl }} />{label}
                    {staat !== 'leeg' && <span style={{ marginLeft: 'auto', color: kl, letterSpacing: 0, textTransform: 'none', fontSize: 10.5 }}>{staat === 'ok' ? 'genoeg' : 'te weinig'}</span>}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--pg-inkt)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{heb}{nodig && <span style={{ fontSize: 11.5, fontWeight: 500, color: '#8b8574' }}> van {nodig}</span>}</div>
                  <div style={{ height: 4, background: 'rgba(0,0,0,0.07)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}><div style={{ height: '100%', width: `${Math.round(Math.max(0, Math.min(1, deel ?? 0)) * 100)}%`, background: kl, borderRadius: 2, transition: 'width .3s' }} /></div>
                </button>
              )
            }
            const st = (heb: number, nodig: number): 'ok' | 'tekort' | 'leeg' => !kg.bez ? 'leeg' : heb + 1e-6 >= nodig ? 'ok' : 'tekort'
            const dl = (heb: number, nodig: number) => kg.bez && nodig > 0 ? heb / nodig : null
            return [
              kg.capaciteit == null
                ? chip('Capaciteit', 'nog niet getekend', null, 'leeg', 'Teken het vlak waar publiek staat (pen) of plaats een tent, en vink Publieksruimte aan. Dan zie je hier hoeveel personen erop passen.', null)
                : chip('Capaciteit', `${nl(kg.capaciteit)} pers.`, null, st(kg.capaciteit, kg.bez), `Zoveel personen passen op de publieksruimte bij ${String(normen.dichtheid).replace('.', ',')} per m².`, dl(kg.capaciteit, kg.bez)),
              chip('Nooduitgang', `${nl(kg.uitgangM, 1)} m`, kg.bez ? `${nl(kg.uitgangNodig, 1)} m` : null, kg.uitgangen < 2 && kg.bez ? 'tekort' : st(kg.uitgangM, kg.uitgangNodig), `Breedte van alle (nood)uitgangen samen, tegenover wat nodig is bij ${normen.uitgangPm} personen per meter. Minimaal twee uitgangen.`, dl(kg.uitgangM, kg.uitgangNodig)),
              chip('Toiletten', `${kg.wc}`, kg.bez ? `${kg.wcNodig}` : null, st(kg.wc, kg.wcNodig), `Eén toilet per ${normen.toiletPer} bezoekers, minimaal twee. Een toiletwagen telt voor 8, een urinoir voor 4.`, dl(kg.wc, kg.wcNodig)),
              chip('Bar', `${nl(kg.barM, 1)} m`, kg.bez ? `${nl(kg.barNodig, 1)} m` : null, st(kg.barM, kg.barNodig), `Strekkende meter bar, tegenover de vuistregel van één meter per ${normen.barPer} bezoekers.`, dl(kg.barM, kg.barNodig)),
              chip('EHBO', kg.ehbo ? 'post staat erop' : 'geen post', kg.ehbo && kg.bez ? null : null, kg.ehbo ? (kg.bez ? 'ok' : 'leeg') : (kg.bez ? 'tekort' : 'leeg'), `Eén hulpverlener per ${normen.ehboPer} bezoekers, minimaal twee.${kg.bez ? ` Bij dit aantal: ${kg.hulpverleners} hulpverleners.` : ''}`, kg.ehbo ? 1 : 0),
            ]
          })()}
        </div>
        {!kg.bez && <div style={{ fontSize: 11.5, color: '#a39d8c', margin: '-3px 0 8px 2px' }}>Vul het aantal bezoekers in, dan zie je direct of het genoeg is.</div>}
        {/* lagen per vakgebied aan en uit, en wisselen tussen versies van de indeling */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', marginBottom: 9, background: 'var(--pg-kaart)', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12, padding: '6px 10px' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#a39d8c', letterSpacing: 0.5, textTransform: 'uppercase', marginRight: 4 }}>Lagen</span>
          {lagen.map(l => {
            const n = doc.objs.filter(o => o.laag === l.id).length, kl = VAKLAGEN.find(v => v.id === l.id)?.kleur || '#777'
            return <button key={l.id} title={l.zichtbaar ? 'Klik om te verbergen' : 'Klik om te tonen'} onClick={() => setDoc(d => ({ ...d, lagen: (d.lagen || STANDAARD_LAGEN).map(x => x.id === l.id ? { ...x, zichtbaar: !x.zichtbaar } : x) }))}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--pg-sans)', cursor: 'pointer', borderRadius: 20, padding: '3px 9px 3px 7px', border: '1px solid ' + (l.zichtbaar ? 'rgba(0,0,0,0.12)' : 'transparent'), background: l.zichtbaar ? 'color-mix(in srgb, var(--pg-papier) 60%, #fff)' : 'transparent', color: l.zichtbaar ? 'var(--pg-inkt)' : '#b5ae9c', textDecoration: l.zichtbaar ? 'none' : 'line-through' }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: l.zichtbaar ? kl : 'transparent', border: '1.5px solid ' + kl }} />{l.naam}{n > 0 && <span style={{ fontWeight: 400, opacity: 0.6 }}>{n}</span>}
            </button>
          })}
          <button onClick={() => setDoc(d => ({ ...d, lagen: (d.lagen || STANDAARD_LAGEN).map(x => ({ ...x, zichtbaar: true })) }))} style={{ fontSize: 11.5, border: 'none', background: 'none', color: '#a39d8c', cursor: 'pointer', fontFamily: 'var(--pg-sans)' }}>alles aan</button>
          <span style={{ flex: 1 }} />
          <span style={{ width: 1, height: 18, background: 'rgba(0,0,0,0.1)', marginRight: 6 }} /><span style={{ fontSize: 10, fontWeight: 700, color: '#a39d8c', letterSpacing: 0.5, textTransform: 'uppercase', marginRight: 4 }}>Versie</span>
          {(versies.length ? versies : [{ id: '', naam: 'Versie A', objs: [] }]).map(v => {
            const actief = !versies.length || v.id === doc.versie
            return <button key={v.id} onClick={() => v.id && wisselVersie(v.id)} onDoubleClick={() => v.id && hernoemVersie(v.id)} title={versies.length ? 'Klik om te wisselen, dubbelklik om te hernoemen' : 'Maak een tweede versie om indelingen te vergelijken'}
              style={{ fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--pg-sans)', cursor: 'pointer', borderRadius: 8, padding: '4px 10px', border: '1px solid ' + (actief ? 'var(--pg-inkt)' : 'rgba(0,0,0,0.14)'), background: actief ? 'var(--pg-inkt)' : 'var(--pg-kaart)', color: actief ? 'var(--pg-papier)' : 'var(--pg-inkt)' }}>{v.naam}</button>
          })}
          <button onClick={nieuweVersie} title="Kopie van de huidige indeling als nieuwe versie" style={{ fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--pg-sans)', cursor: 'pointer', borderRadius: 8, padding: '4px 9px', border: '1px dashed rgba(0,0,0,0.25)', background: 'transparent', color: 'var(--pg-inkt)' }}>+ versie</button>
          {versies.length > 1 && <button onClick={verwijderVersie} title="Deze versie verwijderen" style={{ fontSize: 13, border: 'none', background: 'none', color: '#b5ae9c', cursor: 'pointer' }}>×</button>}
        </div>
      </>}
      {!huidigId ? (
        <div style={{ ...AS.card, textAlign: 'center', padding: '56px 30px 46px', maxWidth: 820, margin: '6vh auto 0', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ fontFamily: 'var(--pg-serif)', fontSize: 26, color: 'var(--pg-inkt)', marginBottom: 8 }}>Begin een nieuwe tekening</div>
          <div style={{ fontSize: 13.5, color: '#8b8574', marginBottom: 26, lineHeight: 1.55 }}>Een technische tekening op ware schaal, klaar voor gemeente en leveranciers.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, textAlign: 'left', marginBottom: 26 }}>
            {([['1', 'Gegevens en locatie', 'Vul je evenement in en zoek het adres op. De kaart staat direct op schaal.'], ['2', 'Tekenen', 'Zet hekken, tenten, bars, toiletten en stroom erop. Alles op ware grootte.'], ['3', 'Controleren en indienen', 'Zie of uitgangen, toiletten en bar genoeg zijn en download de PDF.']] as const).map(([n, t, u]) => (
              <div key={n} style={{ background: 'color-mix(in srgb, var(--pg-papier) 55%, #fff)', borderRadius: 13, padding: '14px 16px', border: '1px solid rgba(0,0,0,0.06)' }}>
                <div style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--pg-inkt)', color: 'var(--pg-papier)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 9 }}>{n}</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--pg-inkt)', marginBottom: 3 }}>{t}</div>
                <div style={{ fontSize: 12, color: '#8b8574', lineHeight: 1.5 }}>{u}</div>
              </div>
            ))}
          </div>
          <button style={{ ...AS.btn, marginTop: 0, padding: '11px 24px', fontSize: 14 }} onClick={nieuw}>Nieuwe plattegrond</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 340px', gap: 10, ...(adapter.volledig ? { flex: 1, minHeight: 0 } : { height: 'calc(100vh - 250px)', minHeight: 600 }) }}>
          {/* gereedschap */}
          <div style={{ ...AS.card, padding: 5, margin: 0, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', overflowY: 'auto', borderRadius: 14 }}>
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
            {knop('maat', svgIcon('<path d="M4 12h16M4 8v8M20 8v8M7 10l-3 2 3 2M17 10l3 2-3 2"/>'), 'Maatlijn: zet een maat vast op de tekening', 'D')}
            {knop('measure', svgIcon('<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>'), 'Meetlat', 'U')}
            {scheiding}
            {knop('hand', svgIcon('<path d="M8 13V5a1.5 1.5 0 013 0v6m0-1V3.5a1.5 1.5 0 013 0V11m0-5.5a1.5 1.5 0 013 0V13m0-4.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-2a6 6 0 01-5-3l-2.7-4.5a1.5 1.5 0 012.5-1.6L8 14"/>'), 'Handje (of spatie ingedrukt)', 'H')}
            {knop('zoom', svgIcon('<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 11h6M11 8v6"/>'), 'Zoom (alt = uitzoomen)', 'Z')}
            <div style={{ flex: 1 }} />
            <button title="Ongedaan maken (⌘Z)" onClick={undo} style={{ ...klein, border: 'none', fontSize: 16 }}>↶</button>
            <button title="Opnieuw (⇧⌘Z)" onClick={redo} style={{ ...klein, border: 'none', fontSize: 16 }}>↷</button>
          </div>

          {/* canvas */}
          <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.09)', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.03)' }}>
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
                  <path d={`M ${rasterStap * view.s} 0 L 0 0 0 ${rasterStap * view.s}`} fill="none" stroke="rgba(20,30,50,0.045)" strokeWidth="1" />
                </pattern>
                <pattern id="r-groot" width={grootStap * view.s} height={grootStap * view.s} patternUnits="userSpaceOnUse" x={-view.x * view.s} y={-view.y * view.s}>
                  <path d={`M ${grootStap * view.s} 0 L 0 0 0 ${grootStap * view.s}`} fill="none" stroke="rgba(20,30,50,0.1)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#r-klein)" />
              <rect width="100%" height="100%" fill="url(#r-groot)" />
              <g id="tekening" transform={`scale(${view.s}) translate(${-view.x} ${-view.y})`}>
                <g id="kaartlaag" opacity={doc.kaart?.opacity ?? 1} style={{ pointerEvents: 'none' }}>{tegels.map(t => <image key={t.href} href={t.href} x={t.x} y={t.y} width={t.s * 1.002} height={t.s * 1.002} />)}</g>
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
                  {concept && <polyline points={concept.map(p => p.join(',')).join(' ')} fill="none" stroke={tool === 'measure' ? '#e0338a' : tool === 'maat' ? '#2b6cb0' : tool === 'calibrate' ? '#d69e2e' : tool === 'hek' ? (MATERIAAL[hekMat]?.kleur || '#4a5568') : '#010341'} strokeOpacity={tool === 'hek' ? 0.5 : 1} strokeWidth={tool === 'line' ? 0.2 : tool === 'hek' ? (MATERIAAL[hekMat]?.breedte || 0.2) : 2 * sw} strokeLinejoin="round" strokeDasharray={tool === 'measure' || tool === 'calibrate' ? `${6 * sw} ${3 * sw}` : undefined} />}
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
                style={{ position: 'absolute', left: sx, top: sy, fontSize: fs, fontFamily: 'var(--pg-serif)', fontWeight: 600, color: 'var(--pg-inkt)', background: 'rgba(255,255,255,0.9)', border: '1.5px solid #2b6cb0', borderRadius: 4, padding: '0 4px', outline: 'none', minWidth: 160 }} />
            })()}

            {/* verplaatsen-dialoog (Enter) */}
            {verplaatsDlg && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(1,3,65,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }} onPointerDown={e => { if (e.target === e.currentTarget) setVerplaatsDlg(null) }}>
                <div className="pg-dlg" style={{ ...AS.card, width: 280, margin: 0, boxShadow: '0 20px 60px rgba(0,0,0,0.22)' }}>
                  <div style={AS.cardTitle}>Verplaatsen</div>
                  {(['dx', 'dy'] as const).map((k, i) => (
                    <label key={k} style={{ fontSize: 12, color: '#777162', display: 'block', marginBottom: 8 }}>{k === 'dx' ? 'Horizontaal (m)' : 'Verticaal (m)'}
                      <input autoFocus={i === 0} style={AS.input} value={verplaatsDlg[k]} onChange={e => setVerplaatsDlg({ ...verplaatsDlg, [k]: e.target.value })}
                        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') setVerplaatsDlg(null); if (e.key === 'Enter') (e.currentTarget.closest('div')!.parentElement!.querySelector('[data-ok]') as HTMLButtonElement).click() }} /></label>
                  ))}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button style={{ ...AS.btnSm }} onClick={() => setVerplaatsDlg(null)}>Annuleer</button>
                    <button style={{ ...AS.btnSm }} onClick={() => { const dx = parseFloat(verplaatsDlg.dx.replace(',', '.')) || 0, dy = parseFloat(verplaatsDlg.dy.replace(',', '.')) || 0; const k = kopieer(gesel, dx, dy); if (k.length) voegToe(k); laatsteTransform.current = { dx, dy, kopie: true }; setVerplaatsDlg(null) }}>Kopie</button>
                    <button data-ok style={{ ...AS.btnSm, background: 'var(--pg-inkt)', color: 'var(--pg-papier)' }} onClick={() => { const dx = parseFloat(verplaatsDlg.dx.replace(',', '.')) || 0, dy = parseFloat(verplaatsDlg.dy.replace(',', '.')) || 0; wijzig(sel, o => o.locked ? o : verplaats(o, dx, dy)); laatsteTransform.current = { dx, dy, kopie: false }; setVerplaatsDlg(null) }}>OK</button>
                  </div>
                  <div style={{ fontSize: 10.5, color: '#a39d8c', marginTop: 8 }}>Tip: Kopie en daarna ⌘D herhaalt het, handig voor een rij statafels.</div>
                </div>
              </div>
            )}

            {exportDlg && (() => {
              const b = inhoudBbox(), auto = b ? kiesSchaal(b, exportDlg.papier) : 500
              const N = exportDlg.schaal === 'auto' ? auto : exportDlg.schaal
              return (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6 }} onPointerDown={e => { if (e.target === e.currentTarget && !exportDlg.bezig) setExportDlg(null) }}>
                  <div className="pg-dlg" style={{ ...AS.card, width: 440, margin: 0, boxShadow: '0 20px 60px rgba(0,0,0,0.22)' }}>
                    <div style={{ ...AS.cardTitle, fontSize: 16, marginBottom: 4 }}>Tekening voor gemeente en leveranciers</div>
                    <div style={{ fontSize: 12, color: '#8b8574', marginBottom: 12, lineHeight: 1.5 }}>Je krijgt een tekenblad op een echte schaal, met legenda, noordpijl, schaalbalk en titelblok.</div>
                    <label style={{ fontSize: 12, color: '#777162', display: 'block', marginBottom: 8 }}>Soort tekening
                      <input style={AS.input} list="pg-titels" value={exportDlg.titel} onKeyDown={e => e.stopPropagation()} onChange={e => setExportDlg({ ...exportDlg, titel: e.target.value })} />
                      <datalist id="pg-titels">{['Situatietekening', 'Inrichtingstekening', 'Tentindeling', 'Calamiteitenplattegrond', 'Opbouwtekening leveranciers'].map(t => <option key={t} value={t} />)}</datalist></label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <label style={{ fontSize: 12, color: '#777162' }}>Papier
                        <select style={AS.input} value={exportDlg.papier} onChange={e => setExportDlg({ ...exportDlg, papier: e.target.value })}>{Object.keys(PAPIER).map(k => <option key={k} value={k}>{k} liggend</option>)}</select></label>
                      <label style={{ fontSize: 12, color: '#777162' }}>Schaal
                        <select style={AS.input} value={exportDlg.schaal} onChange={e => setExportDlg({ ...exportDlg, schaal: e.target.value === 'auto' ? 'auto' : parseInt(e.target.value) })}>
                          <option value="auto">Passend (1:{auto})</option>{SCHALEN.filter(n => n <= 2500).map(n => <option key={n} value={n}>1:{n}{n < auto ? ' (uitsnede)' : ''}</option>)}</select></label>
                    </div>
                    <label style={{ fontSize: 12, color: '#777162', display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, cursor: 'pointer' }}><input type="checkbox" checked={!!exportDlg.vakken} onChange={e => setExportDlg({ ...exportDlg, vakken: e.target.checked })} /> Vakkenraster (A1, B2, …) zodat iedereen een plek kan aanwijzen</label>
                    <div style={{ fontSize: 11.5, color: N > 1000 ? '#9a5b00' : '#777162', background: N > 1000 ? '#fff4e0' : '#f6f2e8', borderRadius: 8, padding: '8px 10px', marginTop: 10, lineHeight: 1.5 }}>
                      {N > 1000 ? `Schaal 1:${N} is klein. Gemeentes vragen voor een situatietekening meestal 1:500 of 1:1000. Kies groter papier.` : N <= 200 ? `Schaal 1:${N}: geschikt als inrichtings- of tentindeling (gevraagd: 1:100 of 1:200).` : `Schaal 1:${N}: geschikt als situatietekening (gevraagd: 1:500 of 1:1000).`}
                      {checkActies > 0 && <><br />Let op: de gemeentecheck heeft nog {checkActies} {checkActies === 1 ? 'punt' : 'punten'} open.</>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                      <button style={AS.btnSm} disabled={exportDlg.bezig} onClick={() => setExportDlg(null)}>Annuleer</button>
                      <button style={{ ...AS.btnSm, background: 'var(--pg-inkt)', color: 'var(--pg-papier)', border: '1px solid var(--pg-inkt)' }} disabled={exportDlg.bezig} onClick={exporteerPdf}>{exportDlg.bezig ? 'PDF wordt gemaakt…' : 'Maak PDF'}</button>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* schaalbalk en coördinaten */}
            <div style={{ position: 'absolute', left: linialen ? 28 : 12, bottom: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: '#777162', fontFamily: 'var(--pg-sans)', pointerEvents: 'none' }}>
              <div>
                <div style={{ width: grootStap * view.s, height: 6, borderLeft: '2px solid var(--pg-inkt)', borderRight: '2px solid var(--pg-inkt)', borderBottom: '2px solid var(--pg-inkt)' }} />
                <div style={{ textAlign: 'center', marginTop: 2 }}>{String(grootStap).replace('.', ',')} m</div>
              </div>
              <span style={{ background: 'rgba(255,255,255,0.85)', padding: '2px 6px', borderRadius: 5 }}>x {r2(muis[0])} · y {r2(muis[1])} m</span>
            </div>
            <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', gap: 3, background: 'rgba(255,255,255,0.96)', borderRadius: 11, padding: 4, border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 3px 12px rgba(0,0,0,0.08)', alignItems: 'center' }}>
              <button style={{ ...klein, border: 'none' }} onClick={() => zoomOp(1 / 1.3)} title="⌘-">−</button>
              <span style={{ fontSize: 11, color: '#777162', minWidth: 62, textAlign: 'center' }}>1 m = {Math.round(view.s)} px</span>
              <button style={{ ...klein, border: 'none' }} onClick={() => zoomOp(1.3)} title="⌘+">+</button>
              <button style={{ ...klein, border: 'none' }} onClick={passend} title="⌘0">Passend</button>
            </div>
            <div style={{ position: 'absolute', left: linialen ? 26 : 10, top: linialen ? 26 : 10, display: 'flex', gap: 3, background: 'rgba(255,255,255,0.96)', borderRadius: 11, padding: '4px 8px 4px 4px', fontSize: 11.5, color: 'var(--pg-inkt)', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 3px 12px rgba(0,0,0,0.08)', alignItems: 'center', flexWrap: 'wrap', maxWidth: 'calc(100% - 60px)' }}>
              {schakel('Magnetisch', snap, setSnap, 'Objecten klikken vast op het raster en op elkaar')}
              {schakel('Hulplijnen', slim, setSlim, 'Slimme hulplijnen bij uitlijnen (⌘U)')}
              {schakel('Maten', toonMaten, setToonMaten, 'Maten van objecten tonen')}
              {schakel('Linialen', linialen, setLinialen, 'Linialen langs de rand, sleep er hulplijnen uit (⌘R)')}
              <label style={{ display: 'flex', gap: 5, alignItems: 'center', color: '#8b8574', paddingLeft: 6, borderLeft: '1px solid rgba(0,0,0,0.1)' }}>Raster
                <select value={raster} onChange={e => setRaster(parseFloat(e.target.value))} style={{ fontSize: 11.5, border: '1px solid #e3dcc9', borderRadius: 6, padding: '2px 3px', fontFamily: 'var(--pg-sans)', color: 'var(--pg-inkt)', background: '#fff' }}>
                  {[0.1, 0.25, 0.5, 1, 2, 5].map(v => <option key={v} value={v}>{String(v).replace('.', ',')} m</option>)}
                </select></label>
              {overlappers.size > 0 && <span style={{ color: '#c9392e', fontWeight: 600, background: '#fff0ee', borderRadius: 7, padding: '3px 8px', marginLeft: 4 }}>{overlappers.size} blokken overlappen</span>}
            </div>
            {(tool !== 'select' && tool !== 'hand' && tool !== 'direct') && (
              <div style={{ position: 'absolute', left: '50%', top: linialen ? 62 : 48, transform: 'translateX(-50%)', background: 'var(--pg-inkt)', color: 'var(--pg-papier)', fontSize: 12, padding: '6px 12px', borderRadius: 8, pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
                {({ rect: 'Sleep een rechthoek. Shift = vierkant, alt = vanuit het midden.', ellipse: 'Sleep een ellips. Shift = cirkel.', line: 'Klik punten voor een muur. Shift = haaks. Dubbelklik, Enter of Esc = klaar.', pen: 'Klik punten. Klik op het beginpunt voor een gesloten vlak, Enter voor een open pad.', text: 'Klik waar de tekst moet komen.', measure: 'Klik twee punten om te meten. Esc = stoppen.', calibrate: 'Trek een lijn over een maat die je kent, bijvoorbeeld een muur.', zoom: 'Klik om in te zoomen, alt-klik om uit te zoomen.', pipet: 'Klik op een object om de opmaak over te nemen op je selectie.', nummer: `Klik objecten op volgorde. Volgende nummer: ${nrVolgende}. Alt-klik = nummer weg.`, hek: `${MATERIAAL[hekMat]?.label}: klik de route. Shift = haaks, dubbelklik of Enter = klaar.`, maat: 'Maatlijn: klik begin en eind. Klikt vast op hoeken van objecten. Blijft op de tekening staan.', hand: '', select: '', direct: '' } as Record<Tool, string>)[tool]}
              </div>
            )}
            {uploadBezig && <div style={{ position: 'absolute', inset: 0, background: 'rgba(251,248,241,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--pg-inkt)', fontFamily: 'var(--pg-serif)' }}>Plattegrond van de locatie inladen…</div>}
          </div>

          {/* rechterpaneel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
            <div style={{ ...AS.card, margin: 0, padding: '12px 14px', maxHeight: '48%', overflowY: 'auto', flexShrink: 0 }}>
              {enkel ? <>
                <div style={{ ...AS.cardTitle, marginBottom: 6, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{naamVan(enkel)}</span>
                  <span style={{ fontWeight: 400, color: '#8b8574', fontSize: 11.5, whiteSpace: 'nowrap' }}>{enkel.kind === 'line' || enkel.kind === 'hek' || enkel.kind === 'maat' ? fmt(lengte(enkel.pts!)) : enkel.kind === 'legenda' ? '' : `${r2(oppervlak(enkel))} m²`}</span>
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
                {enkel.kind === 'hek' && <div style={{ fontSize: 12, color: 'var(--pg-inkt)' }}>{MATERIAAL[enkel.mat || '']?.soort === 'route'
                  ? <label style={{ fontSize: 11, color: '#777162', display: 'block' }}>Vrije breedte (m)<input style={mini} type="number" step={0.5} min={0.5} value={enkel.dik ?? MATERIAAL[enkel.mat || '']?.breedte ?? 3.5} onChange={e => wijzig([enkel.id], o => ({ ...o, dik: Math.max(0.5, parseFloat(e.target.value) || 3.5) }))} /></label>
                  : <>{hekStuks(enkel)} stuks van {String(MATERIAAL[enkel.mat || '']?.stuk).replace('.', ',')} m</>}
                  <select style={{ ...mini, marginTop: 6 }} value={enkel.mat} onChange={e => wijzig([enkel.id], o => ({ ...o, mat: e.target.value }))}>
                    {MATERIALEN.filter(m => m.soort === MATERIAAL[enkel.mat || '']?.soort).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select></div>}
                {enkel.kind === 'partner' && <div style={{ fontSize: 10.5, color: '#8b8574', marginTop: 5 }}>Maat komt van de partner. Aanpassen kan in de partnerlijst.</div>}
                {(enkel.kind === 'poly' || enkel.kind === 'rect' || !!MATERIAAL[enkel.mat || '']?.tent) && <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                  <label style={{ fontSize: 11, color: '#777162', display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={!!enkel.publiek} onChange={e => wijzig([enkel.id], o => ({ ...o, publiek: e.target.checked }))} /> Publieksruimte</label>
                  {enkel.publiek && <label style={{ fontSize: 11, color: '#777162', display: 'flex', gap: 4, alignItems: 'center' }}><input style={{ ...mini, width: 52 }} type="number" step={0.5} min={0.5} value={enkel.dichtheid ?? normen.dichtheid} onChange={e => wijzig([enkel.id], o => ({ ...o, dichtheid: Math.max(0.1, parseFloat(e.target.value) || 2.5) }))} /> pers/m²</label>}
                </div>}
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
                <div style={sectie}>Als geheel draaien</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button style={klein} onClick={() => draai(-90)}>⟲ 90°</button>
                  <button style={klein} onClick={() => draai(90)}>⟳ 90°</button>
                  <input style={{ ...mini, width: 54 }} type="number" step={5} value={draaiInvoer} onChange={e => setDraaiInvoer(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') draai(parseFloat(draaiInvoer) || 0) }} />
                  <button style={klein} onClick={() => draai(parseFloat(draaiInvoer) || 0)}>° draaien</button>
                </div>
                <div style={{ fontSize: 10.5, color: '#a39d8c', marginTop: 3 }}>Of sleep het rondje boven de selectie. Shift = stappen van 15°.</div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ ...AS.cardTitle, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.evenement || naam}</div>
                  <button style={klein} onClick={() => setMetaDlg({ ...meta, evenement: meta.evenement || naam })}>Gegevens</button>
                </div>
                <div style={{ fontSize: 12, color: '#8b8574' }}>{[meta.locatie, meta.datum && new Date(meta.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }), meta.bezoekers && `${meta.bezoekers.toLocaleString('nl-NL')} bezoekers`].filter(Boolean).join(' · ') || 'Vul locatie, datum en aantal bezoekers in.'}</div>
                <button onClick={() => setZijTab('check')} style={{ width: '100%', marginTop: 10, padding: '9px 11px', borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left', background: checkActies ? '#fff4e0' : '#e8f3ea', fontFamily: 'var(--pg-sans)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700, color: checkActies ? '#9a5b00' : '#2e6b3a' }}>
                    <span>Gemeentecheck</span><span>{checkActies ? `${checkActies} te doen` : 'klaar om in te dienen'}</span>
                  </div>
                  <div style={{ height: 5, background: 'rgba(0,0,0,0.08)', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}><div style={{ height: '100%', width: `${(1 - checkActies / Math.max(1, checks.length)) * 100}%`, background: checkActies ? '#d69e2e' : '#2e6b3a', transition: 'width .3s' }} /></div>
                </button>
                <div style={sectie}>Nummering & legenda</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button style={klein} onClick={nummerAuto} title="Alle deelnemers en materialen, van linksboven naar rechtsonder">Automatisch nummeren</button>
                  <button style={klein} onClick={() => setTool('nummer')}>Met de hand (N)</button>
                  <button style={{ ...klein, color: '#999' }} onClick={nummersWissen}>Wis nummers</button>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                  <label style={{ fontSize: 11, color: '#777162', display: 'flex', alignItems: 'center', gap: 4 }}>Tekst en nummers
                    <input style={{ ...mini, width: 56 }} type="number" step={0.1} min={0.2} value={r2(T)} onChange={e => setDoc(d => ({ ...d, nrGrootte: Math.max(0.1, (parseFloat(e.target.value) || 1.2) / 2) }))} /> m</label>
                  {doc.nrGrootte ? <button style={{ ...klein, border: 'none', color: '#a39d8c' }} onClick={() => setDoc(d => ({ ...d, nrGrootte: undefined }))}>auto</button> : <span style={{ fontSize: 10.5, color: '#a39d8c' }}>auto</span>}
                  <button style={{ ...klein, border: 'none', color: '#a39d8c' }} onClick={() => setToonHulp(v => !v)}>{toonHulp ? 'Verberg sneltoetsen' : 'Sneltoetsen'}</button>
                </div>
                <div style={{ fontSize: 10.5, color: '#a39d8c', marginTop: 4 }}>De legenda komt vanzelf op het tekenblad in de PDF.</div>
                {toonHulp && <div style={{ fontSize: 10.5, color: '#8b8574', marginTop: 8, lineHeight: 1.55 }}>
                  V selecteer · A direct · P pen · \ lijn · M rechthoek · L ellips · T tekst · D maatlijn · N nummer · I pipet · U meet · H hand · Z zoom<br />
                  ⌘G groep · ⌘2 vergrendel · ⌘3 verberg · ⌘D nogmaals · Enter verplaatsen · ⌘F/⌘B plak voor/achter · ⌘[ ] schikken · R draai 90° · O spiegel · alt-slepen kopie · alt ingedrukt = afstanden · ⌘R linialen (sleep er hulplijnen uit) · ⌘; hulplijnen · ⌘0 passend · ⌘S opslaan
                </div>}
              </>}
            </div>

            {/* tabbladen */}
            <div style={{ ...AS.card, margin: 0, padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 3, padding: 5, borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
                {([['locatie', 'Locatie'], ['partners', adapter.deelnemerLabel], ['materialen', 'Materiaal'], ['check', 'Check'], ['lagen', 'Lagen']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setZijTab(k)} style={{ flex: '1 1 auto', padding: '7px 4px', border: 'none', borderRadius: 8, fontFamily: 'var(--pg-sans)', background: zijTab === k ? 'var(--pg-inkt)' : 'transparent', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', color: zijTab === k ? 'var(--pg-papier)' : '#8b8574', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>{l}{k === 'check' && <span style={{ fontSize: 10, fontWeight: 700, minWidth: 15, height: 15, lineHeight: '15px', borderRadius: 8, padding: '0 3px', boxSizing: 'border-box', background: checkActies ? '#c9392e' : '#2e8b47', color: '#fff' }}>{checkActies || '✓'}</span>}</button>
                ))}
              </div>
              <div style={{ overflowY: 'auto', padding: '10px 12px', flex: 1 }}>
                {zijTab === 'partners' && <>
                  <div style={{ fontSize: 11.5, color: '#777162', marginBottom: 5 }}>{relevante.filter(p => geplaatst.has(p.id)).length} van {relevante.length} op de tekening</div>
                  <div style={{ height: 5, background: '#efe9da', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${relevante.length ? (relevante.filter(p => geplaatst.has(p.id)).length / relevante.length) * 100 : 0}%`, background: '#2e6b3a', transition: 'width .3s' }} />
                  </div>
                  <input style={{ ...mini, marginBottom: 8 }} placeholder="Zoek op naam…" value={zoek} onChange={e => setZoek(e.target.value)} />
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
                            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--pg-inkt)', opacity: op ? 0.6 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.naam}>{bnaam(p)}</span>
                            <span onClick={e => e.stopPropagation()} style={{ fontSize: 10.5, color: mt.eigen ? '#2e6b3a' : '#a39d8c', whiteSpace: 'nowrap' }} title={mt.eigen ? 'Door partner ingevuld' : 'Standaardmaat, nog niet ingevuld door partner'}>
                              <input defaultValue={p.stand_breedte_m ?? ''} placeholder={String(mt.w)} onBlur={e => e.target.value !== String(p.stand_breedte_m ?? '') && slaMaatOp(p, e.target.value, String(p.stand_diepte_m ?? ''))} style={{ width: 28, fontSize: 10.5, border: '1px solid #eee5d2', borderRadius: 4, padding: '0 2px', textAlign: 'right' }} />×<input defaultValue={p.stand_diepte_m ?? ''} placeholder={String(mt.h)} onBlur={e => e.target.value !== String(p.stand_diepte_m ?? '') && slaMaatOp(p, String(p.stand_breedte_m ?? ''), e.target.value)} style={{ width: 28, fontSize: 10.5, border: '1px solid #eee5d2', borderRadius: 4, padding: '0 2px' }} />
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                  <div style={{ fontSize: 10.5, color: '#a39d8c', lineHeight: 1.5 }}>Sleep een naam op de tekening of klik erop. Groene maat = zelf ingevuld, grijs = standaardmaat.</div>
                  <button style={{ ...klein, marginTop: 8 }} onClick={voegDeelnemerToe}>+ Deelnemer of stand toevoegen</button>
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
                            <div key={m.key} draggable={!isLijn(m)} onDragStart={e => e.dataTransfer.setData('materiaal', m.key)} onClick={() => plaatsMateriaal(m)}
                              title={`${m.label} · ${isLijn(m) ? (m.soort === 'route' ? 'teken de route als lijn' : `teken een lijn, ${String(m.stuk).replace('.', ',')} m per stuk`) : `${m.w} × ${m.h} m`}`}
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 8, cursor: isLijn(m) ? 'crosshair' : 'grab', border: tool === 'hek' && hekMat === m.key ? '1.5px solid var(--pg-inkt)' : '1px solid rgba(0,0,0,0.08)', background: '#fff', position: 'relative' }} className="pg-tegel">
                              <svg width="24" height="24" viewBox="0 0 24 24" style={{ flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: symboolSvg(m) }} />
                              <span style={{ fontSize: 11, color: 'var(--pg-inkt)', lineHeight: 1.2, overflow: 'hidden' }}>{m.label}<br /><span style={{ color: '#a39d8c', fontSize: 10 }}>{isLijn(m) ? (m.soort === 'route' ? `route · ${String(m.breedte).replace('.', ',')} m breed` : `lijn · ${String(m.stuk).replace('.', ',')} m/st`) : `${String(m.w).replace('.', ',')}×${String(m.h).replace('.', ',')}`}</span></span>
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
                      <div onClick={() => setActieveLaag(l.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 6px', borderRadius: 7, background: actieveLaag === l.id ? 'color-mix(in srgb, var(--pg-inkt) 8%, transparent)' : 'transparent', cursor: 'pointer' }}>
                        <button title="Zichtbaar" onClick={e => { e.stopPropagation(); zetLaag({ zichtbaar: !l.zichtbaar }) }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--pg-inkt)', opacity: l.zichtbaar ? 0.85 : 0.3, width: 22, height: 20, padding: 0, borderRadius: 5 }}>{ik(l.zichtbaar ? OOG : OOG_UIT)}</button>
                        <button title="Vergrendelen" onClick={e => { e.stopPropagation(); zetLaag({ vast: !l.vast }) }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--pg-inkt)', opacity: l.vast ? 0.85 : 0.25, width: 22, height: 20, padding: 0, borderRadius: 5 }}>{ik(l.vast ? SLOT : SLOT_OPEN, 13)}</button>
                        <span onDoubleClick={() => { const n = prompt('Naam van de laag', l.naam); if (n) zetLaag({ naam: n }) }} style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--pg-inkt)' }}>{l.naam}</span>
                        <span style={{ fontSize: 10.5, color: '#a39d8c' }}>{objs.length}</span>
                        <button title="Omhoog" disabled={i === lagen.length - 1} onClick={e => { e.stopPropagation(); setDoc(d => { const ls = [...(d.lagen || [])];[ls[i], ls[i + 1]] = [ls[i + 1], ls[i]]; return { ...d, lagen: ls } }) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, opacity: 0.5 }}>▲</button>
                        <button title="Omlaag" disabled={i === 0} onClick={e => { e.stopPropagation(); setDoc(d => { const ls = [...(d.lagen || [])];[ls[i], ls[i - 1]] = [ls[i - 1], ls[i]]; return { ...d, lagen: ls } }) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, opacity: 0.5 }}>▼</button>
                        {lagen.length > 1 && <button title="Laag verwijderen (inhoud gaat naar de laag eronder)" onClick={e => { e.stopPropagation(); if (!confirm(`Laag "${l.naam}" verwijderen? De objecten gaan naar een andere laag.`)) return; const doel = lagen.find(x => x.id !== l.id)!.id; setDoc(d => ({ ...d, lagen: (d.lagen || []).filter(x => x.id !== l.id), objs: d.objs.map(o => o.laag === l.id ? { ...o, laag: doel } : o) })) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, opacity: 0.4 }}>×</button>}
                      </div>
                      {objs.map(o => (
                        <div key={o.id} onClick={() => { if (selecteerbaar(o)) setSel(metGroep([o.id])); centreerOp(o) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 6px 2px 28px', borderRadius: 6, cursor: 'pointer', background: sel.includes(o.id) ? 'rgba(43,108,176,0.1)' : 'transparent', fontSize: 11.5, color: 'var(--pg-inkt)', opacity: o.verborgen ? 0.4 : 1 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: kleurVan(o) === 'none' ? '#fff' : kleurVan(o), border: '1px solid rgba(0,0,0,0.1)' }} />
                          {o.nr && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', background: '#010341', borderRadius: 8, padding: '0 4px' }}>{o.nr}</span>}
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{naamVan(o)}{o.groep ? ' ⧉' : ''}</span>
                          <button onClick={e => { e.stopPropagation(); wijzig([o.id], q => ({ ...q, verborgen: !q.verborgen })) }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--pg-inkt)', opacity: o.verborgen ? 0.85 : 0.22, padding: 0, width: 18, height: 16, borderRadius: 4 }} title="Verbergen">{ik(o.verborgen ? OOG_UIT : OOG, 12)}</button>
                          <button onClick={e => { e.stopPropagation(); wijzig([o.id], q => ({ ...q, locked: !q.locked })); setSel(s => s.filter(i => i !== o.id)) }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--pg-inkt)', opacity: o.locked ? 0.85 : 0.22, padding: 0, width: 18, height: 16, borderRadius: 4 }} title="Vergrendelen">{ik(o.locked ? SLOT : SLOT_OPEN, 11)}</button>
                        </div>
                      ))}
                    </div>
                  })}
                  <button style={klein} onClick={() => { const n = prompt('Naam van de nieuwe laag', 'Nieuwe laag'); if (!n) return; const id = uid(); setDoc(d => ({ ...d, lagen: [...(d.lagen || STANDAARD_LAGEN), { id, naam: n, zichtbaar: true, vast: false }] })); setActieveLaag(id) }}>+ Nieuwe laag</button>
                  <div style={{ fontSize: 10.5, color: '#a39d8c', marginTop: 8, lineHeight: 1.5 }}>Klik op een laag om erin te tekenen. Dubbelklik om te hernoemen. Vergrendel de laag Locatie als je de zaal klaar hebt.</div>
                </>}
                {zijTab === 'locatie' && <>
                  <div style={{ ...sectie, marginTop: 2 }}>Buitenterrein: zoek het adres</div>
                  <form onSubmit={e => { e.preventDefault(); zoekOpAdres() }} style={{ display: 'flex', gap: 5 }}>
                    <input style={mini} placeholder="Straat en plaats, bijv. Tractieweg 41 Utrecht" value={adresQ} onChange={e => setAdresQ(e.target.value)} />
                    <button type="submit" style={{ ...klein, background: 'var(--pg-inkt)', color: 'var(--pg-papier)', border: '1px solid var(--pg-inkt)' }}>Zoek</button>
                  </form>
                  {adressen && adressen.map((a, i) => (
                    <div key={i} onClick={() => kiesAdres(a)} style={{ padding: '6px 8px', fontSize: 12, color: 'var(--pg-inkt)', cursor: 'pointer', borderBottom: '1px solid #f3eee2' }}>{a.naam} <span style={{ color: '#a39d8c', fontSize: 10.5 }}>{a.soort}</span></div>
                  ))}
                  {doc.kaart ? <>
                    <div style={{ fontSize: 12, color: 'var(--pg-inkt)', marginTop: 10, fontWeight: 600 }}>{doc.kaart.adres}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      {([['luchtfoto', 'Luchtfoto'], ['kaart', 'Kaart (BGT)']] as const).map(([k, l]) => (
                        <button key={k} style={{ ...klein, flex: 1, ...(doc.kaart!.type === k ? { background: 'var(--pg-inkt)', color: 'var(--pg-papier)', border: '1px solid var(--pg-inkt)' } : {}) }} onClick={() => setDoc(d => d.kaart ? { ...d, kaart: { ...d.kaart, type: k, zichtbaar: true } } : d)}>{l}</button>
                      ))}
                    </div>
                    <label style={{ fontSize: 11, color: '#777162', display: 'block', marginTop: 8 }}>Sterkte van de ondergrond
                      <input type="range" min={0.15} max={1} step={0.05} value={doc.kaart.opacity} onChange={e => setDoc(d => d.kaart ? { ...d, kaart: { ...d.kaart, opacity: parseFloat(e.target.value) } } : d, false)} onPointerUp={() => setOpgeslagen('nee')} style={{ width: '100%' }} /></label>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <label style={{ fontSize: 11, color: '#777162', display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={doc.kaart.zichtbaar} onChange={e => setDoc(d => d.kaart ? { ...d, kaart: { ...d.kaart, zichtbaar: e.target.checked } } : d)} /> Tonen</label>
                      <button style={{ ...klein, border: 'none', color: '#999' }} onClick={() => { if (confirm('Kaartondergrond verwijderen? Je tekening blijft staan.')) setDoc(d => ({ ...d, kaart: null })) }}>Verwijder kaart</button>
                    </div>
                    <div style={{ fontSize: 10.5, color: '#a39d8c', marginTop: 6, lineHeight: 1.5 }}>Officiële kaart van de overheid (PDOK). Staat vanzelf op schaal en het noorden is boven. De BGT is de kaart waar de gemeente zelf mee werkt.</div>
                  </> : <div style={{ fontSize: 11.5, color: '#8b8574', marginTop: 6, lineHeight: 1.5 }}>Je krijgt de luchtfoto of de officiële kaart van het terrein eronder, direct op schaal. Kalibreren hoeft niet.</div>}

                  <div style={sectie}>Binnenlocatie: upload plattegrond locatie</div>
                  {doc.bg ? <>
                    <label style={{ fontSize: 11, color: '#777162' }}>Doorzichtigheid
                      <input type="range" min={0.05} max={1} step={0.05} value={doc.bg.opacity} onChange={e => setDoc(d => d.bg ? { ...d, bg: { ...d.bg, opacity: parseFloat(e.target.value) } } : d, false)} onPointerUp={() => setOpgeslagen('nee')} style={{ width: '100%' }} /></label>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button style={{ ...klein, ...(doc.bg.opSchaal ? {} : { background: '#fff4e0', border: '1px solid #e8c98a', color: '#9a5b00' }) }} onClick={() => setTool('calibrate')}>{doc.bg.opSchaal ? 'Opnieuw op schaal zetten' : 'Op schaal zetten'}</button>
                      <button style={klein} onClick={() => setDoc(d => d.bg ? { ...d, bg: { ...d.bg, locked: !d.bg.locked } } : d)}>{doc.bg.locked ? 'Ontgrendel' : 'Vergrendel'}</button>
                      <label style={{ ...klein, cursor: 'pointer' }}>Vervang<input type="file" accept="image/*,application/pdf,.pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) kiesLocatie(f) }} /></label>
                      <button style={{ ...klein, color: '#999' }} onClick={() => setDoc(d => ({ ...d, bg: null }))}>Weg</button>
                    </div>
                    <div style={{ fontSize: 11, color: '#8b8574', marginTop: 5 }}>{fmt(doc.bg.w)} × {fmt(doc.bg.h)}{doc.bg.opSchaal ? ', op schaal' : ', nog niet op schaal'}</div>
                    {!doc.kaart && <label style={{ fontSize: 11, color: '#777162', display: 'block', marginTop: 8 }}>Waar is het noorden op deze plattegrond?
                      <select style={mini} value={meta.noordHoek ?? ''} onChange={e => setDoc(d => ({ ...d, meta: { ...(d.meta || {}), noordHoek: e.target.value === '' ? null : parseFloat(e.target.value) } }))}>
                        <option value="">Nog niet aangegeven</option>
                        {[[0, 'Boven'], [45, 'Rechtsboven'], [90, 'Rechts'], [135, 'Rechtsonder'], [180, 'Onder'], [225, 'Linksonder'], [270, 'Links'], [315, 'Linksboven']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select></label>}
                  </> : <>
                    <div style={{ fontSize: 11.5, color: '#8b8574', marginBottom: 6, lineHeight: 1.5 }}>PDF, PNG of JPG van de zaal of hal. Hij komt onder je tekening te liggen. Daarna zet je hem op schaal met één maat die je kent.</div>
                    <label style={{ ...klein, display: 'inline-block', cursor: 'pointer' }}>{uploadBezig ? 'Bezig…' : 'Bestand kiezen'}
                      <input type="file" accept="image/*,application/pdf,.pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) kiesLocatie(f) }} /></label>
                  </>}
                </>}
                {zijTab === 'check' && <>
                  <div style={{ fontSize: 12, color: '#8b8574', marginBottom: 8, lineHeight: 1.5 }}>Dit vragen gemeente, brandweer en GHOR doorgaans bij een vergunningaanvraag. Klik op een regel om te zien waar het om gaat.</div>
                  {[...checks].sort((a, b) => ['actie', 'tip', 'ok'].indexOf(a.status) - ['actie', 'tip', 'ok'].indexOf(b.status)).map(c => {
                    const kl = c.status === 'actie' ? '#c53030' : c.status === 'tip' ? '#b7791f' : '#2e6b3a'
                    return (
                      <div key={c.id} onClick={() => { if (c.ids?.length) zoomNaar(c.ids); else if (c.naar === 'gegevens') setMetaDlg({ ...meta, evenement: meta.evenement || naam }); else if (c.naar === 'locatie') setZijTab('locatie'); else if (c.naar === 'materialen') { setZijTab('materialen'); setMatZoek('') } }}
                        className="pg-tegel" style={{ display: 'flex', gap: 9, padding: '9px 10px', borderRadius: 10, cursor: 'pointer', marginBottom: 5, background: c.status === 'actie' ? '#fdf1f0' : c.status === 'tip' ? '#fff9ec' : 'transparent', border: '1px solid ' + (c.status === 'ok' ? '#e6efe2' : c.status === 'actie' ? '#f6d5d1' : '#f3e3bd') }}>
                        <span style={{ width: 18, height: 18, borderRadius: 9, flexShrink: 0, background: kl, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{c.status === 'actie' ? '!' : c.status === 'tip' ? 'i' : '✓'}</span>
                        <span><span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--pg-inkt)', display: 'block' }}>{c.titel}</span><span style={{ fontSize: 11.5, color: '#777162', lineHeight: 1.45, display: 'block' }}>{c.uitleg}</span></span>
                      </div>
                    )
                  })}
                  <button style={{ ...klein, border: 'none', color: '#a39d8c', paddingLeft: 0 }} onClick={() => setToonNormen(v => !v)}>{toonNormen ? 'Verberg normen' : 'Normen aanpassen (per gemeente verschillend)'}</button>
                  {toonNormen && <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px', gap: 5, alignItems: 'center', fontSize: 11.5, color: '#777162', marginTop: 4 }}>
                    {([['calBreedte', 'Calamiteitenroute, breedte in m'], ['uitgangPm', 'Personen per meter uitgang'], ['uitgangMin', 'Nooduitgang minimaal, m'], ['toiletPer', 'Bezoekers per toilet'], ['ehboPer', 'Bezoekers per hulpverlener'], ['blusAfstand', 'Blusser binnen, m'], ['dichtheid', 'Personen per m² publieksruimte'], ['barPer', 'Bezoekers per meter bar']] as const).map(([k, l]) => (
                      <label key={k} style={{ display: 'contents' }}><span>{l}</span><input style={mini} type="number" step={k === 'uitgangMin' || k === 'calBreedte' || k === 'dichtheid' ? 0.05 : 1} value={normen[k]} onChange={e => { const v = parseFloat(e.target.value); if (v > 0) setDoc(d => ({ ...d, normen: { ...(d.normen || {}), [k]: v } })) }} /></label>
                    ))}
                    <span style={{ gridColumn: '1 / -1', fontSize: 10.5, color: '#a39d8c', lineHeight: 1.5 }}>Er is geen landelijke norm. Dit zijn de gangbare vuistregels; sommige gemeentes vragen bijvoorbeeld 4,5 m voor de calamiteitenroute. De gemeente heeft het laatste woord.</span>
                  </div>}
                  <div style={sectie}>Materiaallijst</div>
                  {!telling.length && !pakketTelling.length && <div style={{ fontSize: 12, color: '#a39d8c' }}>Nog niets geteld.</div>}
                  {CATEGORIEEN.map(cat => {
                    const items = telling.filter(t => t.mat.cat === cat); if (!items.length) return null
                    return <div key={cat}>
                      <div style={sectie}>{cat}</div>
                      {items.map(t => (
                        <div key={t.mat.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 12.5, color: 'var(--pg-inkt)', borderBottom: '1px solid #f3eee2' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: symboolSvg(t.mat) }} />
                          <span style={{ flex: 1 }}>{t.mat.label}</span>
                          {t.stuks > 0 && <span style={{ fontWeight: 700 }}>{t.stuks}×</span>}
                          {t.meter > 0 && <span style={{ fontSize: 11, color: '#8b8574', width: 48, textAlign: 'right' }}>{Math.round(t.meter)} m</span>}
                        </div>
                      ))}
                    </div>
                  })}
                  {pakketTelling.length > 0 && <><div style={sectie}>{adapter.deelnemerLabel}</div>{pakketTelling.map(p => <div key={p.maat.pakket} style={{ display: 'flex', gap: 6, padding: '3px 0', fontSize: 12.5, color: 'var(--pg-inkt)', borderBottom: '1px solid #f3eee2' }}><span style={{ width: 10, height: 10, borderRadius: 2, background: p.maat.kleur, marginTop: 3 }} /><span style={{ flex: 1 }}>{p.maat.label}</span><b>{p.n}×</b></div>)}</>}
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


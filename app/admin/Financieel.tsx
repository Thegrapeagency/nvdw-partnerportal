'use client'
// Financieel: het dagelijkse overzicht in plaats van spreadsheet-geschakel.
// Omzetkant komt live binnen (ticketing, kassa, standgelden), de kostenkant
// en extra begrotingsposten beheer je hier handmatig. Pragmatisch: begroot
// versus gerealiseerd en een simpele marge-indicatie, geen boekhoudpakket.
import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase, posRpc } from '@/lib/supabase'
import type { SettlementRow } from '@/lib/supabase'
import { AS, euro } from './ui'

type BudgetType = 'kosten' | 'omzet'
type BudgetPost = {
  id: string
  type: BudgetType
  categorie: string
  naam: string
  begroot_cents: number
  gerealiseerd_cents: number
  notitie: string | null
  volgorde: number
}
type PostDraft = { categorie: string; naam: string; begroot: string; gerealiseerd: string }
type TicketRegel = { naam: string; aantal: number; omzet_cents: number }
type ImportRij = {
  geldig: boolean
  fout?: string
  type: BudgetType
  categorie: string
  naam: string
  begroot_cents: number
  gerealiseerd_cents: number
}

const CATEGORIE_SUGGESTIES = ['locatie', 'personeel', 'techniek', 'marketing', 'inkoop wijn', 'vergunningen', 'overig']
const GROEN = '#2e7d32'

// Afgeronde euro's voor de grote cijfers bovenin.
const euroRond = (cents: number) => '€' + Math.round(cents / 100).toLocaleString('nl-NL')

// "1.250,50", "1250.50", "1250" en "€ 1250,5" worden allemaal begrepen.
const parseEuro = (s: string): number | null => {
  const t = s.replace(/[€\s]/g, '')
  if (!t) return 0
  let n = t
  const komma = t.includes(','), punt = t.includes('.')
  if (komma && punt) n = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (komma) n = t.replace(',', '.')
  const v = parseFloat(n)
  if (isNaN(v)) return null
  return Math.round(v * 100)
}

const naarInvoer = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')

// Supabase geeft maximaal 1000 rijen per keer terug; haal alles op in pagina's.
async function alleRijen<T>(maak: (van: number, tot: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const uit: T[] = []
  for (let van = 0; ; van += 1000) {
    const { data, error } = await maak(van, van + 999)
    if (error) throw new Error(error.message)
    const rijen = data || []
    uit.push(...rijen)
    if (rijen.length < 1000) return uit
  }
}

function parseCsv(tekst: string): ImportRij[] {
  const regels = tekst.split(/\r?\n/).map(r => r.trim()).filter(Boolean)
  if (regels.length === 0) return []
  const delim = regels[0].includes(';') ? ';' : regels[0].includes('\t') ? '\t' : ','
  const uit: ImportRij[] = []
  for (const regel of regels) {
    const kol = regel.split(delim).map(k => k.trim().replace(/^"|"$/g, ''))
    const eerste = (kol[0] || '').toLowerCase()
    if (eerste === 'type' || eerste === 'soort') continue // kopregel
    const type: BudgetType | null =
      ['kosten', 'kost', 'uitgave', 'uitgaven'].includes(eerste) ? 'kosten'
      : ['omzet', 'inkomsten', 'opbrengst', 'opbrengsten'].includes(eerste) ? 'omzet'
      : null
    const naam = (kol[2] || '').trim()
    const begroot = parseEuro(kol[3] || '0')
    const gerealiseerd = parseEuro(kol[4] || '0')
    const basis = {
      type: type || 'kosten' as BudgetType,
      categorie: (kol[1] || 'overig').toLowerCase() || 'overig',
      naam: naam || regel,
      begroot_cents: begroot ?? 0,
      gerealiseerd_cents: gerealiseerd ?? 0,
    }
    if (!type) uit.push({ ...basis, geldig: false, fout: 'Type onbekend. Gebruik kosten of omzet.' })
    else if (!naam) uit.push({ ...basis, geldig: false, fout: 'Geen naam gevonden in kolom 3.' })
    else if (begroot === null || gerealiseerd === null) uit.push({ ...basis, geldig: false, fout: 'Bedrag niet leesbaar.' })
    else uit.push({ ...basis, geldig: true })
  }
  return uit
}

const leegNieuw = { categorie: '', naam: '', begroot: '', gerealiseerd: '' }

export default function Financieel({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [geladen, setGeladen] = useState(false)
  // Live omzetbronnen
  const [ticketTotaal, setTicketTotaal] = useState(0)
  const [ticketRegels, setTicketRegels] = useState<TicketRegel[]>([])
  const [ticketFout, setTicketFout] = useState<string | null>(null)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [posBruto, setPosBruto] = useState(0)
  const [posNvdw, setPosNvdw] = useState(0)
  const [posStatus, setPosStatus] = useState<'laden' | 'ok' | 'fout'>('laden')
  const [standgelden, setStandgelden] = useState(0)
  const [standAantal, setStandAantal] = useState(0)
  const [standFout, setStandFout] = useState<string | null>(null)
  // Begroting
  const [posten, setPosten] = useState<BudgetPost[]>([])
  const [drafts, setDrafts] = useState<Record<string, PostDraft>>({})
  const [nieuw, setNieuw] = useState<Record<BudgetType, typeof leegNieuw>>({ kosten: { ...leegNieuw }, omzet: { ...leegNieuw } })
  // CSV-import
  const [importOpen, setImportOpen] = useState(false)
  const [importTekst, setImportTekst] = useState('')
  const [importBusy, setImportBusy] = useState(false)

  const zetPosten = (rijen: BudgetPost[]) => {
    setPosten(rijen)
    const d: Record<string, PostDraft> = {}
    for (const p of rijen) d[p.id] = { categorie: p.categorie, naam: p.naam, begroot: naarInvoer(p.begroot_cents), gerealiseerd: naarInvoer(p.gerealiseerd_cents) }
    setDrafts(d)
  }

  const laadPosten = async () => {
    const { data, error } = await supabase.from('budget_posten').select('*').order('type').order('categorie').order('volgorde')
    if (error) { flash('Begroting laden mislukt: ' + error.message, 7000); return }
    zetPosten((data || []) as BudgetPost[])
  }

  const laadTicketing = async () => {
    try {
      const [orders, items, types] = await Promise.all([
        alleRijen<{ id: string; total_cents: number; paid_at: string | null }>((v, t) =>
          supabase.from('orders').select('id, total_cents, paid_at').eq('status', 'paid').range(v, t)),
        alleRijen<{ order_id: string; ticket_type_id: string; quantity: number; unit_price_cents: number }>((v, t) =>
          supabase.from('order_items').select('order_id, ticket_type_id, quantity, unit_price_cents').range(v, t)),
        alleRijen<{ id: string; name_nl: string; category: string }>((v, t) =>
          supabase.from('ticket_types').select('id, name_nl, category').range(v, t)),
      ])
      const betaald = new Set(orders.map(o => o.id))
      const naam = new Map(types.map(t => [t.id, t.name_nl]))
      const perType = new Map<string, TicketRegel>()
      for (const it of items) {
        if (!betaald.has(it.order_id)) continue
        const r = perType.get(it.ticket_type_id) || { naam: naam.get(it.ticket_type_id) || it.ticket_type_id, aantal: 0, omzet_cents: 0 }
        r.aantal += it.quantity
        r.omzet_cents += it.quantity * it.unit_price_cents
        perType.set(it.ticket_type_id, r)
      }
      setTicketTotaal(orders.reduce((s, o) => s + o.total_cents, 0))
      setTicketRegels([...perType.values()].sort((a, b) => b.omzet_cents - a.omzet_cents))
      setTicketFout(null)
    } catch (e) {
      setTicketFout(e instanceof Error ? e.message : 'Ticketdata niet bereikbaar.')
    }
  }

  const laadPos = async () => {
    try {
      const j = await posRpc<{ ok: boolean; partners: SettlementRow[] }>('partner_settlement')
      if (!j?.ok) throw new Error('Kassa gaf geen geldig antwoord.')
      const rijen = j.partners || []
      setPosBruto(rijen.reduce((s, r) => s + (r.omzet_cents - r.refunded_cents), 0))
      setPosNvdw(Math.round(rijen.reduce((s, r) => s + (r.omzet_cents - r.refunded_cents) * r.afdracht_percentage / 100, 0)))
      setPosStatus('ok')
    } catch {
      setPosStatus('fout')
    }
  }

  const laadStandgelden = async () => {
    const { data, error } = await supabase.from('partners').select('bedrijfsnaam, type, standplaats_vergoeding')
    if (error) { setStandFout(error.message); return }
    const food = ((data || []) as { type: string; standplaats_vergoeding: number | null }[])
      .filter(p => p.type === 'food' && p.standplaats_vergoeding != null && p.standplaats_vergoeding > 0)
    setStandgelden(Math.round(food.reduce((s, p) => s + (p.standplaats_vergoeding || 0), 0) * 100))
    setStandAantal(food.length)
    setStandFout(null)
  }

  useEffect(() => {
    Promise.all([laadTicketing(), laadPos(), laadStandgelden(), laadPosten()]).finally(() => setGeladen(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- totalen ----------
  const kostenPosten = useMemo(() => posten.filter(p => p.type === 'kosten'), [posten])
  const omzetPosten = useMemo(() => posten.filter(p => p.type === 'omzet'), [posten])

  const totalen = useMemo(() => {
    const som = (l: BudgetPost[], v: 'begroot_cents' | 'gerealiseerd_cents') => l.reduce((s, p) => s + Number(p[v]), 0)
    const posDeel = posStatus === 'ok' ? posNvdw : 0
    const omzetGerealiseerd = ticketTotaal + posDeel + standgelden + som(omzetPosten, 'gerealiseerd_cents')
    const kostenGerealiseerd = som(kostenPosten, 'gerealiseerd_cents')
    const omzetBegroot = som(omzetPosten, 'begroot_cents')
    const kostenBegroot = som(kostenPosten, 'begroot_cents')
    return {
      omzetGerealiseerd, kostenGerealiseerd, marge: omzetGerealiseerd - kostenGerealiseerd,
      omzetBegroot, kostenBegroot, margeBegroot: omzetBegroot - kostenBegroot,
    }
  }, [ticketTotaal, posNvdw, posStatus, standgelden, omzetPosten, kostenPosten])

  const categorieOpties = useMemo(() => {
    const set = new Set(CATEGORIE_SUGGESTIES)
    for (const p of posten) if (p.categorie) set.add(p.categorie)
    return [...set]
  }, [posten])

  const importPreview = useMemo(() => importOpen && importTekst.trim() ? parseCsv(importTekst) : [], [importOpen, importTekst])

  // ---------- CRUD ----------
  const wijzigDraft = (id: string, veld: keyof PostDraft, waarde: string) =>
    setDrafts(d => ({ ...d, [id]: { ...d[id], [veld]: waarde } }))

  const bewaarPost = async (p: BudgetPost) => {
    const d = drafts[p.id]
    if (!d) return
    const begroot = parseEuro(d.begroot)
    const gerealiseerd = parseEuro(d.gerealiseerd)
    if (begroot === null || gerealiseerd === null) {
      flash('Dat bedrag kan ik niet lezen. Gebruik bijvoorbeeld 1250 of 1250,50.', 6000)
      setDrafts(x => ({ ...x, [p.id]: { ...x[p.id], begroot: naarInvoer(p.begroot_cents), gerealiseerd: naarInvoer(p.gerealiseerd_cents) } }))
      return
    }
    const upd = {
      categorie: d.categorie.trim().toLowerCase() || 'overig',
      naam: d.naam.trim() || p.naam,
      begroot_cents: begroot,
      gerealiseerd_cents: gerealiseerd,
    }
    if (upd.categorie === p.categorie && upd.naam === p.naam && begroot === p.begroot_cents && gerealiseerd === p.gerealiseerd_cents) return
    const { error } = await supabase.from('budget_posten').update(upd).eq('id', p.id)
    if (error) { flash('Opslaan mislukt: ' + error.message, 6000); return }
    setPosten(ps => ps.map(x => x.id === p.id ? { ...x, ...upd } : x))
    setDrafts(x => ({ ...x, [p.id]: { categorie: upd.categorie, naam: upd.naam, begroot: naarInvoer(begroot), gerealiseerd: naarInvoer(gerealiseerd) } }))
  }

  const voegToe = async (type: BudgetType) => {
    const n = nieuw[type]
    if (!n.naam.trim()) { flash('Geef de post een naam.', 5000); return }
    const begroot = parseEuro(n.begroot)
    const gerealiseerd = parseEuro(n.gerealiseerd)
    if (begroot === null || gerealiseerd === null) { flash('Dat bedrag kan ik niet lezen. Gebruik bijvoorbeeld 1250 of 1250,50.', 6000); return }
    const { error } = await supabase.from('budget_posten').insert({
      type, categorie: n.categorie.trim().toLowerCase() || 'overig', naam: n.naam.trim(),
      begroot_cents: begroot, gerealiseerd_cents: gerealiseerd,
      volgorde: Math.max(0, ...posten.map(p => p.volgorde)) + 1,
    })
    if (error) { flash('Toevoegen mislukt: ' + error.message, 6000); return }
    setNieuw(x => ({ ...x, [type]: { ...leegNieuw } }))
    flash('Post toegevoegd')
    await laadPosten()
  }

  const verwijder = async (p: BudgetPost) => {
    if (!confirm(`"${p.naam}" verwijderen?`)) return
    const { error } = await supabase.from('budget_posten').delete().eq('id', p.id)
    if (error) { flash('Verwijderen mislukt: ' + error.message, 6000); return }
    flash('Verwijderd')
    await laadPosten()
  }

  const importeer = async () => {
    const geldig = importPreview.filter(r => r.geldig)
    if (geldig.length === 0) { flash('Geen geldige regels om te importeren.', 5000); return }
    setImportBusy(true)
    const basis = Math.max(0, ...posten.map(p => p.volgorde)) + 1
    const { error } = await supabase.from('budget_posten').insert(geldig.map((r, i) => ({
      type: r.type, categorie: r.categorie, naam: r.naam,
      begroot_cents: r.begroot_cents, gerealiseerd_cents: r.gerealiseerd_cents, volgorde: basis + i,
    })))
    setImportBusy(false)
    if (error) { flash('Import mislukt: ' + error.message, 7000); return }
    flash(`${geldig.length} ${geldig.length === 1 ? 'post' : 'posten'} geïmporteerd`)
    setImportTekst('')
    setImportOpen(false)
    await laadPosten()
  }

  // ---------- bouwstenen ----------
  const verschilLabel = (verschil: number) =>
    verschil === 0 ? 'gelijk aan begroting' : `${euro(Math.abs(verschil))} ${verschil > 0 ? 'boven' : 'onder'} begroting`

  const tegel = (label: string, cents: number, begroot: number, kleur?: string, noot?: string) => (
    <div style={AS.card}>
      <div style={AS.cardTitle}>{label}</div>
      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '32px', fontWeight: 700, color: kleur || 'var(--navy)', lineHeight: 1.1 }}>
        {euroRond(cents)}
      </div>
      <div style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
        Begroot {euroRond(begroot)} · {verschilLabel(cents - begroot)}
      </div>
      {noot && <div style={{ fontSize: '11px', color: 'var(--bordeaux)', marginTop: '4px' }}>{noot}</div>}
    </div>
  )

  const bronLabel = (tekst: string) => (
    <span style={{ display: 'inline-block', marginLeft: '8px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, borderRadius: '2px', background: '#eceff1', color: '#546e7a', verticalAlign: 'middle' }}>{tekst}</span>
  )

  const geldInput = (waarde: string, opChange: (v: string) => void, opBlur: () => void) => (
    <input style={{ ...AS.input, width: '110px', textAlign: 'right' }} inputMode="decimal" value={waarde}
      onChange={e => opChange(e.target.value)} onBlur={opBlur}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
  )

  const postTabel = (type: BudgetType, lijst: BudgetPost[]) => {
    const groepen = new Map<string, BudgetPost[]>()
    for (const p of lijst) {
      const k = p.categorie || 'overig'
      groepen.set(k, [...(groepen.get(k) || []), p])
    }
    const positiefGoed = type === 'omzet'
    const verschilKleur = (v: number) => v === 0 ? '#888' : (v > 0) === positiefGoed ? GROEN : 'var(--bordeaux)'
    const n = nieuw[type]
    return (
      <>
        {lijst.length === 0 && (
          <div style={{ color: '#888', fontSize: '13px', margin: '8px 0 4px' }}>
            {type === 'kosten' ? 'Nog geen kostenposten. Voeg hieronder de eerste toe of importeer uit je spreadsheet.' : 'Nog geen handmatige omzetposten.'}
          </div>
        )}
        <table style={AS.table}>
          {lijst.length > 0 && (
            <thead><tr>{['Naam', 'Begroot', 'Gerealiseerd', 'Verschil', ''].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
          )}
          <tbody>
            {[...groepen.entries()].map(([cat, rijen]) => {
              const subB = rijen.reduce((s, p) => s + Number(p.begroot_cents), 0)
              const subG = rijen.reduce((s, p) => s + Number(p.gerealiseerd_cents), 0)
              return (
                <Fragment key={cat}>
                  <tr>
                    <td colSpan={5} style={{ ...AS.td, paddingTop: '14px', fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--bordeaux)', borderBottom: 'none' }}>
                      {cat} <span style={{ color: '#999', fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>({euro(subG)} van {euro(subB)})</span>
                    </td>
                  </tr>
                  {rijen.map(p => {
                    const d = drafts[p.id] || { categorie: p.categorie, naam: p.naam, begroot: naarInvoer(p.begroot_cents), gerealiseerd: naarInvoer(p.gerealiseerd_cents) }
                    const verschil = Number(p.gerealiseerd_cents) - Number(p.begroot_cents)
                    return (
                      <tr key={p.id}>
                        <td style={{ ...AS.td, minWidth: '220px' }}>
                          <input style={AS.input} value={d.naam} onChange={e => wijzigDraft(p.id, 'naam', e.target.value)} onBlur={() => bewaarPost(p)} />
                          <input style={{ ...AS.input, marginTop: '4px', fontSize: '11px', color: '#888' }} list="fin-categorieen" value={d.categorie}
                            onChange={e => wijzigDraft(p.id, 'categorie', e.target.value)} onBlur={() => bewaarPost(p)} placeholder="categorie" />
                        </td>
                        <td style={AS.td}>{geldInput(d.begroot, v => wijzigDraft(p.id, 'begroot', v), () => bewaarPost(p))}</td>
                        <td style={AS.td}>{geldInput(d.gerealiseerd, v => wijzigDraft(p.id, 'gerealiseerd', v), () => bewaarPost(p))}</td>
                        <td style={{ ...AS.td, color: verschilKleur(verschil), fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {verschil === 0 ? '-' : (verschil > 0 ? '+' : '') + euro(verschil).replace('€-', '-€')}
                        </td>
                        <td style={AS.td}><button style={AS.btnSm} onClick={() => verwijder(p)}>Verwijder</button></td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
            <tr>
              <td style={{ ...AS.td, paddingTop: '14px' }}>
                <input style={AS.input} value={n.naam} placeholder={type === 'kosten' ? 'Nieuwe kostenpost' : 'Nieuwe omzetpost'}
                  onChange={e => setNieuw(x => ({ ...x, [type]: { ...x[type], naam: e.target.value } }))} />
                <input style={{ ...AS.input, marginTop: '4px', fontSize: '11px' }} list="fin-categorieen" value={n.categorie} placeholder="categorie"
                  onChange={e => setNieuw(x => ({ ...x, [type]: { ...x[type], categorie: e.target.value } }))} />
              </td>
              <td style={{ ...AS.td, paddingTop: '14px' }}>
                <input style={{ ...AS.input, width: '110px', textAlign: 'right' }} inputMode="decimal" value={n.begroot} placeholder="begroot"
                  onChange={e => setNieuw(x => ({ ...x, [type]: { ...x[type], begroot: e.target.value } }))} />
              </td>
              <td style={{ ...AS.td, paddingTop: '14px' }}>
                <input style={{ ...AS.input, width: '110px', textAlign: 'right' }} inputMode="decimal" value={n.gerealiseerd} placeholder="gerealiseerd"
                  onChange={e => setNieuw(x => ({ ...x, [type]: { ...x[type], gerealiseerd: e.target.value } }))} />
              </td>
              <td style={{ ...AS.td, paddingTop: '14px' }} colSpan={2}>
                <button style={{ ...AS.btnSm }} onClick={() => voegToe(type)}>+ Toevoegen</button>
              </td>
            </tr>
          </tbody>
        </table>
      </>
    )
  }

  if (!geladen) return <div style={{ padding: '20px', color: '#888' }}>Financiën laden...</div>

  const posNoot = posStatus === 'fout' ? 'Kassa niet bereikbaar, telt nu niet mee.' : undefined

  return (
    <>
      <div style={AS.title}>Financieel</div>
      <div style={AS.sub}>
        Begroot versus gerealiseerd op één plek. De omzetkant komt live binnen uit ticketing, kassa en partnerportal.
        Kosten en extra omzetposten voer je hieronder in.
      </div>

      <datalist id="fin-categorieen">
        {categorieOpties.map(c => <option key={c} value={c} />)}
      </datalist>

      {/* Grote cijfers */}
      <div style={AS.grid3}>
        {tegel('Omzet gerealiseerd', totalen.omzetGerealiseerd, totalen.omzetBegroot, undefined, posNoot)}
        {tegel('Kosten gerealiseerd', totalen.kostenGerealiseerd, totalen.kostenBegroot)}
        {tegel('Marge', totalen.marge, totalen.margeBegroot, totalen.marge > 0 ? GROEN : totalen.marge < 0 ? 'var(--bordeaux)' : undefined)}
      </div>

      {/* Omzet live */}
      <div style={AS.card}>
        <div style={AS.cardTitle}>Omzet live</div>
        <table style={AS.table}>
          <tbody>
            <tr>
              <td style={{ ...AS.td, fontWeight: 600 }}>
                Ticketomzet{bronLabel('live uit ticketing')}
                {ticketRegels.length > 0 && (
                  <button style={{ ...AS.btnSm, marginLeft: '10px', padding: '3px 8px' }} onClick={() => setTicketOpen(o => !o)}>
                    {ticketOpen ? 'Verberg tickettypes' : 'Per tickettype'}
                  </button>
                )}
              </td>
              <td style={{ ...AS.td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {ticketFout ? '-' : euro(ticketTotaal)}
              </td>
            </tr>
            {ticketFout && (
              <tr><td colSpan={2} style={{ ...AS.td, fontSize: '12px', color: 'var(--bordeaux)' }}>Ticketdata niet bereikbaar: {ticketFout}</td></tr>
            )}
            {ticketOpen && ticketRegels.map(r => (
              <tr key={r.naam}>
                <td style={{ ...AS.td, paddingLeft: '32px', fontSize: '12px', color: '#666' }}>{r.naam} ({r.aantal}x)</td>
                <td style={{ ...AS.td, textAlign: 'right', fontSize: '12px', color: '#666', whiteSpace: 'nowrap' }}>{euro(r.omzet_cents)}</td>
              </tr>
            ))}
            {ticketOpen && (
              <tr>
                <td style={{ ...AS.td, paddingLeft: '32px', fontSize: '11px', color: '#999' }}>
                  Het totaal hierboven is inclusief servicekosten en na kortingen, de regels per type niet. Klein verschil is dus normaal.
                </td>
                <td style={AS.td}></td>
              </tr>
            )}
            <tr>
              <td style={{ ...AS.td, fontWeight: 600 }}>POS bruto-omzet (alle bars){bronLabel('live uit kassa')}</td>
              <td style={{ ...AS.td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {posStatus === 'ok' ? euro(posBruto) : '-'}
              </td>
            </tr>
            <tr>
              <td style={{ ...AS.td, fontWeight: 600 }}>NvdW-deel POS (afdrachten){bronLabel('live uit kassa')}</td>
              <td style={{ ...AS.td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {posStatus === 'ok' ? euro(posNvdw) : '-'}
              </td>
            </tr>
            {posStatus === 'fout' && (
              <tr><td colSpan={2} style={{ ...AS.td, fontSize: '12px', color: 'var(--bordeaux)' }}>
                De kassa is even niet bereikbaar. <button style={{ ...AS.btnSm, marginLeft: '6px', padding: '3px 8px' }} onClick={() => { setPosStatus('laden'); laadPos() }}>Probeer opnieuw</button>
              </td></tr>
            )}
            <tr>
              <td style={{ ...AS.td, fontWeight: 600, borderBottom: 'none' }}>
                Standgelden partners{standAantal > 0 ? ` (${standAantal} food-partners)` : ''}{bronLabel('uit partnerportal')}
              </td>
              <td style={{ ...AS.td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: 'none' }}>
                {standFout ? '-' : euro(standgelden)}
              </td>
            </tr>
            {standFout && (
              <tr><td colSpan={2} style={{ ...AS.td, fontSize: '12px', color: 'var(--bordeaux)', borderBottom: 'none' }}>Partnerdata niet bereikbaar: {standFout}</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ fontSize: '11px', color: '#999', marginTop: '10px' }}>
          Alleen het NvdW-deel van de POS telt mee in de omzet bovenin. De bruto-omzet is ter info.
        </div>
      </div>

      {/* Begroting */}
      <div style={AS.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={AS.cardTitle}>Begroting</div>
          <button style={AS.btnSm} onClick={() => setImportOpen(o => !o)}>
            {importOpen ? 'Sluit import' : 'Importeer uit spreadsheet'}
          </button>
        </div>

        {importOpen && (
          <div style={{ background: '#f7f4ec', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
              Plak hier regels uit je spreadsheet. Kolommen: type (kosten of omzet), categorie, naam, begroot, gerealiseerd.
              Puntkomma, komma of tab als scheidingsteken werkt allemaal.
            </div>
            <textarea style={{ ...AS.input, height: '110px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
              value={importTekst} onChange={e => setImportTekst(e.target.value)}
              placeholder={'kosten;locatie;Huur Werkspoorkathedraal;25000;25000\nkosten;techniek;Licht en geluid;8000;0\nomzet;subsidie;Gemeente Utrecht;5000;0'} />
            {importPreview.length > 0 && (
              <>
                <table style={{ ...AS.table, marginTop: '12px' }}>
                  <thead><tr>{['Type', 'Categorie', 'Naam', 'Begroot', 'Gerealiseerd', ''].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {importPreview.map((r, i) => (
                      <tr key={i} style={{ opacity: r.geldig ? 1 : 0.7 }}>
                        <td style={AS.td}>{r.geldig ? r.type : '?'}</td>
                        <td style={AS.td}>{r.categorie}</td>
                        <td style={AS.td}>{r.naam}</td>
                        <td style={AS.td}>{r.geldig ? euro(r.begroot_cents) : '-'}</td>
                        <td style={AS.td}>{r.geldig ? euro(r.gerealiseerd_cents) : '-'}</td>
                        <td style={{ ...AS.td, fontSize: '11px', color: r.geldig ? GROEN : 'var(--bordeaux)' }}>{r.geldig ? 'ok' : r.fout}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button style={{ ...AS.btn, opacity: importBusy ? 0.6 : 1 }} onClick={importeer} disabled={importBusy}>
                  {importBusy ? 'Bezig met importeren...' : `Voeg ${importPreview.filter(r => r.geldig).length} posten toe`}
                </button>
              </>
            )}
          </div>
        )}

        <div style={{ ...AS.label, marginTop: 0 }}>Kosten</div>
        {postTabel('kosten', kostenPosten)}

        <div style={{ ...AS.label, marginTop: '28px' }}>Handmatige omzetposten</div>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
          Voor omzet die niet live binnenkomt, zoals subsidies of sponsoring. Wil je een begrote ticketomzet meenemen?
          Zet die hier als post met alleen een begroot bedrag. Het gerealiseerde deel telt al live mee.
        </div>
        {postTabel('omzet', omzetPosten)}

        <div style={{ fontSize: '11px', color: '#999', marginTop: '16px' }}>
          Bedragen worden opgeslagen zodra je uit het veld klikt. Komma of punt als decimaalteken maakt niet uit.
        </div>
      </div>
    </>
  )
}

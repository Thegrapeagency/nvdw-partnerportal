'use client'
// CrewRooster: vrijwilligers en crew inplannen per festivaldag.
// Drie secties: Rooster (shifts per dag), Crewleden en Rollen.
// Elk crewlid heeft een eigen roosterlink (publiek token) voor op de telefoon.
// De database bewaakt dubbel inroosteren via een trigger (DUBBEL_INGEROOSTERD).
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS, PROGRAMMA_DAGEN, tijdUit } from './ui'

type Dag = 'fri' | 'sat' | 'sun'
type Rol = { id: number; naam: string; kleur: string }
type Lid = {
  id: string; naam: string; telefoon: string | null; email: string | null
  rol_ids: number[]; notitie: string | null; publiek_token: string; actief: boolean
}
type Shift = {
  id: string; dag: Dag; rol_id: number; start_tijd: string; eind_tijd: string
  aantal_nodig: number; locatie: string | null; contactpersoon: string | null; opmerking: string | null
}
type Toewijzing = { id: string; shift_id: string; lid_id: string }
type Gat = { shift_id: string; dag: Dag; tekort: number }

const DAG_NAAM: Record<Dag, string> = { fri: 'vrijdag', sat: 'zaterdag', sun: 'zondag' }
const DAG_VOL: Record<Dag, string> = { fri: 'Vrijdag 6 november', sat: 'Zaterdag 7 november', sun: 'Zondag 8 november' }
const DATUM: Record<Dag, string> = { fri: '2026-11-06', sat: '2026-11-07', sun: '2026-11-08' }
// Voor shifts die over middernacht heen gaan: de eindtijd valt dan op de dag erna.
const DATUM_NA: Record<Dag, string> = { fri: '2026-11-07', sat: '2026-11-08', sun: '2026-11-09' }

type Sectie = 'rooster' | 'leden' | 'rollen'
const SECTIES: { id: Sectie; label: string }[] = [
  { id: 'rooster', label: 'Rooster' },
  { id: 'leden', label: 'Crewleden' },
  { id: 'rollen', label: 'Rollen' },
]

type ShiftDraft = {
  dag: Dag; rol_id: string; start: string; eind: string; aantal: string
  locatie: string; contactpersoon: string; opmerking: string; alleDagen: boolean
}
const leegShift: ShiftDraft = {
  dag: 'fri', rol_id: '', start: '', eind: '', aantal: '1',
  locatie: '', contactpersoon: '', opmerking: '', alleDagen: false,
}

type LidDraft = { naam: string; telefoon: string; email: string; rol_ids: number[]; notitie: string }
const leegLid: LidDraft = { naam: '', telefoon: '', email: '', rol_ids: [], notitie: '' }

export default function CrewRooster({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [rollen, setRollen] = useState<Rol[]>([])
  const [leden, setLeden] = useState<Lid[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [toewijzingen, setToewijzingen] = useState<Toewijzing[]>([])
  const [gaten, setGaten] = useState<Gat[]>([])
  const [geladen, setGeladen] = useState(false)
  const [busy, setBusy] = useState(false)

  const [sectie, setSectie] = useState<Sectie>('rooster')
  const [dag, setDag] = useState<Dag>('fri')
  const [weergave, setWeergave] = useState<'lijst' | 'blokken'>('lijst')

  const [shiftFormOpen, setShiftFormOpen] = useState(false)
  const [shiftDraft, setShiftDraft] = useState<ShiftDraft>(leegShift)
  // Welke shift op dit moment open staat om te wijzigen. De velden staan dan
  // in `bewerkDraft`, los van het formulier voor een nieuwe shift.
  const [bewerkId, setBewerkId] = useState<string | null>(null)
  const [bewerkDraft, setBewerkDraft] = useState<ShiftDraft>(leegShift)

  const [lidFormOpen, setLidFormOpen] = useState<string | 'nieuw' | null>(null)
  const [lidDraft, setLidDraft] = useState<LidDraft>(leegLid)

  const [rolDraft, setRolDraft] = useState({ naam: '', kleur: '#9b3737' })

  const laad = async () => {
    const [ro, le, sh, tw, ga] = await Promise.all([
      supabase.from('crew_rollen').select('*').order('naam'),
      supabase.from('crew_leden').select('*').order('naam'),
      supabase.from('crew_shifts').select('*').order('start_tijd'),
      supabase.from('crew_toewijzingen').select('id, shift_id, lid_id'),
      supabase.from('crew_gaten').select('shift_id, dag, tekort'),
    ])
    setRollen((ro.data || []) as Rol[])
    setLeden((le.data || []) as Lid[])
    setShifts((sh.data || []) as Shift[])
    setToewijzingen((tw.data || []) as Toewijzing[])
    setGaten((ga.data || []) as Gat[])
    setGeladen(true)
  }
  useEffect(() => { laad() }, [])

  const rolVan = (id: number) => rollen.find(r => r.id === id)
  const lidVan = (id: string) => leden.find(l => l.id === id)
  const bezetting = (shiftId: string) => toewijzingen.filter(t => t.shift_id === shiftId)

  // ---------- Rooster ----------

  const totaalTekort = gaten.reduce((som, g) => som + g.tekort, 0)
  const tekortPerDag = useMemo(() => {
    const per: Record<Dag, number> = { fri: 0, sat: 0, sun: 0 }
    for (const g of gaten) per[g.dag] += g.tekort
    return per
  }, [gaten])

  const dagShifts = useMemo(() => shifts.filter(s => s.dag === dag), [shifts, dag])
  const tijdGroepen = useMemo(() => {
    const groepen: { tijd: string; shifts: Shift[] }[] = []
    for (const s of dagShifts) {
      const tijd = tijdUit(s.start_tijd)
      const bestaand = groepen.find(g => g.tijd === tijd)
      if (bestaand) bestaand.shifts.push(s)
      else groepen.push({ tijd, shifts: [s] })
    }
    for (const g of groepen) g.shifts.sort((a, b) => (rolVan(a.rol_id)?.naam || '').localeCompare(rolVan(b.rol_id)?.naam || ''))
    return groepen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dagShifts, rollen])

  const maakShift = async () => {
    if (!shiftDraft.rol_id) { flash('Kies eerst een rol.', 5000); return }
    if (!shiftDraft.start || !shiftDraft.eind) { flash('Vul een start- en eindtijd in.', 5000); return }
    const aantal = parseInt(shiftDraft.aantal)
    if (isNaN(aantal) || aantal < 1) { flash('Aantal nodig moet minstens 1 zijn.', 5000); return }
    const dagen: Dag[] = shiftDraft.alleDagen ? ['fri', 'sat', 'sun'] : [shiftDraft.dag]
    // Eindtijd voor of gelijk aan starttijd betekent: de shift loopt door tot na middernacht.
    const naMiddernacht = shiftDraft.eind <= shiftDraft.start
    const rijen = dagen.map(d => ({
      dag: d,
      rol_id: parseInt(shiftDraft.rol_id),
      start_tijd: `${DATUM[d]}T${shiftDraft.start}:00+01:00`,
      eind_tijd: `${naMiddernacht ? DATUM_NA[d] : DATUM[d]}T${shiftDraft.eind}:00+01:00`,
      aantal_nodig: aantal,
      locatie: shiftDraft.locatie.trim() || null,
      contactpersoon: shiftDraft.contactpersoon.trim() || null,
      opmerking: shiftDraft.opmerking.trim() || null,
    }))
    setBusy(true)
    const { error } = await supabase.from('crew_shifts').insert(rijen)
    setBusy(false)
    if (error) { flash('Aanmaken mislukte: ' + error.message, 7000); return }
    flash(shiftDraft.alleDagen ? 'Shift aangemaakt voor vrijdag, zaterdag en zondag.' : `Shift aangemaakt voor ${DAG_NAAM[shiftDraft.dag]}.`)
    setShiftDraft(leegShift)
    setShiftFormOpen(false)
    await laad()
  }

  // Een bestaande shift openen om te wijzigen. alleDagen hoort alleen bij
  // aanmaken, dus die staat hier altijd uit.
  const openBewerk = (s: Shift) => {
    setBewerkId(s.id)
    setBewerkDraft({
      dag: s.dag, rol_id: String(s.rol_id),
      start: tijdUit(s.start_tijd), eind: tijdUit(s.eind_tijd),
      aantal: String(s.aantal_nodig),
      locatie: s.locatie || '', contactpersoon: s.contactpersoon || '',
      opmerking: s.opmerking || '', alleDagen: false,
    })
  }
  const sluitBewerk = () => { setBewerkId(null); setBewerkDraft(leegShift) }

  const bewaarShift = async (s: Shift) => {
    const d = bewerkDraft
    if (!d.rol_id) { flash('Kies eerst een rol.', 5000); return }
    if (!d.start || !d.eind) { flash('Vul een start- en eindtijd in.', 5000); return }
    const aantal = parseInt(d.aantal)
    if (isNaN(aantal) || aantal < 1) { flash('Aantal nodig moet minstens 1 zijn.', 5000); return }
    // Minder plekken dan er mensen op staan zou het rooster stil laten kloppen
    // terwijl er iemand te veel ingedeeld is.
    const bezet = bezetting(s.id).length
    if (aantal < bezet && !confirm(`Er staan ${bezet} crewleden op deze shift en je zet het aantal op ${aantal}. De namen blijven staan, de shift is dan overbezet. Doorgaan?`)) return
    const naMiddernacht = d.eind <= d.start
    setBusy(true)
    const { error } = await supabase.from('crew_shifts').update({
      dag: d.dag,
      rol_id: parseInt(d.rol_id),
      start_tijd: `${DATUM[d.dag]}T${d.start}:00+01:00`,
      eind_tijd: `${naMiddernacht ? DATUM_NA[d.dag] : DATUM[d.dag]}T${d.eind}:00+01:00`,
      aantal_nodig: aantal,
      locatie: d.locatie.trim() || null,
      contactpersoon: d.contactpersoon.trim() || null,
      opmerking: d.opmerking.trim() || null,
    }).eq('id', s.id)
    setBusy(false)
    if (error) {
      // De overlap-trigger slaat toe als iemand na de wijziging dubbel staat.
      flash(error.message.includes('DUBBEL_INGEROOSTERD')
        ? 'Dat kan niet: met deze tijden staat er iemand dubbel ingeroosterd. Haal die persoon eerst van een van de twee shifts.'
        : 'Opslaan mislukte: ' + error.message, 9000)
      return
    }
    // Bij een andere dag verdwijnt de shift uit dit dagoverzicht, dus zeg waar
    // hij nu staat in plaats van hem stil te laten verdwijnen.
    flash(d.dag !== s.dag
      ? `Shift ${rolVan(parseInt(d.rol_id))?.naam || ''} staat nu op ${DAG_NAAM[d.dag]}.`
      : `Shift ${rolVan(parseInt(d.rol_id))?.naam || ''} bijgewerkt.`)
    sluitBewerk()
    await laad()
  }

  const verwijderShift = async (s: Shift) => {
    const rolNaam = rolVan(s.rol_id)?.naam || 'shift'
    const namen = bezetting(s.id).length
    if (!confirm(`Shift ${rolNaam} (${tijdUit(s.start_tijd)} tot ${tijdUit(s.eind_tijd)}) verwijderen?${namen > 0 ? `\n\nEr staan ${namen} crewleden op. Die worden er ook afgehaald.` : ''}`)) return
    const { error } = await supabase.from('crew_shifts').delete().eq('id', s.id)
    if (error) { flash('Verwijderen mislukte: ' + error.message, 7000); return }
    flash('Shift verwijderd.')
    await laad()
  }

  const roosterIn = async (shiftId: string, lidId: string) => {
    if (!lidId) return
    const lid = lidVan(lidId)
    const { error } = await supabase.from('crew_toewijzingen').insert({ shift_id: shiftId, lid_id: lidId })
    if (error) {
      const i = error.message.indexOf('DUBBEL_INGEROOSTERD:')
      if (i >= 0) flash(error.message.slice(i + 'DUBBEL_INGEROOSTERD:'.length).trim(), 8000)
      else if (error.code === '23505') flash('Dit crewlid staat al op deze shift.')
      else flash('Inroosteren mislukte: ' + error.message, 7000)
      return
    }
    flash(`${lid?.naam || 'Crewlid'} ingeroosterd.`)
    await laad()
  }

  const haalVanShift = async (t: Toewijzing) => {
    const naam = lidVan(t.lid_id)?.naam || 'Crewlid'
    const { error } = await supabase.from('crew_toewijzingen').delete().eq('id', t.id)
    if (error) { flash('Weghalen mislukte: ' + error.message, 7000); return }
    flash(`${naam} staat niet meer op deze shift.`)
    await laad()
  }

  const printDag = () => {
    if (dagShifts.length === 0) { flash(`Nog geen shifts voor ${DAG_NAAM[dag]}. Er valt niks te printen.`, 5000); return }
    const esc = (s: string | null | undefined) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const rollenMet = rollen.filter(r => dagShifts.some(s => s.rol_id === r.id))
    const blokken = rollenMet.map(r => {
      const rijen = dagShifts
        .filter(s => s.rol_id === r.id)
        .map(s => {
          const namen = bezetting(s.id).map(t => lidVan(t.lid_id)?.naam || '?')
          const tekort = s.aantal_nodig - namen.length
          return `<tr><td>${tijdUit(s.start_tijd)} tot ${tijdUit(s.eind_tijd)}</td><td>${esc(s.locatie)}</td><td>${esc(s.contactpersoon)}</td><td>${namen.length}/${s.aantal_nodig}${tekort > 0 ? ` <span class="tekort">nog ${tekort} nodig</span>` : ''}</td><td>${esc(namen.join(', '))}</td></tr>`
        }).join('')
      return `<h2>${esc(r.naam)}</h2><table><thead><tr><th>Tijd</th><th>Locatie</th><th>Contact</th><th>Bezetting</th><th>Wie</th></tr></thead><tbody>${rijen}</tbody></table>`
    }).join('')
    const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Crew-rooster ${DAG_VOL[dag]}</title><style>
      body{font-family:Georgia,'Times New Roman',serif;color:#010341;margin:32px;}
      h1{font-size:22px;margin:0;}
      .sub{font-size:13px;color:#555;margin:4px 0 24px;}
      h2{font-size:15px;margin:26px 0 8px;padding-bottom:4px;border-bottom:2px solid #010341;}
      table{width:100%;border-collapse:collapse;font-size:12px;font-family:Arial,Helvetica,sans-serif;}
      th{text-align:left;padding:6px 8px;border-bottom:1.5px solid #999;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#666;}
      td{padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top;}
      .tekort{color:#9b3737;font-weight:bold;}
      @media print{body{margin:10mm;}}
    </style></head><body>
      <h1>Nacht van de Wijn, crewrooster</h1>
      <div class="sub">${DAG_VOL[dag]} 2026, Werkspoorkathedraal Utrecht</div>
      ${blokken}
    </body></html>`
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) { flash('De printweergave werd geblokkeerd. Sta pop-ups toe voor deze site.', 6000); return }
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 400)
  }

  // ---------- Crewleden ----------

  const openLidForm = (lid: Lid | 'nieuw') => {
    if (lid === 'nieuw') { setLidFormOpen('nieuw'); setLidDraft(leegLid); return }
    setLidFormOpen(lid.id)
    setLidDraft({ naam: lid.naam, telefoon: lid.telefoon || '', email: lid.email || '', rol_ids: lid.rol_ids, notitie: lid.notitie || '' })
  }

  const bewaarLid = async () => {
    if (!lidDraft.naam.trim()) { flash('Vul een naam in.', 5000); return }
    const rij = {
      naam: lidDraft.naam.trim(),
      telefoon: lidDraft.telefoon.trim() || null,
      email: lidDraft.email.trim() || null,
      rol_ids: lidDraft.rol_ids,
      notitie: lidDraft.notitie.trim() || null,
    }
    setBusy(true)
    const { error } = lidFormOpen === 'nieuw'
      ? await supabase.from('crew_leden').insert(rij)
      : await supabase.from('crew_leden').update({ ...rij, updated_at: new Date().toISOString() }).eq('id', lidFormOpen!)
    setBusy(false)
    if (error) { flash('Opslaan mislukte: ' + error.message, 7000); return }
    flash(lidFormOpen === 'nieuw' ? 'Crewlid toegevoegd. Kopieer de roosterlink en stuur hem door.' : 'Opgeslagen.')
    setLidFormOpen(null)
    setLidDraft(leegLid)
    await laad()
  }

  const zetActief = async (lid: Lid, actief: boolean) => {
    const { error } = await supabase.from('crew_leden').update({ actief, updated_at: new Date().toISOString() }).eq('id', lid.id)
    if (error) { flash('Opslaan mislukte: ' + error.message, 7000); return }
    flash(actief ? `${lid.naam} is weer actief.` : `${lid.naam} staat op inactief. De roosterlink doet het niet meer.`, 6000)
    await laad()
  }

  const verwijderLid = async (lid: Lid) => {
    const n = toewijzingen.filter(t => t.lid_id === lid.id).length
    if (!confirm(`${lid.naam} definitief verwijderen?${n > 0 ? `\n\nDit haalt ${lid.naam} ook van ${n} shift${n === 1 ? '' : 's'} af.` : ''}`)) return
    const { error } = await supabase.from('crew_leden').delete().eq('id', lid.id)
    if (error) { flash('Verwijderen mislukte: ' + error.message, 7000); return }
    flash(`${lid.naam} verwijderd.`)
    await laad()
  }

  const kopieerLink = async (lid: Lid) => {
    const url = `https://nvdw-partnerportal.vercel.app/crew/${lid.publiek_token}`
    try {
      await navigator.clipboard.writeText(url)
      flash('Link gekopieerd, stuur hem via WhatsApp of mail.')
    } catch {
      flash('Kopiëren lukte niet. De link is: ' + url, 12000)
    }
  }

  // ---------- Rollen ----------

  const maakRol = async () => {
    if (!rolDraft.naam.trim()) { flash('Vul een rolnaam in.', 5000); return }
    const { error } = await supabase.from('crew_rollen').insert({ naam: rolDraft.naam.trim(), kleur: rolDraft.kleur })
    if (error) { flash(error.code === '23505' ? 'Deze rol bestaat al.' : 'Toevoegen mislukte: ' + error.message, 6000); return }
    flash('Rol toegevoegd.')
    setRolDraft({ naam: '', kleur: '#9b3737' })
    await laad()
  }

  const verwijderRol = async (rol: Rol) => {
    if (!confirm(`Rol "${rol.naam}" verwijderen?`)) return
    const { error } = await supabase.from('crew_rollen').delete().eq('id', rol.id)
    if (error) {
      if (error.code === '23503') flash(`"${rol.naam}" is nog gekoppeld aan shifts. Verwijder eerst die shifts.`, 8000)
      else flash('Verwijderen mislukte: ' + error.message, 7000)
      return
    }
    // Haal de rol ook uit de rolprofielen van crewleden.
    const met = leden.filter(l => l.rol_ids.includes(rol.id))
    for (const l of met) {
      await supabase.from('crew_leden').update({ rol_ids: l.rol_ids.filter(x => x !== rol.id), updated_at: new Date().toISOString() }).eq('id', l.id)
    }
    flash(`Rol "${rol.naam}" verwijderd.`)
    await laad()
  }

  // ---------- UI-bouwstenen ----------

  const rolChip = (rol: Rol) => (
    <span key={rol.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 8px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '10px', background: '#fff', color: 'var(--navy)' }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: rol.kleur, display: 'inline-block' }} />
      {rol.naam}
    </span>
  )

  // Velden van een shift, gedeeld door het aanmaakformulier en het wijzigen op
  // de kaart zelf. Zo kan een veld nooit in het ene scherm zitten en in het
  // andere ontbreken.
  const shiftVelden = (d: ShiftDraft, zet: (x: ShiftDraft) => void, nieuw: boolean) => (
    <>
      <div style={AS.grid3}>
        <div>
          <label style={AS.label}>Dag</label>
          <select style={{ ...AS.input, opacity: d.alleDagen ? 0.5 : 1 }} value={d.dag} disabled={d.alleDagen}
            onChange={e => zet({ ...d, dag: e.target.value as Dag })}>
            {PROGRAMMA_DAGEN.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </div>
        <div>
          <label style={AS.label}>Rol</label>
          <select style={AS.input} value={d.rol_id} onChange={e => zet({ ...d, rol_id: e.target.value })}>
            <option value="">Kies een rol</option>
            {rollen.map(r => <option key={r.id} value={r.id}>{r.naam}</option>)}
          </select>
        </div>
        <div>
          <label style={AS.label}>Aantal nodig</label>
          <input style={AS.input} type="number" min={1} value={d.aantal} onChange={e => zet({ ...d, aantal: e.target.value })} />
        </div>
        <div>
          <label style={AS.label}>Starttijd</label>
          <input style={AS.input} type="time" value={d.start} onChange={e => zet({ ...d, start: e.target.value })} />
        </div>
        <div>
          <label style={AS.label}>Eindtijd</label>
          <input style={AS.input} type="time" value={d.eind} onChange={e => zet({ ...d, eind: e.target.value })} />
        </div>
        <div>
          <label style={AS.label}>Locatie</label>
          <input style={AS.input} value={d.locatie} onChange={e => zet({ ...d, locatie: e.target.value })} placeholder="bijv. Hoofdentree" />
        </div>
        <div>
          <label style={AS.label}>Contactpersoon</label>
          <input style={AS.input} value={d.contactpersoon} onChange={e => zet({ ...d, contactpersoon: e.target.value })} placeholder="bijv. Milan" />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={AS.label}>Opmerking (optioneel)</label>
          <input style={AS.input} value={d.opmerking} onChange={e => zet({ ...d, opmerking: e.target.value })} placeholder="bijv. Portofoon ophalen bij de productie" />
        </div>
      </div>
      {nieuw && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', fontSize: '13px', color: 'var(--navy)', cursor: 'pointer' }}>
          <input type="checkbox" checked={d.alleDagen} onChange={e => zet({ ...d, alleDagen: e.target.checked })} />
          Op alle drie de dagen (vr, za en zo)
        </label>
      )}
      <div style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>Eindtijd voor de starttijd? Dan loopt de shift door tot na middernacht.</div>
    </>
  )

  const shiftKaart = (s: Shift) => {
    const rol = rolVan(s.rol_id)
    const opShift = bezetting(s.id)
    const compleet = opShift.length >= s.aantal_nodig
    const opShiftIds = new Set(opShift.map(t => t.lid_id))
    const kandidaten = leden.filter(l => l.actief && !opShiftIds.has(l.id))
    const metRol = kandidaten.filter(l => l.rol_ids.includes(s.rol_id))
    const overige = kandidaten.filter(l => !l.rol_ids.includes(s.rol_id))
    const bewerken = bewerkId === s.id
    return (
      <div key={s.id} style={{ ...AS.card, borderLeft: `4px solid ${rol?.kleur || 'var(--bordeaux)'}`, padding: '16px 20px', marginBottom: '10px' }}>
        {bewerken ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
              <div style={AS.cardTitle}>Shift wijzigen</div>
              <button style={{ ...AS.btnSm, borderColor: '#ccc', color: '#666' }} onClick={sluitBewerk}>Annuleer</button>
            </div>
            {shiftVelden(bewerkDraft, setBewerkDraft, false)}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button style={AS.btn} onClick={() => bewaarShift(s)} disabled={busy}>{busy ? 'Opslaan...' : 'Wijzigingen opslaan'}</button>
              <button style={{ ...AS.btnSm, borderColor: '#ccc', color: '#888', marginTop: '14px' }} onClick={() => verwijderShift(s)}>Shift verwijderen</button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            {/* De hele kop is aanklikbaar om te wijzigen; de namen eronder niet,
                anders klap je hem open terwijl je iemand wilt inroosteren. */}
            <div onClick={() => openBewerk(s)} title="Klik om deze shift te wijzigen" style={{ cursor: 'pointer', flex: 1, minWidth: '200px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--navy)' }}>
                {rol?.naam || 'Onbekende rol'}
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--bordeaux)', marginLeft: '8px' }}>wijzig</span>
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                {tijdUit(s.start_tijd)} tot {tijdUit(s.eind_tijd)}
                {s.locatie && <> · {s.locatie}</>}
                {s.contactpersoon && <> · contact: {s.contactpersoon}</>}
              </div>
              {s.opmerking && <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic', marginTop: '2px' }}>{s.opmerking}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ padding: '3px 10px', fontSize: '11px', fontWeight: 700, borderRadius: '10px', background: compleet ? '#e8f5e9' : '#fdecea', color: compleet ? '#2e7d32' : '#b71c1c' }}>
                {opShift.length}/{s.aantal_nodig}{!compleet && ` · nog ${s.aantal_nodig - opShift.length} nodig`}
              </span>
              <button style={AS.btnSm} onClick={() => openBewerk(s)}>Wijzig</button>
              <button style={{ ...AS.btnSm, borderColor: '#ccc', color: '#888' }} onClick={() => verwijderShift(s)}>Verwijder</button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
          {opShift.map(t => {
            const lid = lidVan(t.lid_id)
            return (
              <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 6px 4px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '12px', background: 'var(--navy)', color: 'var(--cream)' }}>
                {lid?.naam || 'Onbekend'}
                <button
                  onClick={() => haalVanShift(t)}
                  title="Van shift halen"
                  style={{ border: 'none', background: 'rgba(254,241,213,0.25)', color: 'var(--cream)', width: '16px', height: '16px', lineHeight: '14px', borderRadius: '50%', cursor: 'pointer', fontSize: '11px', padding: 0 }}
                >×</button>
              </span>
            )
          })}
          {kandidaten.length > 0 ? (
            <select
              value=""
              onChange={e => roosterIn(s.id, e.target.value)}
              style={{ ...AS.input, width: 'auto', padding: '5px 8px', fontSize: '12px' }}
            >
              <option value="">+ Inroosteren</option>
              {metRol.length > 0 && (
                <optgroup label={rol?.naam || 'Met deze rol'}>
                  {metRol.map(l => <option key={l.id} value={l.id}>{l.naam}</option>)}
                </optgroup>
              )}
              {overige.length > 0 && (
                <optgroup label="Overige">
                  {overige.map(l => <option key={l.id} value={l.id}>{l.naam}</option>)}
                </optgroup>
              )}
            </select>
          ) : (
            opShift.length === 0 && <span style={{ fontSize: '12px', color: '#999' }}>Geen crewleden beschikbaar. Voeg ze toe bij Crewleden.</span>
          )}
        </div>
      </div>
    )
  }

  const roosterSectie = () => (
    <>
      {totaalTekort === 0 ? (
        <div style={{ ...AS.card, background: '#e8f5e9', border: '1px solid #c8e6c9', color: '#2e7d32', padding: '14px 20px', fontWeight: 600, fontSize: '13px' }}>
          Het rooster is rond. Alle shifts zijn bezet.
        </div>
      ) : (
        <div style={{ ...AS.card, background: '#fff3e0', border: '1px solid #ffe0b2', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '13px', color: '#e65100' }}>
            {totaalTekort} {totaalTekort === 1 ? 'plek' : 'plekken'} open
          </span>
          {PROGRAMMA_DAGEN.filter(d => tekortPerDag[d.value] > 0).map(d => (
            <button
              key={d.value}
              onClick={() => setDag(d.value)}
              style={{ border: '1px solid #ffcc80', background: '#fff', color: '#e65100', fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '10px', cursor: 'pointer' }}
            >
              {d.label}: {tekortPerDag[d.value]}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {PROGRAMMA_DAGEN.map(d => (
          <button
            key={d.value}
            onClick={() => setDag(d.value)}
            style={{
              padding: '8px 16px', fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase',
              borderRadius: '2px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              border: '1px solid', borderColor: dag === d.value ? 'var(--navy)' : '#ccc',
              background: dag === d.value ? 'var(--navy)' : 'transparent',
              color: dag === d.value ? 'var(--cream)' : 'var(--navy)',
            }}
          >
            {d.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', border: '1px solid #ccc', borderRadius: '2px', overflow: 'hidden' }}>
          {(['lijst', 'blokken'] as const).map(w => (
            <button key={w} onClick={() => setWeergave(w)} style={{
              padding: '7px 14px', fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase',
              cursor: 'pointer', fontFamily: 'Inter, sans-serif', border: 'none',
              background: weergave === w ? 'var(--navy)' : 'transparent',
              color: weergave === w ? 'var(--cream)' : 'var(--navy)',
            }}>
              {w === 'lijst' ? 'Lijst' : 'Blokkenschema'}
            </button>
          ))}
        </div>
        <button style={{ ...AS.btnSm }} onClick={printDag}>Print dagrooster</button>
        <button style={{ ...AS.btn, marginTop: 0, padding: '8px 16px' }} onClick={() => { setShiftFormOpen(!shiftFormOpen); setShiftDraft({ ...leegShift, dag }) }}>
          {shiftFormOpen ? 'Sluit formulier' : '+ Nieuwe shift'}
        </button>
      </div>

      {shiftFormOpen && (
        <div style={AS.card}>
          <div style={AS.cardTitle}>Nieuwe shift</div>
          {shiftVelden(shiftDraft, setShiftDraft, true)}
          <button style={AS.btn} onClick={maakShift} disabled={busy}>Shift aanmaken</button>
        </div>
      )}

      {dagShifts.length === 0 ? (
        <div style={AS.card}>
          <div style={{ color: '#888', fontSize: '14px' }}>Nog geen shifts voor {DAG_NAAM[dag]}. Maak de eerste aan.</div>
        </div>
      ) : weergave === 'lijst' ? (
        tijdGroepen.map(g => (
          <div key={g.tijd} style={{ marginBottom: '18px' }}>
            <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '16px', fontWeight: 700, color: 'var(--navy)', margin: '0 0 8px 2px' }}>{g.tijd}</div>
            {g.shifts.map(s => shiftKaart(s))}
          </div>
        ))
      ) : blokkenSchema()}
    </>
  )

  // ---------- Blokkenschema: horizontaal, per rol een rij, shifts als blokken op de tijdas ----------
  const PX_PER_UUR = 110
  const RIJ_HOOGTE = 56

  const blokkenSchema = () => {
    const HOUR = 3600000
    const startenMs = dagShifts.map(s => new Date(s.start_tijd).getTime())
    const eindenMs = dagShifts.map(s => new Date(s.eind_tijd).getTime())
    const asStart = Math.floor(Math.min(...startenMs) / HOUR) * HOUR
    const asEind = Math.ceil(Math.max(...eindenMs) / HOUR) * HOUR
    const totaalUur = (asEind - asStart) / HOUR
    const x = (ms: number) => ((ms - asStart) / HOUR) * PX_PER_UUR
    const uren = Array.from({ length: totaalUur + 1 }, (_, i) => asStart + i * HOUR)
    const uurLabel = (ms: number) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })
    const rollenVandaag = rollen.filter(r => dagShifts.some(s => s.rol_id === r.id))
    const breedte = totaalUur * PX_PER_UUR

    return (
      <div style={{ ...AS.card, padding: '20px', overflow: 'hidden' }}>
        <div style={{ display: 'flex' }}>
          <div style={{ width: '130px', flex: 'none' }}>
            <div style={{ height: '32px' }} />
            {rollenVandaag.map(r => (
              <div key={r.id} style={{ height: `${RIJ_HOOGTE}px`, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--navy)', borderTop: '1px solid #f0f0f0' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.kleur, display: 'inline-block', flexShrink: 0 }} />
                {r.naam}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, overflowX: 'auto' }}>
            <div style={{ position: 'relative', width: `${breedte}px`, minWidth: '100%' }}>
              <div style={{ height: '32px', position: 'relative', borderBottom: '1px solid #ddd' }}>
                {uren.map(u => (
                  <div key={u} style={{ position: 'absolute', left: `${x(u)}px`, top: 0, fontSize: '10px', color: '#999', transform: 'translateX(-50%)' }}>{uurLabel(u)}</div>
                ))}
              </div>
              {rollenVandaag.map(r => {
                const shiftsVanRol = dagShifts.filter(s => s.rol_id === r.id)
                return (
                  <div key={r.id} style={{ height: `${RIJ_HOOGTE}px`, position: 'relative', borderTop: '1px solid #f0f0f0' }}>
                    {uren.map(u => (
                      <div key={u} style={{ position: 'absolute', left: `${x(u)}px`, top: 0, bottom: 0, width: '1px', background: '#f5f5f5' }} />
                    ))}
                    {shiftsVanRol.map(s => {
                      const opShift = bezetting(s.id)
                      const compleet = opShift.length >= s.aantal_nodig
                      const links = x(new Date(s.start_tijd).getTime())
                      const wijd = Math.max(x(new Date(s.eind_tijd).getTime()) - links, 40)
                      const namen = opShift.map(t => lidVan(t.lid_id)?.naam || '?').join(', ')
                      const titel = `${r.naam}: ${tijdUit(s.start_tijd)} tot ${tijdUit(s.eind_tijd)}${s.locatie ? ` · ${s.locatie}` : ''} · ${opShift.length}/${s.aantal_nodig}${namen ? ` · ${namen}` : ''}\n\nKlik om te wijzigen.`
                      return (
                        // Klikken op een blok gaat naar de lijst, want daar staat
                        // het wijzigformulier; in een blok van 40px past dat niet.
                        <div key={s.id} title={titel}
                          onClick={() => { setWeergave('lijst'); openBewerk(s) }}
                          style={{
                            position: 'absolute', left: `${links}px`, width: `${wijd}px`, top: '5px', bottom: '5px',
                            background: r.kleur, borderRadius: '4px', padding: '4px 8px', overflow: 'hidden',
                            border: compleet ? 'none' : '2px dashed #b71c1c',
                            color: '#fff', fontSize: '11px', lineHeight: 1.3, cursor: 'pointer',
                          }}>
                          <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{tijdUit(s.start_tijd)}–{tijdUit(s.eind_tijd)}</div>
                          <div style={{ whiteSpace: 'nowrap', opacity: 0.9 }}>{opShift.length}/{s.aantal_nodig}{s.locatie ? ` · ${s.locatie}` : ''}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '11px', color: '#999', marginTop: '14px' }}>Gestreepte rand betekent dat de shift nog niet vol is. Hover op een blok voor details.</div>
      </div>
    )
  }

  const ledenSectie = () => (
    <>
      {!lidFormOpen && (
        <button style={{ ...AS.btn, marginTop: 0, marginBottom: '16px' }} onClick={() => openLidForm('nieuw')}>+ Nieuw crewlid</button>
      )}

      {lidFormOpen && (
        <div style={AS.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={AS.cardTitle}>{lidFormOpen === 'nieuw' ? 'Nieuw crewlid' : 'Crewlid bewerken'}</div>
            <button style={{ ...AS.btnSm, border: '1px solid #ccc', color: '#666' }} onClick={() => { setLidFormOpen(null); setLidDraft(leegLid) }}>Sluiten</button>
          </div>
          <div style={AS.grid3}>
            <div>
              <label style={AS.label}>Naam</label>
              <input style={AS.input} value={lidDraft.naam} onChange={e => setLidDraft({ ...lidDraft, naam: e.target.value })} placeholder="bijv. Sanne de Vries" />
            </div>
            <div>
              <label style={AS.label}>Telefoon</label>
              <input style={AS.input} value={lidDraft.telefoon} onChange={e => setLidDraft({ ...lidDraft, telefoon: e.target.value })} placeholder="06..." />
            </div>
            <div>
              <label style={AS.label}>E-mail</label>
              <input style={AS.input} value={lidDraft.email} onChange={e => setLidDraft({ ...lidDraft, email: e.target.value })} placeholder="naam@voorbeeld.nl" />
            </div>
          </div>
          <label style={AS.label}>Rollen die dit crewlid kan draaien</label>
          {rollen.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#888' }}>Nog geen rollen. Maak ze eerst aan onder Rollen.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '4px' }}>
              {rollen.map(r => (
                <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', color: 'var(--navy)' }}>
                  <input
                    type="checkbox"
                    checked={lidDraft.rol_ids.includes(r.id)}
                    onChange={e => setLidDraft({
                      ...lidDraft,
                      rol_ids: e.target.checked ? [...lidDraft.rol_ids, r.id] : lidDraft.rol_ids.filter(x => x !== r.id),
                    })}
                  />
                  {rolChip(r)}
                </label>
              ))}
            </div>
          )}
          <label style={AS.label}>Notitie (optioneel)</label>
          <input style={AS.input} value={lidDraft.notitie} onChange={e => setLidDraft({ ...lidDraft, notitie: e.target.value })} placeholder="bijv. alleen zaterdag beschikbaar" />
          <button style={AS.btn} onClick={bewaarLid} disabled={busy}>{lidFormOpen === 'nieuw' ? 'Crewlid toevoegen' : 'Opslaan'}</button>
        </div>
      )}

      {leden.length === 0 ? (
        <div style={AS.card}>
          <div style={{ color: '#888', fontSize: '14px' }}>Nog geen crewleden. Voeg de eerste toe.</div>
        </div>
      ) : (
        <div style={AS.card}>
          <div style={AS.cardTitle}>Crewleden ({leden.length})</div>
          <table style={AS.table}>
            <thead><tr>{['Naam', 'Telefoon', 'E-mail', 'Rollen', 'Shifts', ''].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
            <tbody>
              {leden.map(lid => {
                const nShifts = toewijzingen.filter(t => t.lid_id === lid.id).length
                return (
                  <tr key={lid.id} style={{ opacity: lid.actief ? 1 : 0.5 }}>
                    <td style={AS.td}>
                      <strong>{lid.naam}</strong>
                      {!lid.actief && <span style={{ marginLeft: '8px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, borderRadius: '2px', background: '#eceff1', color: '#546e7a' }}>Inactief</span>}
                      {lid.notitie && <div style={{ fontSize: '11px', color: '#888' }}>{lid.notitie}</div>}
                    </td>
                    <td style={AS.td}>{lid.telefoon || '-'}</td>
                    <td style={AS.td}>{lid.email || '-'}</td>
                    <td style={AS.td}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {lid.rol_ids.length === 0 ? '-' : lid.rol_ids.map(id => rolVan(id)).filter((r): r is Rol => !!r).map(r => rolChip(r))}
                      </div>
                    </td>
                    <td style={AS.td}>{nShifts}</td>
                    <td style={{ ...AS.td, whiteSpace: 'nowrap' as const }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button style={AS.btnSm} onClick={() => openLidForm(lid)}>Bewerk</button>
                        <button style={{ ...AS.btnSm, borderColor: 'var(--navy)', color: 'var(--navy)' }} onClick={() => kopieerLink(lid)}>Kopieer roosterlink</button>
                        <button style={{ ...AS.btnSm, borderColor: '#ccc', color: '#888' }} onClick={() => zetActief(lid, !lid.actief)}>{lid.actief ? 'Deactiveer' : 'Activeer'}</button>
                        <button style={{ ...AS.btnSm, borderColor: '#ccc', color: '#888' }} onClick={() => verwijderLid(lid)}>Verwijder</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )

  const rollenSectie = () => (
    <>
      <div style={AS.card}>
        <div style={AS.cardTitle}>Nieuwe rol</div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={AS.label}>Naam</label>
            <input style={AS.input} value={rolDraft.naam} onChange={e => setRolDraft({ ...rolDraft, naam: e.target.value })} placeholder="bijv. Garderobe" />
          </div>
          <div>
            <label style={AS.label}>Kleur</label>
            <input type="color" value={rolDraft.kleur} onChange={e => setRolDraft({ ...rolDraft, kleur: e.target.value })} style={{ width: '44px', height: '36px', border: '1px solid #ddd', borderRadius: '2px', padding: '2px', background: '#fff', cursor: 'pointer' }} />
          </div>
          <button style={{ ...AS.btn, marginTop: 0 }} onClick={maakRol} disabled={busy}>Toevoegen</button>
        </div>
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Rollen ({rollen.length})</div>
        {rollen.length === 0 ? (
          <div style={{ color: '#888', fontSize: '14px' }}>Nog geen rollen. Voeg de eerste toe.</div>
        ) : (
          <table style={AS.table}>
            <thead><tr>{['Rol', 'Shifts', 'Crewleden met deze rol', ''].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
            <tbody>
              {rollen.map(r => {
                const nShifts = shifts.filter(s => s.rol_id === r.id).length
                const nLeden = leden.filter(l => l.rol_ids.includes(r.id)).length
                return (
                  <tr key={r.id}>
                    <td style={AS.td}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '14px', height: '14px', borderRadius: '4px', background: r.kleur, display: 'inline-block', border: '1px solid rgba(0,0,0,0.1)' }} />
                        <strong>{r.naam}</strong>
                      </span>
                    </td>
                    <td style={AS.td}>{nShifts}</td>
                    <td style={AS.td}>{nLeden}</td>
                    <td style={AS.td}>
                      <button style={{ ...AS.btnSm, borderColor: '#ccc', color: '#888' }} onClick={() => verwijderRol(r)}>Verwijder</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )

  if (!geladen) return <div style={{ padding: '20px', color: '#888' }}>Crew-rooster laden...</div>

  return (
    <>
      <div style={AS.title}>Crew-rooster</div>
      <div style={AS.sub}>
        Plan hier de crew voor alle drie de festivaldagen. Elk crewlid heeft een eigen roosterlink voor op de telefoon.
        De database bewaakt dubbel inroosteren op overlappende tijden.
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {SECTIES.map(s => (
          <button
            key={s.id}
            onClick={() => setSectie(s.id)}
            style={{
              padding: '8px 18px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, letterSpacing: '1px',
              textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              border: '1px solid', borderColor: sectie === s.id ? 'var(--navy)' : '#ccc',
              background: sectie === s.id ? 'var(--navy)' : 'transparent',
              color: sectie === s.id ? 'var(--cream)' : 'var(--navy)',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {sectie === 'rooster' && roosterSectie()}
      {sectie === 'leden' && ledenSectie()}
      {sectie === 'rollen' && rollenSectie()}
    </>
  )
}

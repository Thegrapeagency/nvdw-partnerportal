'use client'
// Programma-module: de ene plek waar proeverijen en programma-items ontstaan.
// Flow: concept -> review (teksten goedkeuren) -> live. Bij live maakt de
// database-trigger automatisch het tickettype aan; website, app, ticketshop
// en wachtlijst lezen allemaal uit dezelfde bron.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Proeverij, ProgrammaSoort, ProgrammaStatus } from '@/lib/supabase'
import { AS, PROGRAMMA_DAGEN, euro, tijdUit, carouselUrl } from './ui'

// bouwt de tekst waarmee de carousel-generator zijn slides destilleert
function socialTekst(d: Draft): string {
  const dag = PROGRAMMA_DAGEN.find(x => x.value === d.dag)?.label || ''
  const wanneer = [dag, d.start_tijd].filter(Boolean).join(' · ')
  return [
    `${d.titel}${d.host ? ` met ${d.host}` : ''}`,
    wanneer ? `Wanneer: ${wanneer}` : '',
    d.social_copy || d.beschrijving_kort,
    'Nacht van de Wijn · 6, 7 en 8 november 2026 · Werkspoorkathedraal Utrecht',
  ].filter(Boolean).join('\n\n')
}

type TicketInfo = { id: string; price_cents: number; active: boolean; per_type_cap: number | null; per_type_sold: number; sale_state: string }
type PartnerOptie = { id: string; bedrijfsnaam: string }

const SOORTEN: { value: ProgrammaSoort; label: string; ticket: boolean }[] = [
  { value: 'proeverij', label: 'Proeverij / masterclass', ticket: true },
  { value: 'restaurant', label: 'Restaurant-shift', ticket: true },
  { value: 'workshop', label: 'Workshop', ticket: true },
  { value: 'podium', label: 'Podium / optreden', ticket: false },
  { value: 'silent_disco', label: 'Silent disco', ticket: false },
  { value: 'overig', label: 'Overig programma', ticket: false },
]

const STATUS_LABEL: Record<ProgrammaStatus, string> = {
  concept: 'Concept', review: 'In review', live: 'Live', geannuleerd: 'Geannuleerd',
}
const STATUS_KLEUR: Record<ProgrammaStatus, { bg: string; fg: string }> = {
  concept: { bg: '#eceff1', fg: '#546e7a' },
  review: { bg: '#fff3e0', fg: '#e65100' },
  live: { bg: '#e8f5e9', fg: '#2e7d32' },
  geannuleerd: { bg: '#fdecea', fg: '#b71c1c' },
}

type Draft = {
  soort: ProgrammaSoort; titel: string; host: string; partner_id: string
  dag: 'fri' | 'sat' | 'sun'; start_tijd: string; eind_tijd: string; locatie: string
  capaciteit: string; prijs: string; steekwoorden: string; foto_url: string
  beschrijving: string; beschrijving_kort: string; social_copy: string
}

const leegDraft: Draft = {
  soort: 'proeverij', titel: '', host: '', partner_id: '', dag: 'fri',
  start_tijd: '', eind_tijd: '', locatie: '', capaciteit: '20', prijs: '',
  steekwoorden: '', foto_url: '', beschrijving: '', beschrijving_kort: '', social_copy: '',
}

function naarDraft(p: Proeverij): Draft {
  const tijd = (iso: string | null) => iso
    ? new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })
    : ''
  return {
    soort: p.soort, titel: p.titel, host: p.host || '', partner_id: p.partner_id || '',
    dag: p.dag, start_tijd: tijd(p.start_tijd), eind_tijd: tijd(p.eind_tijd),
    locatie: p.locatie || '', capaciteit: p.capaciteit != null ? String(p.capaciteit) : '',
    prijs: p.prijs_cents != null ? (p.prijs_cents / 100).toFixed(2) : '',
    steekwoorden: p.steekwoorden || '', foto_url: p.foto_url || '',
    beschrijving: p.beschrijving || '', beschrijving_kort: p.beschrijving_kort || '',
    social_copy: p.social_copy || '',
  }
}

function draftNaarRij(d: Draft) {
  const dagInfo = PROGRAMMA_DAGEN.find(x => x.value === d.dag)!
  return {
    soort: d.soort, titel: d.titel.trim(), host: d.host.trim() || null,
    partner_id: d.partner_id || null, dag: d.dag,
    start_tijd: d.start_tijd ? `${dagInfo.datum}T${d.start_tijd}:00+01:00` : null,
    eind_tijd: d.eind_tijd ? `${dagInfo.datum}T${d.eind_tijd}:00+01:00` : null,
    locatie: d.locatie.trim() || null,
    capaciteit: d.capaciteit ? parseInt(d.capaciteit) : null,
    prijs_cents: d.prijs ? Math.round(parseFloat(d.prijs.replace(',', '.')) * 100) : null,
    steekwoorden: d.steekwoorden.trim() || null, foto_url: d.foto_url.trim() || null,
    beschrijving: d.beschrijving.trim() || null,
    beschrijving_kort: d.beschrijving_kort.trim() || null,
    social_copy: d.social_copy.trim() || null,
  }
}

export default function Programma({ partners, flash }: { partners: PartnerOptie[]; flash: (m: string, ms?: number) => void }) {
  const [items, setItems] = useState<Proeverij[]>([])
  const [tickets, setTickets] = useState<Map<string, TicketInfo>>(new Map())
  const [wachtlijst, setWachtlijst] = useState<Record<string, number>>({})
  const [geladen, setGeladen] = useState(false)
  const [openId, setOpenId] = useState<string | 'nieuw' | null>(null)
  const [draft, setDraft] = useState<Draft>(leegDraft)
  const [busy, setBusy] = useState(false)
  const [genBusy, setGenBusy] = useState(false)

  const laad = async () => {
    const [pv, tt, wl] = await Promise.all([
      supabase.from('proeverijen').select('*').order('dag').order('start_tijd', { nullsFirst: false }).order('volgorde'),
      supabase.from('ticket_types').select('id, price_cents, active, per_type_cap, per_type_sold, sale_state').eq('category', 'extra'),
      supabase.from('waitlist').select('ticket_type_id, converted_at'),
    ])
    setItems((pv.data || []) as Proeverij[])
    setTickets(new Map(((tt.data || []) as TicketInfo[]).map(t => [t.id, t])))
    const w: Record<string, number> = {}
    for (const r of (wl.data || []) as { ticket_type_id: string; converted_at: string | null }[]) {
      if (!r.converted_at) w[r.ticket_type_id] = (w[r.ticket_type_id] || 0) + 1
    }
    setWachtlijst(w)
    setGeladen(true)
  }
  useEffect(() => { laad() }, [])

  const open = (p: Proeverij) => { setOpenId(p.id); setDraft(naarDraft(p)) }
  const sluit = () => { setOpenId(null); setDraft(leegDraft) }
  const huidige = openId && openId !== 'nieuw' ? items.find(i => i.id === openId) : null

  const foutTekst = (msg: string) =>
    msg.includes('CAPACITEIT_TE_LAAG')
      ? 'De capaciteit kan niet lager dan het aantal al verkochte tickets.'
      : 'Opslaan mislukt: ' + msg

  const maakNieuw = async () => {
    if (!draft.titel.trim()) { flash('Vul in elk geval een titel in.', 5000); return }
    setBusy(true)
    const { error } = await supabase.from('proeverijen').insert({
      ...draftNaarRij(draft), status: 'concept', actief: true,
      volgorde: Math.max(0, ...items.map(i => i.volgorde)) + 1,
    })
    setBusy(false)
    if (error) { flash(foutTekst(error.message), 7000); return }
    flash('Concept aangemaakt. Genereer of schrijf de teksten en zet hem daarna in review.')
    sluit(); await laad()
  }

  const bewaar = async (extra: Partial<Proeverij> = {}, melding = 'Opgeslagen') => {
    if (!huidige) return
    setBusy(true)
    const { error } = await supabase.from('proeverijen').update({ ...draftNaarRij(draft), ...extra }).eq('id', huidige.id)
    setBusy(false)
    if (error) { flash(foutTekst(error.message), 7000); return }
    flash(melding, 5000)
    await laad()
    if (extra.status) sluit()
  }

  const zetLive = async () => {
    if (!huidige) return
    const heeftTicket = SOORTEN.find(s => s.value === draft.soort)?.ticket
    if (heeftTicket && (!draft.prijs || !draft.capaciteit)) {
      flash('Prijs en capaciteit zijn verplicht om ticketverkoop te starten.', 6000); return
    }
    if (!draft.beschrijving.trim()) { flash('Zonder beschrijving kan een item niet live. Genereer of schrijf er een.', 6000); return }
    if (!confirm(`"${draft.titel}" live zetten?\n\nHet item verschijnt direct op de website en in de app${heeftTicket ? ' en tickets zijn direct koopbaar' : ''}.`)) return
    await bewaar({ status: 'live' }, 'Live. Website, app en ticketverkoop zijn bijgewerkt.')
  }

  const annuleer = async () => {
    if (!huidige) return
    const t = huidige.ticket_type_id ? tickets.get(huidige.ticket_type_id) : null
    const verkocht = t?.per_type_sold ?? 0
    const reden = prompt(`"${huidige.titel}" annuleren?\n\nDe verkoop stopt direct en het item staat als geannuleerd op site en app.${verkocht > 0 ? `\n\nLet op: er zijn al ${verkocht} tickets verkocht. De kopers vind je in het ticketdashboard (gastenlijst) voor communicatie en eventuele refunds.` : ''}\n\nReden (voor het logboek):`)
    if (reden === null) return
    await bewaar({ status: 'geannuleerd', annulering_reden: reden || null }, 'Geannuleerd. Verkoop is gestopt; site en app tonen het item als geannuleerd.')
  }

  const verwijder = async () => {
    if (!huidige) return
    const t = huidige.ticket_type_id ? tickets.get(huidige.ticket_type_id) : null
    if ((t?.per_type_sold ?? 0) > 0) { flash('Er zijn al tickets verkocht. Annuleren kan wel, verwijderen niet.', 7000); return }
    if (!confirm(`"${huidige.titel}" definitief verwijderen?`)) return
    setBusy(true)
    await supabase.from('proeverijen').delete().eq('id', huidige.id)
    if (huidige.ticket_type_id) await supabase.from('ticket_types').delete().eq('id', huidige.ticket_type_id)
    setBusy(false)
    flash('Verwijderd'); sluit(); await laad()
  }

  const genereer = async () => {
    if (!draft.titel.trim()) { flash('Vul eerst een titel in.', 5000); return }
    setGenBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const rij = draftNaarRij(draft)
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-copy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        },
        body: JSON.stringify({ proeverij: rij }),
      })
      const j = await res.json()
      if (!res.ok) { flash(j.melding || 'Tekstgeneratie is even niet beschikbaar. Je kunt de teksten ook zelf schrijven.', 8000); return }
      setDraft(d => ({ ...d, beschrijving: j.beschrijving, beschrijving_kort: j.beschrijving_kort, social_copy: j.social_copy }))
      if (huidige) await supabase.from('proeverijen').update({ gen_model: j.model, gen_at: new Date().toISOString() }).eq('id', huidige.id)
      flash('Teksten gegenereerd. Lees ze na, pas aan waar nodig en keur ze goed via de review.', 7000)
    } catch {
      flash('Tekstgeneratie is even niet bereikbaar. Je kunt de teksten ook zelf schrijven.', 7000)
    } finally {
      setGenBusy(false)
    }
  }

  const groepen = useMemo(() => {
    const volg: ProgrammaStatus[] = ['review', 'concept', 'live', 'geannuleerd']
    return volg.map(s => ({ status: s, lijst: items.filter(i => i.status === s) })).filter(g => g.lijst.length > 0)
  }, [items])

  const badge = (s: ProgrammaStatus) => (
    <span style={{ display: 'inline-block', padding: '2px 8px', fontSize: '10px', fontWeight: 700, borderRadius: '2px', background: STATUS_KLEUR[s].bg, color: STATUS_KLEUR[s].fg }}>{STATUS_LABEL[s]}</span>
  )

  const soortLabel = (s: ProgrammaSoort) => SOORTEN.find(x => x.value === s)?.label || s
  const isTicketSoort = SOORTEN.find(s => s.value === draft.soort)?.ticket

  // ---------- detail / formulier ----------
  const formulier = (nieuw: boolean) => (
    <div style={AS.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={AS.cardTitle}>{nieuw ? 'Nieuw programma-item' : <>Bewerken {huidige && badge(huidige.status)}</>}</div>
        <button style={{ ...AS.btnSm, border: '1px solid #ccc', color: '#666' }} onClick={sluit}>Sluiten</button>
      </div>

      <div style={AS.grid3}>
        <div>
          <label style={AS.label}>Soort</label>
          <select style={AS.input} value={draft.soort} onChange={e => setDraft({ ...draft, soort: e.target.value as ProgrammaSoort })}>
            {SOORTEN.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label style={AS.label}>Titel</label>
          <input style={AS.input} value={draft.titel} onChange={e => setDraft({ ...draft, titel: e.target.value })} placeholder="bijv. Masterclass Bourgogne" />
        </div>
        <div>
          <label style={AS.label}>Wijnhuis / host</label>
          <input style={AS.input} value={draft.host} onChange={e => setDraft({ ...draft, host: e.target.value })} placeholder="bijv. Domaine Faiveley" />
        </div>
        <div>
          <label style={AS.label}>Gekoppelde partner (optioneel)</label>
          <select style={AS.input} value={draft.partner_id} onChange={e => setDraft({ ...draft, partner_id: e.target.value })}>
            <option value="">Geen (organisatie)</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.bedrijfsnaam}</option>)}
          </select>
        </div>
        <div>
          <label style={AS.label}>Dag</label>
          <select style={AS.input} value={draft.dag} onChange={e => setDraft({ ...draft, dag: e.target.value as 'fri' | 'sat' | 'sun' })}>
            {PROGRAMMA_DAGEN.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <label style={AS.label}>Zaal / locatie</label>
          <input style={AS.input} value={draft.locatie} onChange={e => setDraft({ ...draft, locatie: e.target.value })} placeholder="bijv. Mezzanine" />
        </div>
        <div>
          <label style={AS.label}>Starttijd</label>
          <input style={AS.input} type="time" value={draft.start_tijd} onChange={e => setDraft({ ...draft, start_tijd: e.target.value })} />
        </div>
        <div>
          <label style={AS.label}>Eindtijd</label>
          <input style={AS.input} type="time" value={draft.eind_tijd} onChange={e => setDraft({ ...draft, eind_tijd: e.target.value })} />
        </div>
        <div>
          <label style={AS.label}>Foto (url, optioneel)</label>
          <input style={AS.input} value={draft.foto_url} onChange={e => setDraft({ ...draft, foto_url: e.target.value })} placeholder="https://..." />
        </div>
        {isTicketSoort && (
          <>
            <div>
              <label style={AS.label}>Capaciteit (plekken)</label>
              <input style={AS.input} type="number" value={draft.capaciteit} onChange={e => setDraft({ ...draft, capaciteit: e.target.value })} />
            </div>
            <div>
              <label style={AS.label}>Prijs per persoon (€)</label>
              <input style={AS.input} type="number" step="0.01" value={draft.prijs} onChange={e => setDraft({ ...draft, prijs: e.target.value })} placeholder="12,50" />
            </div>
          </>
        )}
      </div>

      <label style={AS.label}>Steekwoorden voor de tekstgeneratie</label>
      <input style={AS.input} value={draft.steekwoorden} onChange={e => setDraft({ ...draft, steekwoorden: e.target.value })}
        placeholder="bijv. pinot noir, verticale proeverij 5 jaargangen, kelder-verhalen van de maker" />

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
        <button style={{ ...AS.btnGold, marginTop: 0, opacity: genBusy ? 0.6 : 1 }} onClick={genereer} disabled={genBusy}>
          {genBusy ? 'Bezig met schrijven...' : 'Genereer teksten'}
        </button>
        <span style={{ fontSize: '12px', color: '#888' }}>Gegenereerde tekst gaat nooit vanzelf live: jij leest na, past aan en keurt goed.</span>
      </div>

      <label style={AS.label}>Beschrijving (website en app)</label>
      <textarea style={{ ...AS.input, height: '110px', resize: 'vertical' }} value={draft.beschrijving}
        onChange={e => setDraft({ ...draft, beschrijving: e.target.value })} placeholder="Wervende beschrijving van 60 tot 100 woorden." />

      <label style={AS.label}>Korte beschrijving (overzichten en ticketshop)</label>
      <textarea style={{ ...AS.input, height: '50px', resize: 'vertical' }} value={draft.beschrijving_kort}
        onChange={e => setDraft({ ...draft, beschrijving_kort: e.target.value })} placeholder="Maximaal 25 woorden." />

      <label style={AS.label}>Social copy (voor de beeldgenerator)</label>
      <textarea style={{ ...AS.input, height: '60px', resize: 'vertical' }} value={draft.social_copy}
        onChange={e => setDraft({ ...draft, social_copy: e.target.value })} placeholder="Tekst voor Instagram-post of story." />
      {draft.social_copy && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
          <a href={carouselUrl(socialTekst(draft))} target="_blank" rel="noreferrer"
            style={{ ...AS.btnSm, textDecoration: 'none', display: 'inline-block' }}>
            Open in carousel-generator
          </a>
          <button style={AS.btnSm} onClick={() => { navigator.clipboard.writeText(draft.social_copy); flash('Social copy gekopieerd.') }}>
            Kopieer social copy
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
        {nieuw && <button style={AS.btn} onClick={maakNieuw} disabled={busy}>Opslaan als concept</button>}
        {!nieuw && huidige && (
          <>
            <button style={AS.btn} onClick={() => bewaar({}, huidige.status === 'live' ? 'Opgeslagen. Website, app en ticketshop zijn direct bijgewerkt.' : 'Opgeslagen')} disabled={busy}>
              {huidige.status === 'live' ? 'Opslaan en overal bijwerken' : 'Opslaan'}
            </button>
            {huidige.status === 'concept' && (
              <button style={{ ...AS.btn, background: 'var(--bordeaux)' }} onClick={() => bewaar({ status: 'review' }, 'Staat in review. Laat iemand van het team de teksten goedkeuren.')} disabled={busy}>Naar review</button>
            )}
            {huidige.status === 'review' && (
              <>
                <button style={{ ...AS.btn, background: '#2e7d32' }} onClick={zetLive} disabled={busy}>Keur goed en zet live</button>
                <button style={{ ...AS.btn, background: 'transparent', color: 'var(--navy)', border: '1px solid #ccc' }} onClick={() => bewaar({ status: 'concept' }, 'Terug naar concept.')} disabled={busy}>Terug naar concept</button>
              </>
            )}
            {huidige.status === 'live' && (
              <button style={{ ...AS.btn, background: 'var(--bordeaux)' }} onClick={annuleer} disabled={busy}>Annuleer dit item</button>
            )}
            {huidige.status === 'geannuleerd' && (
              <button style={{ ...AS.btn, background: '#2e7d32' }} onClick={() => bewaar({ status: 'live', annulering_reden: null }, 'Weer live. Verkoop en zichtbaarheid zijn hersteld.')} disabled={busy}>Heractiveer</button>
            )}
            {(huidige.status === 'concept' || huidige.status === 'review') && (
              <button style={{ ...AS.btn, background: 'transparent', color: 'var(--bordeaux)', border: '1px solid var(--bordeaux)' }} onClick={verwijder} disabled={busy}>Verwijder</button>
            )}
          </>
        )}
      </div>
      {huidige?.status === 'geannuleerd' && huidige.annulering_reden && (
        <div style={{ marginTop: '12px', fontSize: '12px', color: '#b71c1c' }}>Reden van annulering: {huidige.annulering_reden}</div>
      )}
    </div>
  )

  if (!geladen) return <div style={{ padding: '20px', color: '#888' }}>Programma laden...</div>

  return (
    <>
      <div style={AS.title}>Programma</div>
      <div style={AS.sub}>
        Voer hier elk programma-item één keer in. Bij &quot;live&quot; verschijnt het automatisch op de website en in de app,
        en start de ticketverkoop met de juiste prijs en capaciteit. Wijzigingen kloppen daarna overal direct.
      </div>

      {openId === 'nieuw' && formulier(true)}
      {huidige && formulier(false)}

      {!openId && (
        <button style={{ ...AS.btn, marginTop: 0, marginBottom: '20px' }} onClick={() => { setOpenId('nieuw'); setDraft(leegDraft) }}>
          + Nieuw programma-item
        </button>
      )}

      {items.length === 0 && (
        <div style={AS.card}>
          <div style={{ color: '#888', fontSize: '14px' }}>
            Nog geen programma-items. Begin met een nieuw item; je kunt alles eerst als concept klaarzetten.
          </div>
        </div>
      )}

      {groepen.map(g => (
        <div key={g.status} style={AS.card}>
          <div style={AS.cardTitle}>{STATUS_LABEL[g.status]} ({g.lijst.length})</div>
          <table style={AS.table}>
            <thead><tr>{['Titel', 'Soort', 'Dag & tijd', 'Prijs', 'Verkocht', 'Wachtlijst', ''].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
            <tbody>
              {g.lijst.map(p => {
                const t = p.ticket_type_id ? tickets.get(p.ticket_type_id) : null
                const dagLabel = PROGRAMMA_DAGEN.find(d => d.value === p.dag)?.label || p.dag
                const vol = t?.per_type_cap != null && t.per_type_sold >= t.per_type_cap
                return (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => open(p)}>
                    <td style={AS.td}>
                      <strong>{p.titel}</strong>
                      {p.host && <div style={{ fontSize: '11px', color: '#888' }}>{p.host}</div>}
                    </td>
                    <td style={AS.td}>{soortLabel(p.soort)}</td>
                    <td style={{ ...AS.td, fontSize: '12px' }}>{dagLabel}{p.start_tijd ? <><br />{tijdUit(p.start_tijd)}{p.eind_tijd ? `-${tijdUit(p.eind_tijd)}` : ''}</> : null}</td>
                    <td style={AS.td}>{p.prijs_cents != null ? euro(p.prijs_cents) : '-'}</td>
                    <td style={AS.td}>
                      {t ? <>{t.per_type_sold}/{t.per_type_cap ?? '∞'} {vol && <span style={{ color: '#b71c1c', fontWeight: 700, fontSize: '11px' }}>VOL</span>}</> : '-'}
                    </td>
                    <td style={AS.td}>{p.ticket_type_id && wachtlijst[p.ticket_type_id] ? `${wachtlijst[p.ticket_type_id]} wachtenden` : '-'}</td>
                    <td style={AS.td}><button style={AS.btnSm} onClick={e => { e.stopPropagation(); open(p) }}>Open</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  )
}

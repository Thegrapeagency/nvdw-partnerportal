'use client'
// Advertenties-module: adruimte in de bezoekersapp verkopen aan wijnpartners.
// De organisatie beheert hier de tabel app_ads; de app zelf leest de view
// app_ads_actief (actief aan en datum binnen de periode).
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS, euro } from './ui'

type Positie = 'home' | 'wijnen' | 'food' | 'programma'

type AppAd = {
  id: string
  positie: Positie
  partner_id: string | null
  verkocht_aan: string | null
  titel: string
  tekst: string | null
  beeld_url: string | null
  link_url: string | null
  cta_label: string | null
  prijs_cents: number | null
  start_datum: string | null
  eind_datum: string | null
  actief: boolean
  volgorde: number
}

type PartnerOptie = { id: string; bedrijfsnaam: string; type: string }

// Aanvragen die partners zelf doen via Extra bestellen in hun portal
// (catalogusproducten "App-advertentie: ..."). Hier richt je ze in.
type AdAanvraag = {
  id: string
  partner_id: string
  product: string
  prijs_per_stuk: number | null
  created_at: string
}

function productNaarPositie(product: string): Positie {
  const p = product.toLowerCase()
  if (p.includes('wijn')) return 'wijnen'
  if (p.includes('food')) return 'food'
  if (p.includes('programma')) return 'programma'
  return 'home'
}

const POSITIES: { value: Positie; label: string; uitleg: string }[] = [
  { value: 'home', label: 'Home', uitleg: 'Banner tussen de secties op het homescherm' },
  { value: 'wijnen', label: 'Wijnen', uitleg: 'Kaart tussen de wijnlijst' },
  { value: 'food', label: 'Food', uitleg: 'Banner op de foodpagina' },
  { value: 'programma', label: 'Programma', uitleg: 'Kaart in de timetable' },
]

type AdStatus = 'actief' | 'gepland' | 'verlopen' | 'uit'

const STATUS_LABEL: Record<AdStatus, string> = {
  actief: 'Actief nu', gepland: 'Gepland', verlopen: 'Verlopen', uit: 'Uit',
}
const STATUS_KLEUR: Record<AdStatus, { bg: string; fg: string }> = {
  actief: { bg: '#e8f5e9', fg: '#2e7d32' },
  gepland: { bg: '#fff3e0', fg: '#e65100' },
  verlopen: { bg: '#fdecea', fg: '#b71c1c' },
  uit: { bg: '#eceff1', fg: '#546e7a' },
}

const vandaag = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })

function adStatus(ad: AppAd): AdStatus {
  if (!ad.actief) return 'uit'
  const nu = vandaag()
  if (ad.start_datum && nu < ad.start_datum) return 'gepland'
  if (ad.eind_datum && nu > ad.eind_datum) return 'verlopen'
  return 'actief'
}

const datumUit = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

function periodeTekst(ad: AppAd): string {
  if (!ad.start_datum && !ad.eind_datum) return 'Altijd'
  if (ad.start_datum && ad.eind_datum) return `${datumUit(ad.start_datum)} t/m ${datumUit(ad.eind_datum)}`
  if (ad.start_datum) return `Vanaf ${datumUit(ad.start_datum)}`
  return `T/m ${datumUit(ad.eind_datum!)}`
}

type Draft = {
  positie: Positie; partner_id: string; verkocht_aan: string
  titel: string; tekst: string; beeld_url: string; link_url: string; cta_label: string
  prijs: string; start_datum: string; eind_datum: string; actief: boolean
}

const leegDraft: Draft = {
  positie: 'home', partner_id: '', verkocht_aan: '',
  titel: '', tekst: '', beeld_url: '', link_url: '', cta_label: 'Ontdek meer',
  prijs: '', start_datum: '', eind_datum: '', actief: false,
}

function naarDraft(a: AppAd): Draft {
  return {
    positie: a.positie, partner_id: a.partner_id || '', verkocht_aan: a.verkocht_aan || '',
    titel: a.titel, tekst: a.tekst || '', beeld_url: a.beeld_url || '',
    link_url: a.link_url || '', cta_label: a.cta_label || 'Ontdek meer',
    prijs: a.prijs_cents != null ? (a.prijs_cents / 100).toFixed(2) : '',
    start_datum: a.start_datum || '', eind_datum: a.eind_datum || '',
    actief: a.actief,
  }
}

function draftNaarRij(d: Draft) {
  return {
    positie: d.positie,
    partner_id: d.partner_id || null,
    verkocht_aan: d.partner_id ? null : (d.verkocht_aan.trim() || null),
    titel: d.titel.trim(),
    tekst: d.tekst.trim(),
    beeld_url: d.beeld_url.trim(),
    link_url: d.link_url.trim(),
    cta_label: d.cta_label.trim() || 'Ontdek meer',
    prijs_cents: d.prijs.trim() ? Math.round(parseFloat(d.prijs.replace(',', '.')) * 100) : null,
    start_datum: d.start_datum || null,
    eind_datum: d.eind_datum || null,
    actief: d.actief,
  }
}

export default function Advertenties({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [items, setItems] = useState<AppAd[]>([])
  const [partners, setPartners] = useState<PartnerOptie[]>([])
  const [geladen, setGeladen] = useState(false)
  const [openId, setOpenId] = useState<string | 'nieuw' | null>(null)
  const [draft, setDraft] = useState<Draft>(leegDraft)
  const [busy, setBusy] = useState(false)
  const [aanvragen, setAanvragen] = useState<AdAanvraag[]>([])
  const [vanAanvraag, setVanAanvraag] = useState<string | null>(null)

  const laad = async () => {
    const [ads, pt, av] = await Promise.all([
      supabase.from('app_ads').select('*').order('positie').order('volgorde'),
      supabase.from('partners').select('id, bedrijfsnaam, type').order('bedrijfsnaam'),
      supabase.from('extra_bestellingen')
        .select('id, partner_id, product, prijs_per_stuk, created_at')
        .ilike('product', 'App-advertentie%').eq('status', 'aangevraagd')
        .order('created_at'),
    ])
    setItems((ads.data || []) as AppAd[])
    setPartners((pt.data || []) as PartnerOptie[])
    setAanvragen((av.data || []) as AdAanvraag[])
    setGeladen(true)
  }
  useEffect(() => { laad() }, [])

  const open = (a: AppAd) => { setOpenId(a.id); setDraft(naarDraft(a)); setVanAanvraag(null) }
  const sluit = () => { setOpenId(null); setDraft(leegDraft); setVanAanvraag(null) }

  // aanvraag uit het partnerportal inrichten: formulier voorinvullen
  const richtIn = (av: AdAanvraag) => {
    setOpenId('nieuw')
    setVanAanvraag(av.id)
    setDraft({
      ...leegDraft,
      positie: productNaarPositie(av.product),
      partner_id: av.partner_id,
      prijs: av.prijs_per_stuk != null ? av.prijs_per_stuk.toFixed(2) : '',
    })
  }

  const markeerAfgehandeld = async (av: AdAanvraag, melding = 'Aanvraag afgehandeld.') => {
    await supabase.from('extra_bestellingen').update({ status: 'verwerkt' }).eq('id', av.id)
    flash(melding)
    await laad()
  }
  const huidige = openId && openId !== 'nieuw' ? items.find(i => i.id === openId) : null

  const adverteerder = (a: AppAd): string => {
    if (a.partner_id) return partners.find(p => p.id === a.partner_id)?.bedrijfsnaam || 'Onbekende partner'
    return a.verkocht_aan || 'Eigen promotie'
  }

  const controleer = (): boolean => {
    if (!draft.titel.trim()) { flash('Vul in elk geval een titel in.', 5000); return false }
    if (draft.start_datum && draft.eind_datum && draft.eind_datum < draft.start_datum) {
      flash('De einddatum ligt voor de startdatum. Draai ze even om.', 6000); return false
    }
    if (draft.prijs.trim() && isNaN(parseFloat(draft.prijs.replace(',', '.')))) {
      flash('De prijs is geen geldig bedrag. Gebruik bijvoorbeeld 250 of 250,00.', 6000); return false
    }
    return true
  }

  const maakNieuw = async () => {
    if (!controleer()) return
    setBusy(true)
    const volgorde = Math.max(0, ...items.filter(i => i.positie === draft.positie).map(i => i.volgorde)) + 1
    const { error } = await supabase.from('app_ads').insert({ ...draftNaarRij(draft), volgorde })
    setBusy(false)
    if (error) { flash('Opslaan mislukt: ' + error.message, 7000); return }
    if (vanAanvraag) {
      await supabase.from('extra_bestellingen').update({ status: 'verwerkt' }).eq('id', vanAanvraag)
    }
    flash(draft.actief ? 'Advertentie opgeslagen en actief. De app toont hem binnen de periode.' : 'Advertentie opgeslagen als concept. Zet hem op actief zodra alles klopt.')
    sluit(); await laad()
  }

  const bewaar = async () => {
    if (!huidige || !controleer()) return
    setBusy(true)
    const { error } = await supabase.from('app_ads').update(draftNaarRij(draft)).eq('id', huidige.id)
    setBusy(false)
    if (error) { flash('Opslaan mislukt: ' + error.message, 7000); return }
    flash('Opgeslagen. De app is direct bijgewerkt.')
    sluit(); await laad()
  }

  const verwijder = async (a: AppAd) => {
    if (!confirm(`Advertentie "${a.titel}" definitief verwijderen?\n\nDe advertentie verdwijnt direct uit de app.`)) return
    setBusy(true)
    const { error } = await supabase.from('app_ads').delete().eq('id', a.id)
    setBusy(false)
    if (error) { flash('Verwijderen mislukt: ' + error.message, 7000); return }
    flash('Advertentie verwijderd.')
    if (openId === a.id) sluit()
    await laad()
  }

  const perPositie = useMemo(
    () => POSITIES.map(p => ({ ...p, lijst: items.filter(i => i.positie === p.value) })).filter(g => g.lijst.length > 0),
    [items],
  )
  const totaalCents = useMemo(() => items.reduce((som, a) => som + (a.prijs_cents || 0), 0), [items])
  const heeftPrijzen = items.some(a => a.prijs_cents != null)

  const badge = (s: AdStatus) => (
    <span style={{ display: 'inline-block', padding: '2px 8px', fontSize: '10px', fontWeight: 700, borderRadius: '2px', background: STATUS_KLEUR[s].bg, color: STATUS_KLEUR[s].fg }}>{STATUS_LABEL[s]}</span>
  )

  // ---------- live preview van het app-kaartje ----------
  const preview = (
    <div>
      <label style={AS.label}>Voorbeeld in de app</label>
      <div style={{ maxWidth: '340px', background: '#070A1F', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 6px 18px rgba(7,10,31,0.35)' }}>
        {draft.beeld_url.trim() && (
          <img src={draft.beeld_url.trim()} alt="" style={{ display: 'block', width: '100%', height: '130px', objectFit: 'cover' }} />
        )}
        <div style={{ padding: '14px 16px 16px' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#FEB72A', marginBottom: '8px' }}>Partner</div>
          <div style={{ color: '#FEF1D5', fontWeight: 700, fontSize: '15px', lineHeight: 1.3, marginBottom: '4px' }}>
            {draft.titel.trim() || 'Titel van de advertentie'}
          </div>
          {draft.tekst.trim() && (
            <div style={{ color: 'rgba(254,241,213,0.75)', fontSize: '12px', lineHeight: 1.5, marginBottom: '4px' }}>{draft.tekst.trim()}</div>
          )}
          <span style={{ display: 'inline-block', marginTop: '8px', padding: '7px 16px', background: '#FEB72A', color: '#070A1F', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', borderRadius: '999px' }}>
            {draft.cta_label.trim() || 'Ontdek meer'}
          </span>
        </div>
      </div>
      <div style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
        Zo ziet het kaartje er in de app uit, op de positie {POSITIES.find(p => p.value === draft.positie)?.label}.
      </div>
    </div>
  )

  // ---------- formulier (nieuw en bewerken) ----------
  const formulier = (nieuw: boolean) => (
    <div style={AS.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={AS.cardTitle}>{nieuw ? 'Nieuwe advertentie' : <>Bewerken {huidige && badge(adStatus(huidige))}</>}</div>
        <button style={{ ...AS.btnSm, border: '1px solid #ccc', color: '#666' }} onClick={sluit}>Sluiten</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '28px', alignItems: 'start' }}>
        <div>
          <div style={AS.grid2}>
            <div>
              <label style={AS.label}>Positie in de app</label>
              <select style={AS.input} value={draft.positie} onChange={e => setDraft({ ...draft, positie: e.target.value as Positie })}>
                {POSITIES.map(p => <option key={p.value} value={p.value}>{p.label}: {p.uitleg.toLowerCase()}</option>)}
              </select>
            </div>
            <div>
              <label style={AS.label}>Verkocht aan</label>
              <select style={AS.input} value={draft.partner_id} onChange={e => setDraft({ ...draft, partner_id: e.target.value })}>
                <option value="">Geen partner, vrije naam</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.bedrijfsnaam}</option>)}
              </select>
            </div>
            {!draft.partner_id && (
              <div>
                <label style={AS.label}>Naam adverteerder (vrij)</label>
                <input style={AS.input} value={draft.verkocht_aan} onChange={e => setDraft({ ...draft, verkocht_aan: e.target.value })} placeholder="bijv. Wijnkoperij De Gouden Ton" />
              </div>
            )}
            <div>
              <label style={AS.label}>Titel</label>
              <input style={AS.input} value={draft.titel} onChange={e => setDraft({ ...draft, titel: e.target.value })} placeholder="bijv. Proef onze nieuwe Rioja" />
            </div>
          </div>

          <label style={AS.label}>Tekst (kort)</label>
          <textarea style={{ ...AS.input, height: '60px', resize: 'vertical' }} value={draft.tekst}
            onChange={e => setDraft({ ...draft, tekst: e.target.value })} placeholder="Een of twee korte zinnen. De app houdt het klein." />

          <div style={AS.grid2}>
            <div>
              <label style={AS.label}>Beeld (url, optioneel)</label>
              <input style={AS.input} value={draft.beeld_url} onChange={e => setDraft({ ...draft, beeld_url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <label style={AS.label}>Link (url, optioneel)</label>
              <input style={AS.input} value={draft.link_url} onChange={e => setDraft({ ...draft, link_url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <label style={AS.label}>Knoptekst</label>
              <input style={AS.input} value={draft.cta_label} onChange={e => setDraft({ ...draft, cta_label: e.target.value })} placeholder="Ontdek meer" />
            </div>
            <div>
              <label style={AS.label}>Verkoopprijs (€, optioneel)</label>
              <input style={AS.input} type="text" inputMode="decimal" value={draft.prijs} onChange={e => setDraft({ ...draft, prijs: e.target.value })} placeholder="bijv. 250,00" />
            </div>
            <div>
              <label style={AS.label}>Zichtbaar vanaf (leeg is altijd)</label>
              <input style={AS.input} type="date" value={draft.start_datum} onChange={e => setDraft({ ...draft, start_datum: e.target.value })} />
            </div>
            <div>
              <label style={AS.label}>Zichtbaar tot en met (leeg is altijd)</label>
              <input style={AS.input} type="date" value={draft.eind_datum} onChange={e => setDraft({ ...draft, eind_datum: e.target.value })} />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '18px', cursor: 'pointer', fontSize: '13px', color: 'var(--navy)' }}>
            <input type="checkbox" checked={draft.actief} onChange={e => setDraft({ ...draft, actief: e.target.checked })} style={{ width: '16px', height: '16px', accentColor: 'var(--navy)' }} />
            <span><strong>Actief</strong> <span style={{ color: '#888' }}>(alleen dan toont de app deze advertentie, binnen de periode)</span></span>
          </label>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {nieuw
              ? <button style={AS.btn} onClick={maakNieuw} disabled={busy}>Advertentie opslaan</button>
              : (
                <>
                  <button style={AS.btn} onClick={bewaar} disabled={busy}>Opslaan</button>
                  {huidige && (
                    <button style={{ ...AS.btn, background: 'transparent', color: 'var(--bordeaux)', border: '1px solid var(--bordeaux)' }} onClick={() => verwijder(huidige)} disabled={busy}>Verwijder</button>
                  )}
                </>
              )}
          </div>
        </div>

        {preview}
      </div>
    </div>
  )

  if (!geladen) return <div style={{ padding: '20px', color: '#888' }}>Advertenties laden...</div>

  return (
    <>
      <div style={AS.title}>App-advertenties</div>
      <div style={AS.sub}>
        Verkoop adruimte in de bezoekersapp aan wijnpartners. Een advertentie staat alleen in de app
        als actief aan staat en de datum van vandaag binnen de periode valt.
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Adposities in de app</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {POSITIES.map(p => (
            <div key={p.value}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy)', marginBottom: '2px' }}>{p.label}</div>
              <div style={{ fontSize: '12px', color: '#888' }}>{p.uitleg}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '12px', color: '#888', marginTop: '14px' }}>
          Partners kunnen adruimte zelf aanvragen via Extra bestellen in hun portal
          (de vier App-advertentie-producten in de catalogus). Aanvragen verschijnen hieronder.
        </div>
      </div>

      {aanvragen.length > 0 && (
        <div style={{ ...AS.card, border: '1px solid var(--gold)' }}>
          <div style={AS.cardTitle}>Aanvragen uit het partnerportal ({aanvragen.length})</div>
          <table style={AS.table}>
            <thead><tr>{['Partner', 'Product', 'Prijs', 'Aangevraagd op', ''].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
            <tbody>
              {aanvragen.map(av => (
                <tr key={av.id}>
                  <td style={{ ...AS.td, fontWeight: 600 }}>{partners.find(p => p.id === av.partner_id)?.bedrijfsnaam || 'Onbekende partner'}</td>
                  <td style={AS.td}>{av.product}</td>
                  <td style={AS.td}>{av.prijs_per_stuk != null ? '€' + av.prijs_per_stuk.toFixed(2).replace('.', ',') : '-'}</td>
                  <td style={{ ...AS.td, fontSize: '12px' }}>{new Date(av.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</td>
                  <td style={AS.td}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button style={{ ...AS.btnSm, background: 'var(--navy)', color: 'var(--cream)', borderColor: 'var(--navy)' }} onClick={() => richtIn(av)}>Richt in</button>
                      <button style={AS.btnSm} onClick={() => { if (confirm('Deze aanvraag afhandelen zonder advertentie in te richten?')) markeerAfgehandeld(av) }}>Afhandelen</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
            Richt in vult het formulier alvast met de juiste positie, partner en prijs.
            Na het opslaan wordt de aanvraag automatisch afgehandeld. Neem zelf contact op met de partner voor beeld en tekst.
          </div>
        </div>
      )}

      {openId === 'nieuw' && formulier(true)}
      {huidige && formulier(false)}

      {!openId && (
        <button style={{ ...AS.btn, marginTop: 0, marginBottom: '20px' }} onClick={() => { setOpenId('nieuw'); setDraft(leegDraft) }}>
          + Nieuwe advertentie
        </button>
      )}

      {items.length === 0 && (
        <div style={AS.card}>
          <div style={{ color: '#888', fontSize: '14px' }}>
            Nog geen advertenties. Verkoop de eerste plek aan een wijnpartner.
          </div>
        </div>
      )}

      {perPositie.map(g => (
        <div key={g.value} style={AS.card}>
          <div style={AS.cardTitle}>{g.label} ({g.lijst.length})</div>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>{g.uitleg}</div>
          <table style={AS.table}>
            <thead><tr>{['Titel', 'Adverteerder', 'Periode', 'Prijs', 'Status', ''].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
            <tbody>
              {g.lijst.map(a => (
                <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => open(a)}>
                  <td style={AS.td}><strong>{a.titel}</strong></td>
                  <td style={AS.td}>{adverteerder(a)}</td>
                  <td style={{ ...AS.td, fontSize: '12px' }}>{periodeTekst(a)}</td>
                  <td style={AS.td}>{a.prijs_cents != null ? euro(a.prijs_cents) : '-'}</td>
                  <td style={AS.td}>{badge(adStatus(a))}</td>
                  <td style={{ ...AS.td, whiteSpace: 'nowrap' }}>
                    <button style={AS.btnSm} onClick={e => { e.stopPropagation(); open(a) }}>Bewerken</button>{' '}
                    <button style={{ ...AS.btnSm, borderColor: '#ccc', color: '#666' }} onClick={e => { e.stopPropagation(); verwijder(a) }}>Verwijder</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {heeftPrijzen && (
        <div style={{ ...AS.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ ...AS.cardTitle, marginBottom: 0 }}>Omzet</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--navy)' }}>
            Verkochte adruimte totaal: {euro(totaalCents)}
          </div>
        </div>
      )}
    </>
  )
}

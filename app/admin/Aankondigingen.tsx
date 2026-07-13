'use client'
// Aankondigingen-module: dezelfde workflow als het programma, maar dan voor
// partners: foodtrucks, wijnhuizen en het restaurant. Teksten genereren,
// nalezen, en met één klik aangekondigd op website en in de app. De social
// post maak je direct af in de carousel-generator.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS, carouselUrl } from './ui'

type PartnerRij = {
  id: string; bedrijfsnaam: string; type: string | null; notities: string | null
  publiek_beschrijving: string | null; publiek_foto_url: string | null; social_copy: string | null
  aangekondigd: boolean; aangekondigd_op: string | null; zichtbaar_in_app: boolean
}

const TYPE_LABEL: Record<string, string> = { wijn: 'Wijnhuis', food: 'Foodtruck', restaurant: 'Restaurant' }
// mapping naar de soorten die generate-copy kent
const TYPE_SOORT: Record<string, string> = { wijn: 'wijnhuis', food: 'foodtruck', restaurant: 'restaurant' }

export default function Aankondigingen({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [partners, setPartners] = useState<PartnerRij[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [beschrijving, setBeschrijving] = useState('')
  const [social, setSocial] = useState('')
  const [foto, setFoto] = useState('')
  const [steekwoorden, setSteekwoorden] = useState('')
  const [busy, setBusy] = useState(false)
  const [genBusy, setGenBusy] = useState(false)

  const laad = async () => {
    const { data } = await supabase.from('partners')
      .select('id, bedrijfsnaam, type, notities, publiek_beschrijving, publiek_foto_url, social_copy, aangekondigd, aangekondigd_op, zichtbaar_in_app')
      .order('type').order('bedrijfsnaam')
    setPartners((data || []) as PartnerRij[])
  }
  useEffect(() => { laad() }, [])

  const huidige = partners.find(p => p.id === openId) || null
  const open = (p: PartnerRij) => {
    setOpenId(p.id)
    setBeschrijving(p.publiek_beschrijving || '')
    setSocial(p.social_copy || '')
    setFoto(p.publiek_foto_url || '')
    setSteekwoorden('')
  }
  const sluit = () => setOpenId(null)

  const genereer = async () => {
    if (!huidige) return
    setGenBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-copy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        },
        body: JSON.stringify({
          proeverij: {
            titel: huidige.bedrijfsnaam,
            soort: TYPE_SOORT[huidige.type || ''] || 'overig',
            steekwoorden: steekwoorden.trim() || null,
          },
        }),
      })
      const j = await res.json()
      if (!res.ok) { flash(j.melding || 'Tekstgeneratie is even niet beschikbaar. Je kunt de teksten ook zelf schrijven.', 8000); return }
      setBeschrijving(j.beschrijving)
      setSocial(j.social_copy)
      flash('Teksten gegenereerd. Lees ze na en pas aan waar nodig voordat je de aankondiging live zet.', 7000)
    } catch {
      flash('Tekstgeneratie is even niet bereikbaar. Je kunt de teksten ook zelf schrijven.', 7000)
    } finally {
      setGenBusy(false)
    }
  }

  const bewaar = async (extra: Partial<PartnerRij> = {}, melding = 'Opgeslagen') => {
    if (!huidige) return
    setBusy(true)
    const { error } = await supabase.from('partners').update({
      publiek_beschrijving: beschrijving.trim() || null,
      social_copy: social.trim() || null,
      publiek_foto_url: foto.trim() || null,
      ...extra,
    }).eq('id', huidige.id)
    setBusy(false)
    if (error) { flash('Opslaan mislukt: ' + error.message, 7000); return }
    flash(melding, 6000)
    await laad()
    if ('aangekondigd' in extra) sluit()
  }

  const kondigAan = async () => {
    if (!huidige) return
    if (!beschrijving.trim()) { flash('Zonder beschrijving kan een aankondiging niet live. Genereer of schrijf er een.', 6000); return }
    if (!confirm(`"${huidige.bedrijfsnaam}" aankondigen?\n\nDe partner verschijnt direct op de website en in de app.`)) return
    await bewaar(
      { aangekondigd: true, aangekondigd_op: new Date().toISOString(), zichtbaar_in_app: true } as Partial<PartnerRij>,
      'Aangekondigd. Website en app zijn bijgewerkt; maak de social post af in de carousel-generator.'
    )
  }

  const trekTerug = async () => {
    if (!huidige) return
    if (!confirm(`"${huidige.bedrijfsnaam}" van website en app halen?`)) return
    await bewaar({ aangekondigd: false, zichtbaar_in_app: false } as Partial<PartnerRij>, 'Teruggetrokken. De partner staat niet meer op de site en in de app.')
  }

  const socialTekst = (p: PartnerRij, beschr: string, soc: string) => [
    `${TYPE_LABEL[p.type || ''] || 'Aankondiging'}: ${p.bedrijfsnaam}`,
    soc || beschr,
    'Nacht van de Wijn · 6, 7 en 8 november 2026 · Werkspoorkathedraal Utrecht',
  ].filter(Boolean).join('\n\n')

  const groepen = ['food', 'wijn', 'restaurant'].map(t => ({ type: t, lijst: partners.filter(p => p.type === t) })).filter(g => g.lijst.length > 0)

  return (
    <>
      <div style={AS.title}>Aankondigingen</div>
      <div style={AS.sub}>Kondig foodtrucks, wijnhuizen en het restaurant aan: teksten genereren, nalezen en live op website, app en social. Proeverijen en artiesten kondig je aan via Programma.</div>

      {huidige && (
        <div style={{ ...AS.card, border: '2px solid var(--gold)' }}>
          <div style={AS.cardTitle}>{TYPE_LABEL[huidige.type || ''] || 'Partner'} aankondigen: {huidige.bedrijfsnaam}</div>

          <label style={AS.label}>Steekwoorden voor de tekstgeneratie (keuken, streek, stijl, signatuurgerecht of -wijn)</label>
          <input style={AS.input} value={steekwoorden} onChange={e => setSteekwoorden(e.target.value)}
            placeholder="Bijv. houtoven pizza's, zuurdesem, napolitaans, past bij barbera" />
          <button style={{ ...AS.btnSm, marginTop: '10px' }} onClick={genereer} disabled={genBusy}>
            {genBusy ? 'Bezig met schrijven…' : 'Genereer teksten'}
          </button>

          <label style={AS.label}>Beschrijving (website en app)</label>
          <textarea style={{ ...AS.input, height: '110px', resize: 'vertical' }} value={beschrijving} onChange={e => setBeschrijving(e.target.value)} />

          <label style={AS.label}>Social copy</label>
          <textarea style={{ ...AS.input, height: '70px', resize: 'vertical' }} value={social} onChange={e => setSocial(e.target.value)} />

          <label style={AS.label}>Foto-URL (optioneel)</label>
          <input style={AS.input} value={foto} onChange={e => setFoto(e.target.value)} placeholder="https://…" />

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={AS.btn} onClick={() => bewaar()} disabled={busy}>Opslaan</button>
            {!huidige.aangekondigd && <button style={AS.btnGold} onClick={kondigAan} disabled={busy}>Kondig aan op site en app</button>}
            {huidige.aangekondigd && <button style={{ ...AS.btn, background: 'var(--bordeaux)' }} onClick={trekTerug} disabled={busy}>Haal van site en app</button>}
            <a href={carouselUrl(socialTekst(huidige, beschrijving, social))} target="_blank" rel="noreferrer"
              style={{ ...AS.btnSm, marginTop: '16px', textDecoration: 'none', display: 'inline-block' }}>
              Open in carousel-generator
            </a>
            <button style={{ ...AS.btnSm, marginTop: '16px' }} onClick={sluit}>Sluit</button>
          </div>
        </div>
      )}

      {groepen.map(g => (
        <div key={g.type} style={AS.card}>
          <div style={AS.cardTitle}>{TYPE_LABEL[g.type]}{g.type === 'restaurant' ? '' : 's'} ({g.lijst.length})</div>
          <table style={AS.table}>
            <thead><tr><th style={AS.th}>Naam</th><th style={AS.th}>Status</th><th style={AS.th}>Beschrijving</th><th style={AS.th}></th></tr></thead>
            <tbody>
              {g.lijst.map(p => (
                <tr key={p.id}>
                  <td style={{ ...AS.td, fontWeight: 600 }}>{p.bedrijfsnaam}</td>
                  <td style={AS.td}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', fontSize: '10px', fontWeight: 700, borderRadius: '2px', background: p.aangekondigd ? '#e8f5e9' : '#eceff1', color: p.aangekondigd ? '#2e7d32' : '#546e7a' }}>
                      {p.aangekondigd ? 'Aangekondigd' : 'Nog niet aangekondigd'}
                    </span>
                  </td>
                  <td style={{ ...AS.td, color: '#888', maxWidth: '340px' }}>{p.publiek_beschrijving ? p.publiek_beschrijving.slice(0, 90) + (p.publiek_beschrijving.length > 90 ? '…' : '') : 'Nog geen tekst'}</td>
                  <td style={{ ...AS.td, textAlign: 'right' as const }}>
                    <button style={AS.btnSm} onClick={() => open(p)}>{p.aangekondigd ? 'Bewerk' : 'Kondig aan'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  )
}

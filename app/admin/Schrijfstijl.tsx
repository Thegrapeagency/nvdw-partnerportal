'use client'
// Schrijfstijl: de eigen stem van NvdW vastleggen en er teksten mee maken.
//
// Twee schermen. In de BIBLIOTHEEK leg je de stem vast: voorbeeldteksten
// (waar het model ritme en woordkeuze uit leert) en harde regels. Voorbeelden
// komen binnen via plakken, via een PDF, of doordat je in de generator op
// "deze is goed" klikt. Dat laatste is het vliegwiel: hoe meer je hem
// gebruikt, hoe meer hij naar jullie klinkt.
//
// In GENEREREN kies je een teksttype, koppel je optioneel aan een echt
// programma-item of partner (dan kloppen prijs, tijd en locatie gegarandeerd)
// en krijg je drie varianten.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS, carouselUrl } from './ui'

type Voorbeeld = { id: string; titel: string; tekst: string; kanaal: string | null; bron: string; actief: boolean; created_at: string }
type Regel = { id: string; regel: string; soort: 'altijd' | 'nooit'; volgorde: number; actief: boolean }
type TekstType = { sleutel: string; naam: string; instructie: string; max_woorden: number | null; model: string; volgorde: number; actief: boolean }
type Proeverij = { id: string; titel: string; soort: string | null; status: string }
type Partner = { id: string; bedrijfsnaam: string; type: string | null }
type PdfVondst = { voorbeelden: { titel: string; tekst: string }[]; regels: { regel: string; soort: 'altijd' | 'nooit' }[] }

export default function Schrijfstijl({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [scherm, setScherm] = useState<'genereren' | 'bibliotheek'>('genereren')
  const [voorbeelden, setVoorbeelden] = useState<Voorbeeld[]>([])
  const [regels, setRegels] = useState<Regel[]>([])
  const [types, setTypes] = useState<TekstType[]>([])
  const [proeverijen, setProeverijen] = useState<Proeverij[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [geladen, setGeladen] = useState(false)

  // genereren
  const [typeSleutel, setTypeSleutel] = useState('')
  const [onderwerp, setOnderwerp] = useState('')
  const [steekwoorden, setSteekwoorden] = useState('')
  const [koppeling, setKoppeling] = useState('')
  const [varianten, setVarianten] = useState<string[]>([])
  const [genBusy, setGenBusy] = useState(false)
  const [genInfo, setGenInfo] = useState('')

  // bibliotheek
  const [nieuwVoorbeeld, setNieuwVoorbeeld] = useState({ titel: '', tekst: '', kanaal: '' })
  const [nieuweRegel, setNieuweRegel] = useState<{ regel: string; soort: 'altijd' | 'nooit' }>({ regel: '', soort: 'altijd' })
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfVondst, setPdfVondst] = useState<PdfVondst | null>(null)
  const [pdfKeuze, setPdfKeuze] = useState<Record<string, boolean>>({})

  const laad = async () => {
    const [v, r, t, p, pa] = await Promise.all([
      supabase.from('schrijfstijl_voorbeelden').select('*').order('created_at', { ascending: false }),
      supabase.from('schrijfstijl_regels').select('*').order('volgorde'),
      supabase.from('tekst_types').select('*').eq('actief', true).order('volgorde'),
      supabase.from('proeverijen').select('id, titel, soort, status').order('titel'),
      supabase.from('partners').select('id, bedrijfsnaam, type').order('bedrijfsnaam'),
    ])
    setVoorbeelden((v.data || []) as Voorbeeld[])
    setRegels((r.data || []) as Regel[])
    const tt = (t.data || []) as TekstType[]
    setTypes(tt)
    if (!typeSleutel && tt.length) setTypeSleutel(tt[0].sleutel)
    setProeverijen((p.data || []) as Proeverij[])
    setPartners((pa.data || []) as Partner[])
    setGeladen(true)
  }
  useEffect(() => { laad() }, [])

  const roepFunction = async (payload: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/schrijf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify(payload),
    })
    const j = await res.json().catch(() => ({}))
    return { ok: res.ok, j }
  }

  // ---- genereren ----
  const genereer = async () => {
    if (!typeSleutel) return
    if (!onderwerp.trim() && !koppeling) { flash('Vul een onderwerp in of koppel aan een programma-item.', 6000); return }
    setGenBusy(true); setVarianten([]); setGenInfo('')
    try {
      const [soort, id] = koppeling ? koppeling.split(':') : ['', '']
      const { data: { user } } = await supabase.auth.getUser()
      const { ok, j } = await roepFunction({
        actie: 'genereer',
        type_sleutel: typeSleutel,
        onderwerp: onderwerp.trim(),
        steekwoorden: steekwoorden.trim(),
        proeverij_id: soort === 'proeverij' ? id : undefined,
        partner_id: soort === 'partner' ? id : undefined,
        auteur: user?.email ?? null,
      })
      if (!ok) {
        flash(j.melding || 'Genereren lukte niet: ' + (j.error || 'onbekende fout'), 8000)
        return
      }
      setVarianten(j.varianten || [])
      const stukjes = [`${j.varianten?.length || 0} varianten`, `${j.voorbeelden_gebruikt} voorbeelden gebruikt`, j.model]
      if (j.cache?.gelezen) stukjes.push('stijl uit cache')
      setGenInfo(stukjes.join(' · '))
    } catch (e) {
      flash('Genereren is even niet bereikbaar: ' + (e as Error).message, 8000)
    } finally {
      setGenBusy(false)
    }
  }

  // Het vliegwiel: een goede tekst gaat terug de bibliotheek in, getagd op het
  // kanaal waarvoor hij gemaakt is.
  const legTerug = async (tekst: string) => {
    const type = types.find(t => t.sleutel === typeSleutel)
    const titel = (onderwerp.trim() || type?.naam || 'Gegenereerd').slice(0, 80)
    const { error } = await supabase.from('schrijfstijl_voorbeelden')
      .insert({ titel, tekst, kanaal: typeSleutel, bron: 'gegenereerd' })
    if (error) { flash('Terugleggen mislukte: ' + error.message, 7000); return }
    flash('Toegevoegd aan de bibliotheek. Volgende keer klinkt hij hier weer wat meer naar.', 7000)
    await laad()
  }

  const kopieer = async (tekst: string) => {
    try { await navigator.clipboard.writeText(tekst); flash('Gekopieerd.') }
    catch { flash('Kopiëren lukte niet, selecteer de tekst handmatig.', 6000) }
  }

  // ---- bibliotheek ----
  const voegVoorbeeldToe = async () => {
    if (!nieuwVoorbeeld.titel.trim() || !nieuwVoorbeeld.tekst.trim()) { flash('Titel en tekst zijn allebei nodig.', 5000); return }
    const { error } = await supabase.from('schrijfstijl_voorbeelden').insert({
      titel: nieuwVoorbeeld.titel.trim(),
      tekst: nieuwVoorbeeld.tekst.trim(),
      kanaal: nieuwVoorbeeld.kanaal || null,
      bron: 'handmatig',
    })
    if (error) { flash('Opslaan mislukte: ' + error.message, 7000); return }
    setNieuwVoorbeeld({ titel: '', tekst: '', kanaal: '' })
    flash('Voorbeeld toegevoegd.')
    await laad()
  }

  const wisselVoorbeeld = async (v: Voorbeeld) => {
    await supabase.from('schrijfstijl_voorbeelden').update({ actief: !v.actief }).eq('id', v.id)
    setVoorbeelden(voorbeelden.map(x => x.id === v.id ? { ...x, actief: !v.actief } : x))
  }
  const verwijderVoorbeeld = async (v: Voorbeeld) => {
    if (!confirm(`"${v.titel}" verwijderen uit de bibliotheek?`)) return
    await supabase.from('schrijfstijl_voorbeelden').delete().eq('id', v.id)
    setVoorbeelden(voorbeelden.filter(x => x.id !== v.id))
    flash('Verwijderd.')
  }

  const voegRegelToe = async () => {
    if (!nieuweRegel.regel.trim()) return
    const max = regels.reduce((m, r) => Math.max(m, r.volgorde), 0)
    const { error } = await supabase.from('schrijfstijl_regels')
      .insert({ regel: nieuweRegel.regel.trim(), soort: nieuweRegel.soort, volgorde: max + 10 })
    if (error) { flash('Opslaan mislukte: ' + error.message, 7000); return }
    setNieuweRegel({ regel: '', soort: 'altijd' })
    await laad()
  }
  const wisselRegel = async (r: Regel) => {
    await supabase.from('schrijfstijl_regels').update({ actief: !r.actief }).eq('id', r.id)
    setRegels(regels.map(x => x.id === r.id ? { ...x, actief: !r.actief } : x))
  }
  const verwijderRegel = async (r: Regel) => {
    await supabase.from('schrijfstijl_regels').delete().eq('id', r.id)
    setRegels(regels.filter(x => x.id !== r.id))
  }

  // PDF gaat rechtstreeks naar Claude, die haalt de bruikbare stukken eruit.
  // Jij bepaalt daarna wat er echt in de bibliotheek belandt.
  const leesPdf = async (bestand: File) => {
    if (bestand.size > 25 * 1024 * 1024) { flash('Dit bestand is te groot, houd het onder 25 MB.', 7000); return }
    setPdfBusy(true); setPdfVondst(null); setPdfKeuze({})
    try {
      const buffer = await bestand.arrayBuffer()
      let binair = ''
      const bytes = new Uint8Array(buffer)
      for (let i = 0; i < bytes.length; i += 8192) {
        binair += String.fromCharCode(...bytes.subarray(i, i + 8192))
      }
      const { ok, j } = await roepFunction({ actie: 'pdf', pdf_base64: btoa(binair) })
      if (!ok) { flash(j.melding || 'PDF lezen mislukte: ' + (j.error || 'onbekende fout'), 8000); return }
      const vondst = j as PdfVondst
      if (!vondst.voorbeelden?.length && !vondst.regels?.length) {
        flash('Geen bruikbare teksten of regels in deze PDF gevonden.', 7000); return
      }
      setPdfVondst(vondst)
      const keuze: Record<string, boolean> = {}
      vondst.voorbeelden.forEach((_, i) => { keuze['v' + i] = true })
      vondst.regels.forEach((_, i) => { keuze['r' + i] = true })
      setPdfKeuze(keuze)
    } catch (e) {
      flash('PDF lezen mislukte: ' + (e as Error).message, 8000)
    } finally {
      setPdfBusy(false)
    }
  }

  const bewaarPdfKeuze = async () => {
    if (!pdfVondst) return
    const nieuweVoorbeelden = pdfVondst.voorbeelden
      .filter((_, i) => pdfKeuze['v' + i])
      .map(v => ({ titel: v.titel.slice(0, 120), tekst: v.tekst, kanaal: null, bron: 'pdf' }))
    const maxVolgorde = regels.reduce((m, r) => Math.max(m, r.volgorde), 0)
    const nieuweRegels = pdfVondst.regels
      .filter((_, i) => pdfKeuze['r' + i])
      .map((r, i) => ({ regel: r.regel, soort: r.soort, volgorde: maxVolgorde + 10 * (i + 1) }))

    if (!nieuweVoorbeelden.length && !nieuweRegels.length) { flash('Niets aangevinkt.', 5000); return }
    if (nieuweVoorbeelden.length) {
      const { error } = await supabase.from('schrijfstijl_voorbeelden').insert(nieuweVoorbeelden)
      if (error) { flash('Opslaan mislukte: ' + error.message, 7000); return }
    }
    if (nieuweRegels.length) {
      const { error } = await supabase.from('schrijfstijl_regels').insert(nieuweRegels)
      if (error) { flash('Regels opslaan mislukte: ' + error.message, 7000); return }
    }
    flash(`${nieuweVoorbeelden.length} voorbeelden en ${nieuweRegels.length} regels toegevoegd.`, 7000)
    setPdfVondst(null); setPdfKeuze({})
    await laad()
  }

  if (!geladen) return <div style={{ padding: '20px', color: '#888' }}>Schrijfstijl laden...</div>

  const huidigType = types.find(t => t.sleutel === typeSleutel)
  const actieveVoorbeelden = voorbeelden.filter(v => v.actief).length
  const tabStijl = (aan: boolean): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, letterSpacing: '1px',
    textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
    border: '1px solid', borderColor: aan ? 'var(--navy)' : '#ccc',
    background: aan ? 'var(--navy)' : 'transparent', color: aan ? 'var(--cream)' : 'var(--navy)',
  })

  return (
    <>
      <div style={AS.title}>Schrijfstijl</div>
      <div style={AS.sub}>
        Leg vast hoe wij schrijven en maak er teksten mee. De stem leert van jullie eigen voorbeelden,
        dus hoe meer goede teksten erin staan, hoe beter het wordt.
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button style={tabStijl(scherm === 'genereren')} onClick={() => setScherm('genereren')}>Genereren</button>
        <button style={tabStijl(scherm === 'bibliotheek')} onClick={() => setScherm('bibliotheek')}>
          Bibliotheek ({actieveVoorbeelden})
        </button>
      </div>

      {scherm === 'genereren' && (
        <>
          {actieveVoorbeelden === 0 && (
            <div style={{ ...AS.card, borderLeft: '3px solid var(--gold)' }}>
              <div style={{ fontSize: '13px', color: 'var(--navy)', lineHeight: 1.6 }}>
                Er staan nog geen voorbeeldteksten in de bibliotheek. Genereren werkt al wel, maar op alleen de
                regels. Zet er een stuk of tien goede eigen teksten in en het verschil is meteen hoorbaar.
              </div>
            </div>
          )}

          <div style={AS.card}>
            <div style={AS.cardTitle}>Wat wil je schrijven</div>
            <div style={AS.grid2}>
              <div>
                <label style={AS.label}>Type tekst</label>
                <select style={AS.input} value={typeSleutel} onChange={e => setTypeSleutel(e.target.value)}>
                  {types.map(t => <option key={t.sleutel} value={t.sleutel}>{t.naam}</option>)}
                </select>
              </div>
              <div>
                <label style={AS.label}>Koppelen aan (optioneel)</label>
                <select style={AS.input} value={koppeling} onChange={e => setKoppeling(e.target.value)}>
                  <option value="">Niets, ik vul zelf een onderwerp in</option>
                  {proeverijen.length > 0 && (
                    <optgroup label="Programma">
                      {proeverijen.map(p => <option key={p.id} value={`proeverij:${p.id}`}>{p.titel}</option>)}
                    </optgroup>
                  )}
                  {partners.length > 0 && (
                    <optgroup label="Partners">
                      {partners.map(p => <option key={p.id} value={`partner:${p.id}`}>{p.bedrijfsnaam}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>
            {huidigType && (
              <p style={{ fontSize: '12px', color: '#888', marginTop: '10px', lineHeight: 1.5 }}>
                {huidigType.instructie}
                {huidigType.max_woorden ? ` Maximaal ${huidigType.max_woorden} woorden.` : ''}
              </p>
            )}
            {koppeling && (
              <p style={{ fontSize: '12px', color: '#2e7d32', marginTop: '8px' }}>
                Prijs, tijd en locatie komen rechtstreeks uit de database, die kloppen dus gegarandeerd.
              </p>
            )}

            <label style={AS.label}>Onderwerp {koppeling ? '(aanvullend)' : ''}</label>
            <input style={AS.input} value={onderwerp} onChange={e => setOnderwerp(e.target.value)}
              placeholder={koppeling ? 'Bijvoorbeeld: nog 10 plekken vrij' : 'Waar gaat de tekst over?'} />

            <label style={AS.label}>Steekwoorden (optioneel)</label>
            <input style={AS.input} value={steekwoorden} onChange={e => setSteekwoorden(e.target.value)}
              placeholder="sfeer, invalshoek, wat er zeker in moet" />

            <button style={{ ...AS.btn, opacity: genBusy ? 0.6 : 1 }} onClick={genereer} disabled={genBusy}>
              {genBusy ? 'Schrijven...' : 'Genereer 3 varianten'}
            </button>
            {genInfo && <span style={{ fontSize: '11px', color: '#999', marginLeft: '12px' }}>{genInfo}</span>}
          </div>

          {varianten.map((v, i) => (
            <div key={i} style={{ ...AS.card, borderLeft: '3px solid var(--bordeaux)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#999' }}>
                  Variant {i + 1}
                </span>
                <span style={{ fontSize: '11px', color: '#bbb' }}>{v.split(/\s+/).length} woorden</span>
              </div>
              <div style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--navy)', whiteSpace: 'pre-wrap' }}>{v}</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                <button style={AS.btnSm} onClick={() => kopieer(v)}>Kopieer</button>
                <button style={AS.btnSm} onClick={() => legTerug(v)}>Deze is goed</button>
                <a href={carouselUrl(v)} target="_blank" rel="noopener noreferrer" style={{ ...AS.btnSm, textDecoration: 'none', display: 'inline-block' }}>
                  Naar carousel-generator
                </a>
              </div>
            </div>
          ))}
        </>
      )}

      {scherm === 'bibliotheek' && (
        <>
          <div style={AS.card}>
            <div style={AS.cardTitle}>Voorbeeld toevoegen</div>
            <div style={AS.grid2}>
              <div>
                <label style={AS.label}>Titel</label>
                <input style={AS.input} value={nieuwVoorbeeld.titel}
                  onChange={e => setNieuwVoorbeeld({ ...nieuwVoorbeeld, titel: e.target.value })}
                  placeholder="Waar komt deze tekst vandaan?" />
              </div>
              <div>
                <label style={AS.label}>Kanaal</label>
                <select style={AS.input} value={nieuwVoorbeeld.kanaal}
                  onChange={e => setNieuwVoorbeeld({ ...nieuwVoorbeeld, kanaal: e.target.value })}>
                  <option value="">Alle kanalen</option>
                  {types.map(t => <option key={t.sleutel} value={t.sleutel}>{t.naam}</option>)}
                </select>
              </div>
            </div>
            <label style={AS.label}>Tekst</label>
            <textarea style={{ ...AS.input, height: '140px', resize: 'vertical', lineHeight: 1.6 }}
              value={nieuwVoorbeeld.tekst}
              onChange={e => setNieuwVoorbeeld({ ...nieuwVoorbeeld, tekst: e.target.value })}
              placeholder="Plak hier een tekst van jullie die goed is" />
            <button style={AS.btn} onClick={voegVoorbeeldToe}>Toevoegen</button>
            <p style={{ fontSize: '12px', color: '#999', marginTop: '12px' }}>
              Kies een kanaal als de tekst echt typisch is voor dat kanaal. Twijfel je, laat hem dan op alle
              kanaals staan, dan telt hij overal mee.
            </p>
          </div>

          <div style={AS.card}>
            <div style={AS.cardTitle}>Uit een PDF halen</div>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '14px', lineHeight: 1.6 }}>
              Upload een oude nieuwsbrief, een merkdocument of een programmaboekje. Er wordt uitgelezen wat
              bruikbaar is als voorbeeld of regel, en jij vinkt aan wat er echt in mag.
            </p>
            <input type="file" accept="application/pdf" disabled={pdfBusy}
              onChange={e => { const f = e.target.files?.[0]; if (f) leesPdf(f); e.target.value = '' }}
              style={{ fontSize: '13px' }} />
            {pdfBusy && <div style={{ fontSize: '13px', color: '#888', marginTop: '12px' }}>PDF lezen, dit duurt even...</div>}
          </div>

          {pdfVondst && (
            <div style={{ ...AS.card, borderLeft: '3px solid var(--gold)' }}>
              <div style={AS.cardTitle}>Gevonden in de PDF</div>
              {pdfVondst.voorbeelden.map((v, i) => (
                <label key={'v' + i} style={{ display: 'flex', gap: '10px', marginBottom: '12px', cursor: 'pointer', alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={!!pdfKeuze['v' + i]} style={{ marginTop: '4px' }}
                    onChange={e => setPdfKeuze({ ...pdfKeuze, ['v' + i]: e.target.checked })} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{v.titel}</div>
                    <div style={{ fontSize: '12px', color: '#666', lineHeight: 1.5 }}>{v.tekst.slice(0, 220)}{v.tekst.length > 220 ? '...' : ''}</div>
                  </div>
                </label>
              ))}
              {pdfVondst.regels.length > 0 && (
                <>
                  <div style={{ ...AS.cardTitle, marginTop: '18px' }}>Regels</div>
                  {pdfVondst.regels.map((r, i) => (
                    <label key={'r' + i} style={{ display: 'flex', gap: '10px', marginBottom: '8px', cursor: 'pointer', alignItems: 'center' }}>
                      <input type="checkbox" checked={!!pdfKeuze['r' + i]}
                        onChange={e => setPdfKeuze({ ...pdfKeuze, ['r' + i]: e.target.checked })} />
                      <span style={{ fontSize: '13px' }}>
                        <strong style={{ color: r.soort === 'nooit' ? 'var(--bordeaux)' : '#2e7d32' }}>{r.soort}</strong>
                        {' '}{r.regel}
                      </span>
                    </label>
                  ))}
                </>
              )}
              <button style={AS.btn} onClick={bewaarPdfKeuze}>Aangevinkte toevoegen</button>
              <button style={{ ...AS.btnSm, marginLeft: '10px' }} onClick={() => { setPdfVondst(null); setPdfKeuze({}) }}>Annuleren</button>
            </div>
          )}

          <div style={AS.card}>
            <div style={AS.cardTitle}>Voorbeelden ({voorbeelden.length})</div>
            {voorbeelden.length === 0 ? (
              <div style={{ fontSize: '13px', color: '#888' }}>Nog geen voorbeelden.</div>
            ) : (
              <table style={AS.table}>
                <thead><tr>{['Titel', 'Kanaal', 'Bron', 'Status', ''].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {voorbeelden.map(v => (
                    <tr key={v.id}>
                      <td style={AS.td}>
                        <div style={{ fontWeight: 600 }}>{v.titel}</div>
                        <div style={{ fontSize: '12px', color: '#999' }}>{v.tekst.slice(0, 90)}{v.tekst.length > 90 ? '...' : ''}</div>
                      </td>
                      <td style={AS.td}>{v.kanaal ? (types.find(t => t.sleutel === v.kanaal)?.naam || v.kanaal) : 'Alle'}</td>
                      <td style={AS.td}><span style={{ fontSize: '11px', color: '#999' }}>{v.bron}</span></td>
                      <td style={AS.td}>
                        <span style={{ fontSize: '11px', color: v.actief ? '#2e7d32' : '#bbb' }}>{v.actief ? 'actief' : 'uit'}</span>
                      </td>
                      <td style={AS.td}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button style={AS.btnSm} onClick={() => wisselVoorbeeld(v)}>{v.actief ? 'Uitzetten' : 'Aanzetten'}</button>
                          <button style={AS.btnSm} onClick={() => verwijderVoorbeeld(v)}>Verwijder</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={AS.card}>
            <div style={AS.cardTitle}>Regels</div>
            <table style={AS.table}>
              <thead><tr>{['Soort', 'Regel', 'Status', ''].map(h => <th key={h} style={AS.th}>{h}</th>)}</tr></thead>
              <tbody>
                {regels.map(r => (
                  <tr key={r.id}>
                    <td style={AS.td}>
                      <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: r.soort === 'nooit' ? 'var(--bordeaux)' : '#2e7d32' }}>
                        {r.soort}
                      </span>
                    </td>
                    <td style={AS.td}>{r.regel}</td>
                    <td style={AS.td}><span style={{ fontSize: '11px', color: r.actief ? '#2e7d32' : '#bbb' }}>{r.actief ? 'actief' : 'uit'}</span></td>
                    <td style={AS.td}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button style={AS.btnSm} onClick={() => wisselRegel(r)}>{r.actief ? 'Uitzetten' : 'Aanzetten'}</button>
                        <button style={AS.btnSm} onClick={() => verwijderRegel(r)}>Verwijder</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ ...AS.grid2, marginTop: '16px' }}>
              <div>
                <label style={AS.label}>Nieuwe regel</label>
                <input style={AS.input} value={nieuweRegel.regel}
                  onChange={e => setNieuweRegel({ ...nieuweRegel, regel: e.target.value })}
                  placeholder="Bijvoorbeeld: spreek de lezer aan met je" />
              </div>
              <div>
                <label style={AS.label}>Soort</label>
                <select style={AS.input} value={nieuweRegel.soort}
                  onChange={e => setNieuweRegel({ ...nieuweRegel, soort: e.target.value as 'altijd' | 'nooit' })}>
                  <option value="altijd">Altijd doen</option>
                  <option value="nooit">Nooit doen</option>
                </select>
              </div>
            </div>
            <button style={AS.btn} onClick={voegRegelToe}>Regel toevoegen</button>
          </div>
        </>
      )}
    </>
  )
}

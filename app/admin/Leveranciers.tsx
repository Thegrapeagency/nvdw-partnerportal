'use client'
// Leveranciers: alles wat we inkopen, van eerste contact tot bezorging op
// locatie. Eén scherm met een statuskolom (waar staat het), de afspraken
// (bezorgen en ophalen) en het geld (offerte en begrotingspost). Vanuit hier
// zet je met één klik dingen door naar het draaiboek en de begroting, zodat je
// het niet twee keer hoeft in te typen.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS, euro } from './ui'

type Status = 'prospect' | 'benaderd' | 'offerte_aangevraagd' | 'offerte_binnen' | 'geboekt' | 'geleverd' | 'afgewezen'
type Dag = 'ervoor' | 'fri' | 'sat' | 'sun' | 'erna'

type Leverancier = {
  id: string
  bedrijfsnaam: string
  categorie: string | null
  status: Status
  contact_naam: string | null
  contact_email: string | null
  contact_telefoon: string | null
  website: string | null
  opmerkingen: string | null
  bezorg_dag: Dag | null
  bezorg_tijd: string | null
  bezorg_locatie: string | null
  afhaal_dag: Dag | null
  afhaal_tijd: string | null
  offerte_bedrag: number | null
  budget_post_id: string | null
  laatste_contact: string | null
}

type Bijlage = {
  id: string; leverancier_id: string; naam: string; bestandsnaam: string
  storage_path: string; soort: string; geupload_door: string | null; created_at: string
}

type Post = { id: string; naam: string; categorie: string; type: string }

const STATUS_VOLGORDE: Status[] = ['prospect', 'benaderd', 'offerte_aangevraagd', 'offerte_binnen', 'geboekt', 'geleverd', 'afgewezen']
const STATUS_LABEL: Record<Status, string> = {
  prospect: 'Nog benaderen',
  benaderd: 'Benaderd',
  offerte_aangevraagd: 'Offerte aangevraagd',
  offerte_binnen: 'Offerte binnen',
  geboekt: 'Geboekt',
  geleverd: 'Geleverd',
  afgewezen: 'Afgevallen',
}
const STATUS_KLEUR: Record<Status, string> = {
  prospect: '#9e9e9e', benaderd: '#546e7a', offerte_aangevraagd: '#9c7a1e',
  offerte_binnen: '#0277bd', geboekt: '#2e7d32', geleverd: '#1b5e20', afgewezen: '#b71c1c',
}
const DAGEN: { value: Dag; label: string }[] = [
  { value: 'ervoor', label: 'Voor het weekend' },
  { value: 'fri', label: 'Vrijdag 6 nov' },
  { value: 'sat', label: 'Zaterdag 7 nov' },
  { value: 'sun', label: 'Zondag 8 nov' },
  { value: 'erna', label: 'Na het weekend' },
]
const CATEGORIEEN = ['techniek', 'meubilair', 'sanitair', 'beveiliging', 'transport', 'decoratie', 'catering', 'schoonmaak', 'overig']
const BIJLAGE_TYPES = '.pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.xls,.xlsx,.txt'
const MAX_BIJLAGE = 25 * 1024 * 1024

const leeg = {
  bedrijfsnaam: '', categorie: 'techniek', contact_naam: '', contact_email: '', contact_telefoon: '',
}

const euroTekst = (n: number | null) => n == null ? '-' : '€' + Number(n).toFixed(2).replace('.', ',')
const dagLabel = (d: Dag | null) => DAGEN.find(x => x.value === d)?.label || ''

export default function Leveranciers({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [lijst, setLijst] = useState<Leverancier[]>([])
  const [bijlagen, setBijlagen] = useState<Bijlage[]>([])
  const [posten, setPosten] = useState<Post[]>([])
  const [geladen, setGeladen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [nieuwOpen, setNieuwOpen] = useState(false)
  const [nieuw, setNieuw] = useState(leeg)
  const [zoek, setZoek] = useState('')
  const [filter, setFilter] = useState<Status | 'alle'>('alle')
  const [uploadBezig, setUploadBezig] = useState<string | null>(null)

  const laad = async () => {
    const [l, b, p] = await Promise.all([
      supabase.from('leveranciers').select('*').order('bedrijfsnaam'),
      supabase.from('leverancier_bijlagen').select('*').order('created_at', { ascending: false }),
      supabase.from('budget_posten').select('id, naam, categorie, type').eq('type', 'kosten').order('categorie').order('naam'),
    ])
    if (l.error) { flash('Leveranciers laden mislukt: ' + l.error.message, 7000); return }
    setLijst((l.data || []) as Leverancier[])
    setBijlagen((b.data || []) as Bijlage[])
    setPosten((p.data || []) as Post[])
    setGeladen(true)
  }
  useEffect(() => { laad() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const bijlagenVan = (id: string) => bijlagen.filter(x => x.leverancier_id === id)
  const postVan = (id: string | null) => posten.find(p => p.id === id)

  const wijzig = async (id: string, patch: Partial<Leverancier>) => {
    const { error } = await supabase.from('leveranciers').update(patch).eq('id', id)
    if (error) { flash('Opslaan mislukt: ' + error.message, 6000); return }
    setLijst(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l))
  }

  const voegToe = async () => {
    if (!nieuw.bedrijfsnaam.trim()) { flash('Geef de leverancier een naam.', 5000); return }
    const { data, error } = await supabase.from('leveranciers').insert({
      bedrijfsnaam: nieuw.bedrijfsnaam.trim(),
      categorie: nieuw.categorie,
      contact_naam: nieuw.contact_naam.trim() || null,
      contact_email: nieuw.contact_email.trim() || null,
      contact_telefoon: nieuw.contact_telefoon.trim() || null,
    }).select().single()
    if (error) { flash('Toevoegen mislukt: ' + error.message, 6000); return }
    setLijst(ls => [...ls, data as Leverancier].sort((a, b) => a.bedrijfsnaam.localeCompare(b.bedrijfsnaam)))
    setNieuw(leeg)
    setNieuwOpen(false)
    setOpenId((data as Leverancier).id)
    flash(`${(data as Leverancier).bedrijfsnaam} toegevoegd`)
  }

  const verwijder = async (l: Leverancier) => {
    const n = bijlagenVan(l.id)
    if (!confirm(`"${l.bedrijfsnaam}" verwijderen?${n.length ? `\n\nDe ${n.length} bijlage${n.length === 1 ? '' : 'n'} verdwijnt ook.` : ''}`)) return
    const { error } = await supabase.from('leveranciers').delete().eq('id', l.id)
    if (error) { flash('Verwijderen mislukt: ' + error.message, 6000); return }
    if (n.length) await supabase.storage.from('begroting').remove(n.map(x => x.storage_path))
    setLijst(ls => ls.filter(x => x.id !== l.id))
    setBijlagen(bs => bs.filter(x => x.leverancier_id !== l.id))
    if (openId === l.id) setOpenId(null)
  }

  // ---------- bijlagen ----------
  const uploadBijlage = async (l: Leverancier, file: File, soort: string) => {
    if (file.size > MAX_BIJLAGE) { flash(`"${file.name}" is te groot. Maximaal 25 MB.`, 7000); return }
    setUploadBezig(l.id)
    const veilig = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `leverancier/${l.id}/${Date.now()}_${veilig}`
    const { error: upFout } = await supabase.storage.from('begroting').upload(path, file)
    if (upFout) { flash('Uploaden mislukt: ' + upFout.message, 7000); setUploadBezig(null); return }
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('leverancier_bijlagen').insert({
      leverancier_id: l.id, naam: file.name, bestandsnaam: file.name,
      storage_path: path, soort, geupload_door: user?.email || null,
    }).select().single()
    if (error) {
      // Bestand staat er wel, rij niet: opruimen zodat er geen wees achterblijft.
      await supabase.storage.from('begroting').remove([path])
      flash('Bijlage opslaan mislukt: ' + error.message, 7000)
      setUploadBezig(null); return
    }
    setBijlagen(bs => [data as Bijlage, ...bs])
    setUploadBezig(null)
    flash(`${file.name} toegevoegd bij ${l.bedrijfsnaam}`)
    // Een offerte betekent bijna altijd dat de status verder is.
    if (soort === 'offerte' && (l.status === 'prospect' || l.status === 'benaderd' || l.status === 'offerte_aangevraagd')) {
      await wijzig(l.id, { status: 'offerte_binnen' })
    }
  }

  const openBijlage = async (b: Bijlage) => {
    const { data, error } = await supabase.storage.from('begroting').createSignedUrl(b.storage_path, 120)
    if (error || !data?.signedUrl) { flash('Openen mislukt: ' + (error?.message || 'geen link'), 6000); return }
    window.open(data.signedUrl, '_blank')
  }

  const verwijderBijlage = async (b: Bijlage) => {
    if (!confirm(`Bijlage "${b.naam}" verwijderen?`)) return
    const { error } = await supabase.from('leverancier_bijlagen').delete().eq('id', b.id)
    if (error) { flash('Verwijderen mislukt: ' + error.message, 6000); return }
    await supabase.storage.from('begroting').remove([b.storage_path])
    setBijlagen(bs => bs.filter(x => x.id !== b.id))
  }

  // ---------- doorzetten naar draaiboek en begroting ----------
  const naarDraaiboek = async (l: Leverancier, welke: 'bezorg' | 'afhaal') => {
    const dag = welke === 'bezorg' ? l.bezorg_dag : l.afhaal_dag
    const tijd = welke === 'bezorg' ? l.bezorg_tijd : l.afhaal_tijd
    if (!dag) { flash(`Vul eerst in wanneer er ${welke === 'bezorg' ? 'bezorgd' : 'opgehaald'} wordt.`, 6000); return }
    // Het draaiboek kent alleen de drie festivaldagen. Ervoor en erna hebben
    // daar geen kolom, die komen onder Algemeen te staan.
    const dbDag = (dag === 'fri' || dag === 'sat' || dag === 'sun') ? dag : null
    const titel = welke === 'bezorg' ? `Bezorging ${l.bedrijfsnaam}` : `Ophalen ${l.bedrijfsnaam}`
    // Twee keer klikken is zo gebeurd, en dan staat het er dubbel in.
    const { data: bestaat } = await supabase.from('draaiboek_momenten').select('id').eq('titel', titel).limit(1)
    if (bestaat && bestaat.length > 0 && !confirm(`"${titel}" staat al in het draaiboek.\n\nToch nog een keer toevoegen?`)) return
    const losseDag = dbDag ? '' : `${dagLabel(dag)}. `
    const { error } = await supabase.from('draaiboek_momenten').insert({
      dag: dbDag,
      tijd: tijd || null,
      titel,
      locatie: l.bezorg_locatie || null,
      verantwoordelijke: l.contact_naam || null,
      opmerking: `${losseDag}${l.contact_naam || ''}${l.contact_telefoon ? ' · ' + l.contact_telefoon : ''}`.trim() || null,
      volgorde: 999,
    })
    if (error) { flash('In draaiboek zetten mislukt: ' + error.message, 7000); return }
    flash(`"${titel}" staat in het draaiboek${dbDag ? '' : ' onder Algemeen'}.`, 8000)
  }

  const contactNaarDraaiboek = async (l: Leverancier) => {
    if (!l.contact_naam && !l.contact_telefoon) { flash('Vul eerst een contactpersoon of telefoonnummer in.', 6000); return }
    const naam = l.contact_naam || l.bedrijfsnaam
    const { data: bestaat } = await supabase.from('draaiboek_contacten').select('id').eq('naam', naam).limit(1)
    if (bestaat && bestaat.length > 0 && !confirm(`${naam} staat al bij de draaiboekcontacten.\n\nToch nog een keer toevoegen?`)) return
    const { error } = await supabase.from('draaiboek_contacten').insert({
      naam,
      rol: `${l.bedrijfsnaam}${l.categorie ? ' · ' + l.categorie : ''}`,
      telefoon: l.contact_telefoon || null,
      email: l.contact_email || null,
      opmerking: l.opmerkingen || null,
      volgorde: 999,
    })
    if (error) { flash('Toevoegen mislukt: ' + error.message, 7000); return }
    flash(`${l.contact_naam || l.bedrijfsnaam} staat bij de draaiboekcontacten.`, 7000)
  }

  const naarBegroting = async (l: Leverancier) => {
    if (!l.budget_post_id) { flash('Kies eerst onder welke begrotingspost dit valt.', 6000); return }
    if (!l.offerte_bedrag) { flash('Vul eerst het offertebedrag in.', 6000); return }
    const post = postVan(l.budget_post_id)
    const { data: bestaat } = await supabase.from('budget_boekingen')
      .select('id, bedrag_cents').eq('leverancier', l.bedrijfsnaam).limit(1)
    const alGeboekt = bestaat && bestaat.length > 0
    if (!confirm(
      `${euroTekst(l.offerte_bedrag)} van ${l.bedrijfsnaam} als verwachte kosten boeken onder "${post?.naam}"?` +
      (alGeboekt ? `\n\nLet op: er staat al een boeking van ${l.bedrijfsnaam} in de begroting. Zo krijg je hem er twee keer in.` : '')
    )) return
    const { error } = await supabase.from('budget_boekingen').insert({
      post_id: l.budget_post_id,
      omschrijving: `Offerte ${l.bedrijfsnaam}`,
      leverancier: l.bedrijfsnaam,
      bedrag_cents: Math.round(Number(l.offerte_bedrag) * 100),
      datum: new Date().toISOString().slice(0, 10),
      status: 'verwacht',
    })
    if (error) { flash('Boeken mislukt: ' + error.message, 7000); return }
    flash(`Geboekt onder ${post?.naam}. Je ziet het terug bij Begroting & kosten als toegezegd bedrag.`, 9000)
    if (l.status === 'offerte_binnen') await wijzig(l.id, { status: 'geboekt' })
  }

  // ---------- afgeleiden ----------
  const zichtbaar = useMemo(() => {
    const t = zoek.trim().toLowerCase()
    return lijst
      .filter(l => filter === 'alle' || l.status === filter)
      .filter(l => !t || (l.bedrijfsnaam + ' ' + (l.categorie || '') + ' ' + (l.contact_naam || '')).toLowerCase().includes(t))
  }, [lijst, filter, zoek])

  const totalen = useMemo(() => {
    const open = lijst.filter(l => l.status !== 'afgewezen')
    return {
      aantal: lijst.length,
      teBenaderen: lijst.filter(l => l.status === 'prospect').length,
      wachtOpOfferte: lijst.filter(l => l.status === 'offerte_aangevraagd').length,
      geboekt: open.filter(l => l.status === 'geboekt' || l.status === 'geleverd').reduce((s, l) => s + Number(l.offerte_bedrag || 0), 0),
      inOfferte: open.filter(l => l.status === 'offerte_binnen').reduce((s, l) => s + Number(l.offerte_bedrag || 0), 0),
    }
  }, [lijst])

  if (!geladen) return <div style={{ padding: '20px', color: '#888' }}>Leveranciers laden...</div>

  const veld = (label: string, waarde: string | number | null, opBlur: (v: string) => void, extra?: React.CSSProperties, type = 'text', placeholder?: string) => (
    <div>
      <label style={AS.label}>{label}</label>
      <input style={{ ...AS.input, ...extra }} type={type} defaultValue={waarde ?? ''} placeholder={placeholder}
        onBlur={e => opBlur(e.target.value)} />
    </div>
  )

  return (
    <>
      <div style={AS.title}>Leveranciers</div>
      <div style={AS.sub}>
        Van eerste contact tot bezorging op locatie. Zet bezorg- en ophaalmomenten met één klik in het draaiboek,
        en een binnengekomen offerte als verwachte kosten in de begroting.
      </div>

      {/* Grote cijfers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '18px' }}>
        {[
          ['Leveranciers', String(totalen.aantal), 'in beeld'],
          ['Nog benaderen', String(totalen.teBenaderen), 'staan op de lijst'],
          ['Wacht op offerte', String(totalen.wachtOpOfferte), 'aangevraagd, nog niets binnen'],
          ['Geboekt', euroTekst(totalen.geboekt), 'vastgelegd bij leveranciers'],
          ['Offertes open', euroTekst(totalen.inOfferte), 'binnen, nog niet geboekt'],
        ].map(([l, v, s]) => (
          <div key={l} style={{ background: 'var(--card)', borderRadius: '10px', border: '1px solid rgba(1,3,65,0.08)', padding: '12px 14px' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999' }}>{l}</div>
            <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '20px', fontWeight: 700, color: 'var(--navy)', margin: '3px 0 2px' }}>{v}</div>
            <div style={{ fontSize: '10px', color: '#999' }}>{s}</div>
          </div>
        ))}
      </div>

      <div style={AS.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input style={{ ...AS.input, width: '200px', padding: '7px 10px', fontSize: '13px' }}
              placeholder="Zoek leverancier..." value={zoek} onChange={e => setZoek(e.target.value)} />
            <select style={{ ...AS.input, width: '190px', padding: '7px 10px', fontSize: '13px' }}
              value={filter} onChange={e => setFilter(e.target.value as Status | 'alle')}>
              <option value="alle">Alle statussen</option>
              {STATUS_VOLGORDE.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <button style={AS.btnSm} onClick={() => setNieuwOpen(o => !o)}>
            {nieuwOpen ? 'Sluit' : '+ Leverancier toevoegen'}
          </button>
        </div>

        {nieuwOpen && (
          <div style={{ background: '#f7f4ec', borderRadius: '8px', padding: '16px', marginBottom: '18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div>
                <label style={AS.label}>Bedrijfsnaam</label>
                <input style={AS.input} value={nieuw.bedrijfsnaam} onChange={e => setNieuw({ ...nieuw, bedrijfsnaam: e.target.value })}
                  placeholder="bijv. Van Dijk Verhuur" />
              </div>
              <div>
                <label style={AS.label}>Categorie</label>
                <select style={AS.input} value={nieuw.categorie} onChange={e => setNieuw({ ...nieuw, categorie: e.target.value })}>
                  {CATEGORIEEN.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={AS.label}>Contactpersoon</label>
                <input style={AS.input} value={nieuw.contact_naam} onChange={e => setNieuw({ ...nieuw, contact_naam: e.target.value })}
                  placeholder="voor- en achternaam" />
              </div>
              <div>
                <label style={AS.label}>E-mailadres</label>
                <input style={AS.input} value={nieuw.contact_email} onChange={e => setNieuw({ ...nieuw, contact_email: e.target.value })}
                  placeholder="naam@bedrijf.nl" />
              </div>
              <div>
                <label style={AS.label}>Telefoon</label>
                <input style={AS.input} value={nieuw.contact_telefoon} onChange={e => setNieuw({ ...nieuw, contact_telefoon: e.target.value })}
                  placeholder="06..." />
              </div>
            </div>
            <button style={AS.btn} onClick={voegToe}>Toevoegen</button>
          </div>
        )}

        {zichtbaar.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#999' }}>
            {lijst.length === 0 ? 'Nog geen leveranciers. Voeg de eerste toe met de knop hierboven.' : 'Geen leverancier gevonden met dit filter.'}
          </p>
        ) : (
          <table style={AS.table}>
            <thead><tr>
              <th style={AS.th}>Bedrijf</th><th style={AS.th}>Categorie</th><th style={AS.th}>Status</th>
              <th style={AS.th}>Contact</th><th style={AS.th}>Bezorging</th>
              <th style={{ ...AS.th, textAlign: 'right' as const }}>Offerte</th><th style={AS.th}></th>
            </tr></thead>
            <tbody>
              {zichtbaar.map(l => (
                <tr key={l.id}>
                  <td style={{ ...AS.td, fontWeight: 600 }}>
                    {l.bedrijfsnaam}
                    {bijlagenVan(l.id).length > 0 && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#999' }}>📎 {bijlagenVan(l.id).length}</span>}
                  </td>
                  <td style={{ ...AS.td, color: '#888' }}>{l.categorie || '-'}</td>
                  <td style={AS.td}>
                    <select value={l.status} onChange={e => wijzig(l.id, { status: e.target.value as Status })}
                      style={{ padding: '3px 6px', fontSize: '11px', fontWeight: 600, border: '1px solid #ddd', borderRadius: '2px', background: '#fff', color: STATUS_KLEUR[l.status], cursor: 'pointer' }}>
                      {STATUS_VOLGORDE.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td style={{ ...AS.td, fontSize: '12px' }}>
                    {l.contact_naam || '-'}
                    {l.contact_telefoon && <div style={{ color: '#999', fontSize: '11px' }}>{l.contact_telefoon}</div>}
                  </td>
                  <td style={{ ...AS.td, fontSize: '12px', color: l.bezorg_dag ? 'var(--navy)' : '#ccc' }}>
                    {l.bezorg_dag ? `${dagLabel(l.bezorg_dag)}${l.bezorg_tijd ? ' ' + l.bezorg_tijd : ''}` : 'nog niet gepland'}
                  </td>
                  <td style={{ ...AS.td, textAlign: 'right' as const, fontWeight: 600 }}>{euroTekst(l.offerte_bedrag)}</td>
                  <td style={{ ...AS.td, textAlign: 'right' as const }}>
                    <button style={AS.btnSm} onClick={() => setOpenId(openId === l.id ? null : l.id)}>
                      {openId === l.id ? 'Sluit' : 'Open'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail */}
      {openId && (() => {
        const l = lijst.find(x => x.id === openId)
        if (!l) return null
        const mijnBijlagen = bijlagenVan(l.id)
        const post = postVan(l.budget_post_id)
        return (
          <div style={{ ...AS.card, border: '2px solid var(--gold)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '10px' }}>
              <div style={AS.cardTitle}>{l.bedrijfsnaam}</div>
              <button style={{ ...AS.btnSm, borderColor: 'var(--bordeaux)' }} onClick={() => verwijder(l)}>Verwijder leverancier</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
              {veld('Bedrijfsnaam', l.bedrijfsnaam, v => v.trim() && wijzig(l.id, { bedrijfsnaam: v.trim() }))}
              <div>
                <label style={AS.label}>Categorie</label>
                <select style={AS.input} value={l.categorie || 'overig'} onChange={e => wijzig(l.id, { categorie: e.target.value })}>
                  {CATEGORIEEN.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {veld('Contactpersoon', l.contact_naam, v => wijzig(l.id, { contact_naam: v || null }))}
              {veld('E-mailadres', l.contact_email, v => wijzig(l.id, { contact_email: v || null }))}
              {veld('Telefoon', l.contact_telefoon, v => wijzig(l.id, { contact_telefoon: v || null }))}
              {veld('Website', l.website, v => wijzig(l.id, { website: v || null }), undefined, 'text', 'https://')}
              {veld('Laatste contact', l.laatste_contact, v => wijzig(l.id, { laatste_contact: v || null }), undefined, 'date')}
            </div>

            <label style={AS.label}>Opmerkingen</label>
            <textarea style={{ ...AS.input, height: '90px', resize: 'vertical' as const }}
              key={l.id + '-opm'} defaultValue={l.opmerkingen || ''}
              placeholder="Alles wat handig is om te weten: afspraken, voorwaarden, waar je op moet letten."
              onBlur={e => wijzig(l.id, { opmerkingen: e.target.value || null })} />

            {/* Bezorgen en ophalen */}
            <div style={{ background: '#f7f4ec', borderRadius: '8px', padding: '14px 16px', marginTop: '18px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#999', marginBottom: '10px' }}>
                Bezorgen en ophalen
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={AS.label}>Bezorgdag</label>
                  <select style={AS.input} value={l.bezorg_dag || ''} onChange={e => wijzig(l.id, { bezorg_dag: (e.target.value || null) as Dag | null })}>
                    <option value="">nog niet bekend</option>
                    {DAGEN.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                {veld('Bezorgtijd', l.bezorg_tijd, v => wijzig(l.id, { bezorg_tijd: v || null }), undefined, 'text', 'bijv. 09:00')}
                {veld('Bezorglocatie', l.bezorg_locatie, v => wijzig(l.id, { bezorg_locatie: v || null }), undefined, 'text', 'bijv. laadperron achter')}
                <div>
                  <label style={AS.label}>Ophaaldag</label>
                  <select style={AS.input} value={l.afhaal_dag || ''} onChange={e => wijzig(l.id, { afhaal_dag: (e.target.value || null) as Dag | null })}>
                    <option value="">nog niet bekend</option>
                    {DAGEN.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                {veld('Ophaaltijd', l.afhaal_tijd, v => wijzig(l.id, { afhaal_tijd: v || null }), undefined, 'text', 'bijv. 10:00')}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                <button style={AS.btnSm} onClick={() => naarDraaiboek(l, 'bezorg')}>Bezorging in draaiboek</button>
                <button style={AS.btnSm} onClick={() => naarDraaiboek(l, 'afhaal')}>Ophalen in draaiboek</button>
                <button style={AS.btnSm} onClick={() => contactNaarDraaiboek(l)}>Contact bij draaiboekcontacten</button>
              </div>
              <div style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
                Dit maakt er een los moment van in het draaiboek. Verandert de tijd later, pas hem dan ook daar aan.
              </div>
            </div>

            {/* Financieel */}
            <div style={{ background: '#f7f4ec', borderRadius: '8px', padding: '14px 16px', marginTop: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#999', marginBottom: '10px' }}>
                Financieel
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
                {veld('Offertebedrag € (excl. btw)', l.offerte_bedrag, v => wijzig(l.id, { offerte_bedrag: v ? Number(v.replace(',', '.')) : null }), undefined, 'number')}
                <div>
                  <label style={AS.label}>Valt onder begrotingspost</label>
                  <select style={AS.input} value={l.budget_post_id || ''} onChange={e => wijzig(l.id, { budget_post_id: e.target.value || null })}>
                    <option value="">nog niet gekoppeld</option>
                    {posten.map(p => <option key={p.id} value={p.id}>{p.categorie} · {p.naam}</option>)}
                  </select>
                </div>
              </div>
              <button style={{ ...AS.btnSm, marginTop: '12px' }} onClick={() => naarBegroting(l)}>Zet offerte in de begroting</button>
              <div style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
                {post
                  ? `Komt als toegezegd bedrag onder "${post.naam}" te staan, met ${l.bedrijfsnaam} als leverancier.`
                  : 'Kies eerst een begrotingspost, dan kun je het offertebedrag doorzetten.'}
              </div>
            </div>

            {/* Offertes en documenten */}
            <div style={{ background: '#f7f4ec', borderRadius: '8px', padding: '14px 16px', marginTop: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#999', marginBottom: '10px' }}>
                Offertes en documenten
              </div>
              {mijnBijlagen.length === 0 && (
                <div style={{ fontSize: '12px', color: '#999', marginBottom: '10px' }}>Nog niets geüpload.</div>
              )}
              {mijnBijlagen.map(b => (
                <div key={b.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #eee5d0', fontSize: '12px' }}>
                  <span style={{ width: '64px', flexShrink: 0, fontWeight: 700, color: 'var(--bordeaux)', textTransform: 'capitalize' }}>{b.soort}</span>
                  <button onClick={() => openBijlage(b)}
                    style={{ flex: 1, textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--navy)', textDecoration: 'underline', fontSize: '12px', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.naam}
                  </button>
                  <span style={{ color: '#bbb', flexShrink: 0, fontSize: '11px' }}>
                    {new Date(b.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                  </span>
                  <button style={{ ...AS.btnSm, padding: '1px 6px', fontSize: '9px' }} onClick={() => verwijderBijlage(b)}>x</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
                <select id={`soort-lev-${l.id}`} defaultValue="offerte" style={{ ...AS.input, width: '120px', padding: '5px 8px', fontSize: '12px' }}>
                  {['offerte', 'factuur', 'contract', 'bon', 'overig'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <label style={{ ...AS.btnSm, cursor: uploadBezig === l.id ? 'wait' : 'pointer', opacity: uploadBezig === l.id ? 0.6 : 1, margin: 0 }}>
                  {uploadBezig === l.id ? 'Bezig met uploaden…' : '+ Bestand kiezen'}
                  <input type="file" accept={BIJLAGE_TYPES} disabled={uploadBezig === l.id} style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      const keuze = (document.getElementById(`soort-lev-${l.id}`) as HTMLSelectElement | null)?.value || 'offerte'
                      e.target.value = ''
                      if (file) uploadBijlage(l, file, keuze)
                    }} />
                </label>
                <span style={{ fontSize: '10px', color: '#bbb' }}>pdf, foto, word of excel · max 25 MB</span>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}

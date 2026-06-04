'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Partner, PartnerVraag } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const PAKKET_LABELS: Record<string, string> = {
  branded_bar: 'Branded Bar',
  own_bar: 'Own Bar',
  restaurant_host: 'Restaurant Host',
  entrance_host: 'Entrance Host',
  silent_disco: 'Silent Disco',
}

export default function AdminPage() {
  const router = useRouter()
  const [partners, setPartners] = useState<Partner[]>([])
  const [vragen, setVragen] = useState<PartnerVraag[]>([])
  const [activeTab, setActiveTab] = useState('partners')
  const [loading, setLoading] = useState(true)
  const [saveMsg, setSaveMsg] = useState('')
  const [exportLoading, setExportLoading] = useState(false)
  const [newPartner, setNewPartner] = useState({
    naam: '', bedrijfsnaam: '', email: '', pakket: 'own_bar', avond: 'alle', gratis_tickets: '20', afdracht_percentage: '25', barlocatie: '', notities: ''
  })
  const [antwoordMap, setAntwoordMap] = useState<Record<string, string>>({})

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) { router.push('/'); return }
      const [{ data: p }, { data: v }] = await Promise.all([
        supabase.from('partners').select('*').order('created_at', { ascending: false }),
        supabase.from('partner_vragen').select('*').order('created_at', { ascending: false }),
      ])
      setPartners(p || [])
      setVragen(v || [])
      setLoading(false)
    }
    init()
  }, [router])

  const handleExportTactile = async () => {
    setExportLoading(true)
    // Haal alle wijnlijsten op met partner info
    const { data: wijnen } = await supabase
      .from('wijnlijst')
      .select('*, partners(bedrijfsnaam, pakket, avond, barlocatie)')
      .order('partner_id')
      .order('volgorde')

    if (!wijnen || wijnen.length === 0) {
      setSaveMsg('Geen wijnen gevonden om te exporteren.')
      setExportLoading(false)
      setTimeout(() => setSaveMsg(''), 3000)
      return
    }

    // Bouw CSV op — kolommen aanpassen zodra Tactile formaat bekend is
    const headers = [
      'Partner',
      'Pakket',
      'Avond',
      'Barlocatie',
      'Wijn naam',
      'Producent',
      'Regio',
      'Land',
      'Druif',
      'Jaar',
      'Prijs half glas (€)',
      'Prijs heel glas (€)',
      'Prijs fles (€)',
      'Omschrijving',
    ]

    const rows = wijnen.map((w: any) => [
      w.partners?.bedrijfsnaam || '',
      PAKKET_LABELS[w.partners?.pakket] || w.partners?.pakket || '',
      w.partners?.avond || '',
      w.partners?.barlocatie || '',
      w.naam || '',
      w.producent || '',
      w.regio || '',
      w.land || '',
      w.druif || '',
      w.jaar || '',
      w.prijs_half_glas?.toFixed(2) || '',
      w.prijs_heel_glas?.toFixed(2) || '',
      w.prijs_fles?.toFixed(2) || '',
      w.beschrijving || '',
    ])

    const csvContent = [headers, ...rows]
      .map(row => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    // Download triggeren
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `NvdW2026_wijnlijst_tactile_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setSaveMsg(`Export klaar — ${wijnen.length} wijnen van ${new Set(wijnen.map((w: any) => w.partner_id)).size} partners.`)
    setExportLoading(false)
    setTimeout(() => setSaveMsg(''), 4000)
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) { router.push('/'); return }
      const [{ data: p }, { data: v }] = await Promise.all([
        supabase.from('partners').select('*').order('created_at', { ascending: false }),
        supabase.from('partner_vragen').select('*').order('created_at', { ascending: false }),
      ])
      setPartners(p || [])
      setVragen(v || [])
      setLoading(false)
    }
    init()
  }, [router])

  const handleAddPartner = async () => {
    if (!newPartner.naam || !newPartner.bedrijfsnaam || !newPartner.email) return
    const { data, error } = await supabase.from('partners').insert({
      naam: newPartner.naam,
      bedrijfsnaam: newPartner.bedrijfsnaam,
      email: newPartner.email,
      pakket: newPartner.pakket,
      avond: newPartner.avond,
      gratis_tickets: parseInt(newPartner.gratis_tickets),
      afdracht_percentage: parseInt(newPartner.afdracht_percentage),
      barlocatie: newPartner.barlocatie || null,
      notities: newPartner.notities || null,
    }).select().single()
    if (!error && data) {
      setPartners([data, ...partners])
      setNewPartner({ naam: '', bedrijfsnaam: '', email: '', pakket: 'own_bar', avond: 'alle', gratis_tickets: '20', afdracht_percentage: '25', barlocatie: '', notities: '' })
      setSaveMsg('Partner aangemaakt! Maak nu een account voor ze aan in Supabase Auth.')
      setTimeout(() => setSaveMsg(''), 5000)
    }
  }

  const handleAntwoord = async (vraagId: string) => {
    const antwoord = antwoordMap[vraagId]
    if (!antwoord) return
    const { error } = await supabase.from('partner_vragen').update({
      antwoord, status: 'beantwoord', antwoord_datum: new Date().toISOString()
    }).eq('id', vraagId)
    if (!error) {
      setVragen(vragen.map(v => v.id === vraagId ? { ...v, antwoord, status: 'beantwoord' } : v))
      setSaveMsg('Antwoord opgeslagen!')
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  const S = {
    page: { display: 'flex', minHeight: '100vh', background: 'var(--sand)' },
    sidebar: { width: '200px', background: 'var(--navy)', flexShrink: 0 },
    sidebarTop: { padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' },
    logo: { fontSize: '10px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, color: 'var(--gold)' },
    adminLabel: { fontSize: '13px', fontWeight: '700', color: 'var(--cream)', marginTop: '4px' },
    navItem: (active: boolean) => ({
      display: 'block', width: '100%', padding: '10px 20px', textAlign: 'left' as const,
      background: active ? 'rgba(254,183,42,0.12)' : 'transparent',
      borderLeft: active ? '3px solid var(--gold)' : '3px solid transparent',
      color: active ? 'var(--gold)' : 'rgba(255,255,255,0.55)',
      fontSize: '12px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase' as const,
      cursor: 'pointer', border: 'none', fontFamily: 'Inter, sans-serif'
    }),
    main: { flex: 1, padding: '32px 40px' },
    title: { fontSize: '22px', fontWeight: '800', textTransform: 'uppercase' as const, letterSpacing: '1px', color: 'var(--navy)', marginBottom: '24px' },
    card: { background: 'var(--cream)', padding: '24px', marginBottom: '16px', borderRadius: '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
    cardTitle: { fontSize: '11px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, color: 'var(--bordeaux)', marginBottom: '16px' },
    label: { display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' as const, color: '#666', marginBottom: '6px', marginTop: '12px' },
    input: { width: '100%', padding: '9px 12px', border: '1px solid #ddd', fontSize: '13px', fontFamily: 'Inter, sans-serif', outline: 'none', borderRadius: '2px', color: 'var(--navy)' },
    btn: { padding: '10px 20px', background: 'var(--navy)', color: 'var(--cream)', border: 'none', fontSize: '11px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'Inter, sans-serif', borderRadius: '2px', marginTop: '16px' },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
    grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
    th: { textAlign: 'left' as const, fontSize: '10px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#999', padding: '8px 12px', borderBottom: '2px solid #eee' },
    td: { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', color: 'var(--navy)', verticalAlign: 'top' as const },
    badge: (ok: boolean) => ({ display: 'inline-block', padding: '2px 8px', fontSize: '10px', fontWeight: '700', borderRadius: '2px', background: ok ? '#e8f5e9' : '#fff3e0', color: ok ? '#2e7d32' : '#e65100' }),
    successMsg: { background: '#e8f5e9', border: '1px solid #4caf50', color: '#2e7d32', padding: '10px 16px', borderRadius: '2px', fontSize: '13px', marginBottom: '20px', fontWeight: '600' },
  }

  if (loading) return <div style={{ padding: '40px' }}>Laden...</div>

  const openVragen = vragen.filter(v => v.status === 'open')

  return (
    <div style={S.page}>
      <div style={S.sidebar}>
        <div style={S.sidebarTop}>
          <div style={S.logo}>NvdW 2026</div>
          <div style={S.adminLabel}>Admin</div>
        </div>
        <nav style={{ padding: '16px 0' }}>
          {[
            { id: 'partners', label: 'Partners' },
            { id: 'toevoegen', label: 'Toevoegen' },
            { id: 'export', label: 'Tactile export' },
            { id: 'vragen', label: `Vragen ${openVragen.length > 0 ? `(${openVragen.length})` : ''}` },
          ].map(item => (
            <button key={item.id} style={S.navItem(activeTab === item.id)} onClick={() => setActiveTab(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      </div>
      <main style={S.main}>
        {saveMsg && <div style={S.successMsg}>{saveMsg}</div>}

        {activeTab === 'partners' && (
          <>
            <div style={S.title}>Partners overzicht</div>
            <div style={S.card}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {['Bedrijf', 'Pakket', 'Avond', 'Status', 'Offerte', 'Wijnen', 'Tickets'].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {partners.map(p => (
                    <tr key={p.id}>
                      <td style={S.td}>
                        <div style={{ fontWeight: '700' }}>{p.bedrijfsnaam}</div>
                        <div style={{ fontSize: '11px', color: '#999' }}>{p.email}</div>
                      </td>
                      <td style={S.td}>{PAKKET_LABELS[p.pakket] || p.pakket}</td>
                      <td style={S.td}>{p.avond}</td>
                      <td style={S.td}>{p.status}</td>
                      <td style={S.td}><span style={S.badge(p.offerte_akkoord)}>{p.offerte_akkoord ? '✓' : 'Open'}</span></td>
                      <td style={S.td}>{p.gratis_tickets}</td>
                      <td style={S.td}>{p.afdracht_percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'toevoegen' && (
          <>
            <div style={S.title}>Partner toevoegen</div>
            <div style={S.card}>
              <div style={S.grid2}>
                {[
                  { key: 'naam', label: 'Contactpersoon naam', placeholder: 'bijv. Jan de Vries' },
                  { key: 'bedrijfsnaam', label: 'Bedrijfsnaam', placeholder: 'bijv. Wijndomein X' },
                  { key: 'email', label: 'E-mailadres', placeholder: 'jan@bedrijf.nl' },
                  { key: 'barlocatie', label: 'Barlocatie (optioneel)', placeholder: 'bijv. Bar A, positie 3' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label style={S.label}>{label}</label>
                    <input style={S.input} value={(newPartner as Record<string, string>)[key]} onChange={e => setNewPartner({ ...newPartner, [key]: e.target.value })} placeholder={placeholder} />
                  </div>
                ))}
              </div>
              <div style={S.grid3}>
                <div>
                  <label style={S.label}>Pakket</label>
                  <select style={S.input} value={newPartner.pakket} onChange={e => setNewPartner({ ...newPartner, pakket: e.target.value })}>
                    {Object.entries(PAKKET_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Avond(en)</label>
                  <select style={S.input} value={newPartner.avond} onChange={e => setNewPartner({ ...newPartner, avond: e.target.value })}>
                    {['alle', 'vrijdag', 'zaterdag', 'zondag'].map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Gratis tickets</label>
                  <input style={S.input} type="number" value={newPartner.gratis_tickets} onChange={e => setNewPartner({ ...newPartner, gratis_tickets: e.target.value })} />
                </div>
                <div>
                  <label style={S.label}>Afdracht %</label>
                  <input style={S.input} type="number" value={newPartner.afdracht_percentage} onChange={e => setNewPartner({ ...newPartner, afdracht_percentage: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={S.label}>Notities (intern)</label>
                <textarea style={{ ...S.input, height: '80px', resize: 'vertical' }} value={newPartner.notities} onChange={e => setNewPartner({ ...newPartner, notities: e.target.value })} placeholder="Interne aantekeningen" />
              </div>
              <button style={S.btn} onClick={handleAddPartner}>Partner aanmaken</button>
              <p style={{ fontSize: '12px', color: '#999', marginTop: '12px' }}>
                Na het aanmaken moet je in Supabase Auth handmatig een gebruiker aanmaken met dit e-mailadres, zodat de partner kan inloggen.
              </p>
            </div>
          </>
        )}

        {activeTab === 'export' && (
          <>
            <div style={S.title}>Tactile export</div>
            <div style={S.card}>
              <div style={S.cardTitle}>Wijnlijst export</div>
              <p style={{ fontSize: '13px', color: '#555', lineHeight: '1.7', marginBottom: '20px' }}>
                Exporteer alle ingevulde wijnlijsten van alle partners in één CSV. 
                Bevat per wijn: partner, pakket, avond, barlocatie, naam, producent, regio, land, druif, jaar en alle prijzen.
                Zodra het Tactile importformaat bekend is passen we de kolomnamen in 5 minuten aan.
              </p>
              <div style={{ background: 'var(--sand)', padding: '16px 20px', borderRadius: '2px', marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: '#999', marginBottom: '8px' }}>Huidige kolommen in de export</div>
                <div style={{ fontSize: '12px', color: 'var(--navy)', lineHeight: '2' }}>
                  Partner · Pakket · Avond · Barlocatie · Wijn naam · Producent · Regio · Land · Druif · Jaar · Prijs half glas · Prijs heel glas · Prijs fles · Omschrijving
                </div>
              </div>
              <button
                style={{ ...S.btn, background: exportLoading ? '#999' : 'var(--gold)', color: 'var(--navy)', fontSize: '13px', padding: '14px 28px' }}
                onClick={handleExportTactile}
                disabled={exportLoading}
              >
                {exportLoading ? 'Exporteren...' : '↓ Download wijnlijst CSV'}
              </button>
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>Crewcatering export</div>
              <p style={{ fontSize: '13px', color: '#999' }}>Komt binnenkort — export van alle crewcatering aanvragen per avond.</p>
            </div>
          </>
        )}

        {activeTab === 'vragen' && (
          <>
            <div style={S.title}>Partner vragen</div>
            {vragen.map(v => (
              <div key={v.id} style={{ ...S.card, borderLeft: v.status === 'open' ? '3px solid var(--bordeaux)' : '3px solid #ccc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontWeight: '700', fontSize: '14px' }}>{v.onderwerp}</div>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: v.status === 'open' ? 'var(--bordeaux)' : '#999', textTransform: 'uppercase', letterSpacing: '1px' }}>{v.status}</span>
                </div>
                <div style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>{v.bericht}</div>
                {v.status === 'open' && (
                  <div>
                    <textarea
                      style={{ ...S.input, height: '80px', resize: 'vertical' }}
                      value={antwoordMap[v.id] || ''}
                      onChange={e => setAntwoordMap({ ...antwoordMap, [v.id]: e.target.value })}
                      placeholder="Typ je antwoord..."
                    />
                    <button style={S.btn} onClick={() => handleAntwoord(v.id)}>Antwoord opslaan</button>
                  </div>
                )}
                {v.antwoord && (
                  <div style={{ background: '#f0f8f0', padding: '10px', borderRadius: '2px', fontSize: '13px', color: '#2e7d32' }}>
                    <strong>Antwoord:</strong> {v.antwoord}
                  </div>
                )}
              </div>
            ))}
            {vragen.length === 0 && <p style={{ color: '#999', fontSize: '14px' }}>Geen vragen.</p>}
          </>
        )}
      </main>
    </div>
  )
}

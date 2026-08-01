'use client'
// Instellingen van de bezoekersapp (Nocturne): banner/melding op de homepagina,
// tabs en functies aan/uit, en praktische info. Alles staat in de tabel
// app_instellingen; de app leest die publiek en past zich direct aan.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS } from './ui'

type Waarden = {
  banner: { actief: boolean; tekst: string }
  welkom: { titel: string; tekst: string }
  tabs: Record<string, boolean>
  functies: Record<string, boolean>
  praktisch: { openingstijden: string; locatie: string; huisregels: string }
}

const LEEG: Waarden = {
  banner: { actief: false, tekst: '' },
  welkom: { titel: '', tekst: '' },
  tabs: { wijnen: true, food: true, transport: true, paspoort: true },
  functies: { programma: true, smaaktest: true, chat: true },
  praktisch: { openingstijden: '', locatie: '', huisregels: '' },
}

const TAB_LABELS: Record<string, string> = {
  wijnen: 'Wijnen (tab)', food: 'Food (tab)', transport: 'Naar huis (tab)', paspoort: 'Smaak-paspoort (tab)',
}
const FUNCTIE_LABELS: Record<string, string> = {
  programma: 'Programma & timetable', smaaktest: 'Smaaktest', chat: 'AI-chat (vraagbaak)',
}

export default function AppBeheer({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [w, setW] = useState<Waarden>(LEEG)
  const [geladen, setGeladen] = useState(false)

  useEffect(() => {
    supabase.from('app_instellingen').select('*').then(({ data }) => {
      const map: Partial<Waarden> = {}
      for (const r of data || []) (map as Record<string, unknown>)[r.sleutel] = r.waarde
      setW({ ...LEEG, ...map, tabs: { ...LEEG.tabs, ...(map.tabs || {}) }, functies: { ...LEEG.functies, ...(map.functies || {}) } })
      setGeladen(true)
    })
  }, [])

  const bewaar = async (sleutel: keyof Waarden, waarde: Waarden[keyof Waarden]) => {
    setW(x => ({ ...x, [sleutel]: waarde }))
    const { error } = await supabase.from('app_instellingen').upsert({ sleutel, waarde })
    if (error) flash('Opslaan mislukte: ' + error.message, 7000)
    else flash('Opgeslagen. Bezoekers zien dit bij de eerstvolgende keer dat de app ververst.')
  }

  const schakel = (groep: 'tabs' | 'functies', key: string) => {
    const nieuw = { ...w[groep], [key]: !w[groep][key] }
    bewaar(groep, nieuw)
  }

  if (!geladen) return <div style={{ padding: '20px', color: '#888' }}>Instellingen laden...</div>

  return (
    <>
      <div style={AS.title}>App-instellingen</div>
      <div style={AS.sub}>Pas de bezoekersapp aan zonder een nieuwe versie te bouwen. Wijzigingen staan direct live.</div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Melding op de homepagina</div>
        <label style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer', marginBottom: '10px' }}>
          <input type="checkbox" checked={w.banner.actief} onChange={e => bewaar('banner', { ...w.banner, actief: e.target.checked })} />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Banner tonen</span>
        </label>
        <textarea style={{ ...AS.input, height: '60px', resize: 'vertical' }} placeholder='bijv. "De silent disco start om 22:00 in de kapel"'
          defaultValue={w.banner.tekst}
          onBlur={e => e.target.value !== w.banner.tekst && bewaar('banner', { ...w.banner, tekst: e.target.value })} />
        <div style={{ fontSize: '12px', color: '#999', marginTop: '6px' }}>Handig tijdens het festival: last-minute wijzigingen, uitgelopen programma, gevonden voorwerpen.</div>
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Welkomsttekst</div>
        <label style={AS.label}>Titel</label>
        <input style={AS.input} placeholder="bijv. Welkom bij editie 7" defaultValue={w.welkom.titel}
          onBlur={e => e.target.value !== w.welkom.titel && bewaar('welkom', { ...w.welkom, titel: e.target.value })} />
        <label style={AS.label}>Tekst</label>
        <textarea style={{ ...AS.input, height: '70px', resize: 'vertical' }} defaultValue={w.welkom.tekst}
          onBlur={e => e.target.value !== w.welkom.tekst && bewaar('welkom', { ...w.welkom, tekst: e.target.value })} />
        <div style={{ fontSize: '12px', color: '#999', marginTop: '6px' }}>Leeg laten = de app gebruikt z&apos;n eigen standaardtekst.</div>
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Tabs & functies</div>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
          Zet iets uit om het te verbergen voor bezoekers, bijvoorbeeld tot het klaar is. Uitzetten gooit niets weg.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
          {Object.entries(TAB_LABELS).map(([key, label]) => (
            <label key={key} style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={w.tabs[key] !== false} onChange={() => schakel('tabs', key)} />
              <span style={{ fontSize: '13px' }}>{label}</span>
            </label>
          ))}
          {Object.entries(FUNCTIE_LABELS).map(([key, label]) => (
            <label key={key} style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={w.functies[key] !== false} onChange={() => schakel('functies', key)} />
              <span style={{ fontSize: '13px' }}>{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={AS.card}>
        <div style={AS.cardTitle}>Praktische info</div>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
          Verschijnt als &quot;Praktisch&quot;-blok op de homepagina van de app zodra er iets is ingevuld.
        </div>
        <label style={AS.label}>Openingstijden</label>
        <textarea style={{ ...AS.input, height: '60px', resize: 'vertical' }} placeholder={'bijv.\nVrijdag 19:00 – 01:00\nZaterdag 19:00 – 01:00'}
          defaultValue={w.praktisch.openingstijden}
          onBlur={e => e.target.value !== w.praktisch.openingstijden && bewaar('praktisch', { ...w.praktisch, openingstijden: e.target.value })} />
        <label style={AS.label}>Locatie & bereikbaarheid</label>
        <textarea style={{ ...AS.input, height: '60px', resize: 'vertical' }} placeholder="bijv. Werkspoorkathedraal, Tractieweg 41 Utrecht. Fietsen bij de ingang."
          defaultValue={w.praktisch.locatie}
          onBlur={e => e.target.value !== w.praktisch.locatie && bewaar('praktisch', { ...w.praktisch, locatie: e.target.value })} />
        <label style={AS.label}>Huisregels</label>
        <textarea style={{ ...AS.input, height: '60px', resize: 'vertical' }} placeholder="bijv. 18+, geen eigen drank, glas blijft binnen."
          defaultValue={w.praktisch.huisregels}
          onBlur={e => e.target.value !== w.praktisch.huisregels && bewaar('praktisch', { ...w.praktisch, huisregels: e.target.value })} />
      </div>
    </>
  )
}

'use client'
// Carousel- en Instagram-stories-generator, ingebed vanuit de website (dezelfde
// tool die daar los stond). Zo hoeft niemand meer heen en weer te schakelen
// tussen het portal en de site om een social post te maken.
import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { AS } from './ui'

const TOOL = 'https://www.nachtvandewijn.nl/tools/carousel-generator'
const TOOL_ORIGIN = 'https://www.nachtvandewijn.nl'

export default function Carousel() {
  const frame = useRef<HTMLIFrameElement>(null)

  // De AI-knop in de tool draaide op één gedeeld wachtwoord dat iedereen moest
  // kennen. Nu geven we de sessie van de ingelogde gebruiker door, zodat de
  // tool bij de server kan navragen of diegene bij marketing mag.
  useEffect(() => {
    let gestopt = false
    const stuurSessie = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (gestopt || !session?.access_token) return
      frame.current?.contentWindow?.postMessage(
        { type: 'nvdw-portal-sessie', token: session.access_token },
        TOOL_ORIGIN,
      )
    }
    // De tool meldt terug dat de sessie binnen is. Faalt dat, dan zie je dat
    // hier in plaats van pas als iemand op de AI-knop drukt.
    const bevestiging = (e: MessageEvent) => {
      if (e.origin === TOOL_ORIGIN && e.data?.type === 'nvdw-sessie-ontvangen') {
        console.log('[carousel] generator heeft je sessie ontvangen, AI-knop werkt zonder wachtwoord')
      }
    }
    window.addEventListener('message', bevestiging)

    const el = frame.current
    el?.addEventListener('load', stuurSessie)
    // Ook bij een verlengde sessie opnieuw doorgeven, anders werkt de knop na
    // een uur niet meer terwijl je gewoon ingelogd bent.
    const { data: sub } = supabase.auth.onAuthStateChange(() => { stuurSessie() })
    return () => {
      gestopt = true
      el?.removeEventListener('load', stuurSessie)
      window.removeEventListener('message', bevestiging)
      sub.subscription.unsubscribe()
    }
  }, [])

  return (
    <>
      <div style={AS.title}>Carousel &amp; stories</div>
      <div style={AS.sub}>Maak Instagram-carousels en stories in de huisstijl. Vanuit Aankondigingen en Programma opent &quot;Open in carousel-generator&quot; hier dezelfde tool met de tekst al ingevuld.</div>
      {/* Het iframe krijgt bewust bijna de volle hoogte. De tool schaalt zijn
          preview naar de ruimte die hij krijgt, dus hoe hoger dit blok, hoe
          groter je de slides ziet. minHeight houdt hem werkbaar op een laptop. */}
      <div style={{ border: '1px solid rgba(1,3,65,0.08)', borderRadius: '14px', overflow: 'hidden', height: 'calc(100dvh - 150px)', minHeight: '720px' }}>
        <iframe
          ref={frame}
          src={TOOL}
          title="Carousel- en stories-generator"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      </div>
    </>
  )
}

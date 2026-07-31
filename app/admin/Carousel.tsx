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
    // De tool meldt ook zodra hij zelf klaar is om te ontvangen. Dat is
    // betrouwbaarder dan alleen op het load-event van het iframe wachten: klik
    // je vlak na het openen van het tabblad meteen op de AI-knop, dan kan die
    // sessie er op dat moment nog niet zijn. Zo vroeg ik dat zelf mee.
    const berichten = (e: MessageEvent) => {
      // De tool stuurt "gereed" met targetOrigin "*" (bevat geen gegevens),
      // dus check hier zelf of het echt van de tool komt.
      if (e.origin === TOOL_ORIGIN && e.data?.type === 'nvdw-generator-gereed') { stuurSessie(); return }
      if (e.origin === TOOL_ORIGIN && e.data?.type === 'nvdw-sessie-ontvangen') {
        console.log('[carousel] generator heeft je sessie ontvangen, AI-knop werkt zonder wachtwoord')
      }
    }
    window.addEventListener('message', berichten)

    const el = frame.current
    el?.addEventListener('load', stuurSessie)
    // Nog een paar keer proberen kort na het openen, als extra vangnet naast
    // het gereed-bericht en het load-event.
    const vangnet = [300, 1000, 2500].map(ms => setTimeout(stuurSessie, ms))
    // Ook bij een verlengde sessie opnieuw doorgeven, anders werkt de knop na
    // een uur niet meer terwijl je gewoon ingelogd bent.
    const { data: sub } = supabase.auth.onAuthStateChange(() => { stuurSessie() })
    return () => {
      gestopt = true
      el?.removeEventListener('load', stuurSessie)
      window.removeEventListener('message', berichten)
      vangnet.forEach(clearTimeout)
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

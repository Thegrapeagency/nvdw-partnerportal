'use client'
// Carousel- en Instagram-stories-generator, ingebed vanuit de website (dezelfde
// tool die daar los stond). Zo hoeft niemand meer heen en weer te schakelen
// tussen het portal en de site om een social post te maken.
import { AS } from './ui'

export default function Carousel() {
  return (
    <>
      <div style={AS.title}>Carousel &amp; stories</div>
      <div style={AS.sub}>Maak Instagram-carousels en stories in de huisstijl. Vanuit Aankondigingen en Programma opent "Open in carousel-generator" hier dezelfde tool met de tekst al ingevuld.</div>
      <div style={{ border: '1px solid rgba(1,3,65,0.08)', borderRadius: '14px', overflow: 'hidden', height: 'calc(100vh - 220px)', minHeight: '640px' }}>
        <iframe
          src="https://www.nachtvandewijn.nl/tools/carousel-generator"
          title="Carousel- en stories-generator"
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </>
  )
}

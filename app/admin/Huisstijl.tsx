'use client'
// De huisstijl van editie 7, ingebed vanuit de website (dezelfde pagina die daar
// op /styleguide staat). Zo hoeft niemand die met het merk werkt de losse link
// te onthouden; de bron blijft één pagina zodat er nooit twee versies ontstaan.
import { AS } from './ui'

const URL = 'https://www.nachtvandewijn.nl/styleguide'

export default function Huisstijl() {
  return (
    <>
      <div style={AS.title}>Huisstijl</div>
      <div style={AS.sub}>Palet, typografie, logo, fotografie en de wel-en-niet-lijst van editie 7. Deel de losse link met ontwerpers en partners; de pagina staat op noindex, dus je vindt hem niet via Google.</div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', margin: '0 0 16px' }}>
        <a href={URL} target="_blank" rel="noreferrer" style={{ ...AS.btn, marginTop: 0, display: 'inline-block', textDecoration: 'none' }}>Open in nieuw tabblad</a>
        <a href="https://www.nachtvandewijn.nl/assets/GoboldBlocky-block.woff2" style={{ ...AS.btnSm, display: 'inline-block', textDecoration: 'none' }}>Gobold Blocky webfont</a>
        <a href="https://www.nachtvandewijn.nl/assets/logo-mark-bordeaux.png" target="_blank" rel="noreferrer" style={{ ...AS.btnSm, display: 'inline-block', textDecoration: 'none' }}>Logo bordeaux</a>
        <a href="https://www.nachtvandewijn.nl/assets/logo-mark-cream.png" target="_blank" rel="noreferrer" style={{ ...AS.btnSm, display: 'inline-block', textDecoration: 'none' }}>Logo crème</a>
      </div>
      <div style={{ border: '1px solid rgba(1,3,65,0.08)', borderRadius: '14px', overflow: 'hidden', height: 'calc(100vh - 260px)', minHeight: '640px' }}>
        <iframe
          src={URL}
          title="Huisstijl Nacht van de Wijn"
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </>
  )
}

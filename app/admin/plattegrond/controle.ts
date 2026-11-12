// Gemeentecheck: loopt de tekening na op wat gemeentes en veiligheidsregio's
// doorgaans vragen bij een evenementenvergunning. Er is geen landelijke norm;
// de getallen hieronder zijn de gangbare vuistregels en per tekening aan te
// passen (doc.normen). De gemeente heeft altijd het laatste woord.
import type { Doc, Obj, PartnerRij } from './types'
import { STANDAARD_NORMEN } from './types'
import { MATERIAAL } from './materialen'
import { hoeken, overlapt, lengte, oppervlak, afstandSegPoly, middenVan, fmt, r2 } from './geo'

export type Check = { id: string; status: 'ok' | 'actie' | 'tip'; titel: string; uitleg: string; ids?: string[]; naar?: 'gegevens' | 'locatie' | 'materialen' | 'normen' }
export const OMHULLEND = new Set(['tent3', 'tent3x6', 'tent5', 'tent6x12', 'tent10x20', 'stretchtent', 'terras', 'verzamel', 'podium', 'backstage', 'parkeren', 'fietsen', 'tribune'])

export function controleer(doc: Doc, partnerById: Record<string, PartnerRij>): Check[] {
  const n = { ...STANDAARD_NORMEN, ...(doc.normen || {}) }
  const m = doc.meta || {}
  const objs = doc.objs.filter(o => !o.verborgen)
  const mats = objs.filter(o => o.kind === 'materiaal')
  const van = (...keys: string[]) => mats.filter(o => keys.includes(o.mat || ''))
  const bez = m.bezoekers || 0
  const uit: Check[] = []
  const nl = (v: number) => r2(v).toLocaleString('nl-NL')

  // 1. gegevens voor het titelblok
  const mist = [!m.evenement && 'naam evenement', !m.locatie && 'locatie', !m.datum && 'datum', !bez && 'aantal bezoekers'].filter(Boolean)
  uit.push(mist.length
    ? { id: 'gegevens', status: 'actie', titel: 'Gegevens van het evenement', uitleg: `Nog invullen: ${mist.join(', ')}. Dit komt in het titelblok en het aantal bezoekers bepaalt de rest van de check.`, naar: 'gegevens' }
    : { id: 'gegevens', status: 'ok', titel: 'Gegevens van het evenement', uitleg: `${m.evenement}, ${m.locatie}, ${nl(bez)} bezoekers tegelijk.`, naar: 'gegevens' })

  // 2. ondergrond op schaal + noordpijl
  if (doc.kaart) uit.push({ id: 'schaal', status: 'ok', titel: 'Ondergrond op schaal, noord boven', uitleg: 'De kaart van PDOK staat vanzelf op schaal. De noordpijl komt automatisch op het tekenblad.', naar: 'locatie' })
  else if (doc.bg) {
    uit.push(doc.bg.opSchaal
      ? { id: 'schaal', status: 'ok', titel: 'Plattegrond op schaal gezet', uitleg: 'Je hebt de geüploade plattegrond gekalibreerd op een bekende maat.', naar: 'locatie' }
      : { id: 'schaal', status: 'actie', titel: 'Plattegrond nog niet op schaal', uitleg: 'Trek een lijn over een maat die je kent, anders kloppen de afmetingen niet.', naar: 'locatie' })
    uit.push(m.noordHoek == null
      ? { id: 'noord', status: 'actie', titel: 'Noordrichting ontbreekt', uitleg: 'Gemeentes vragen een noordpijl. Geef aan waar het noorden is, of gebruik de kaart van PDOK.', naar: 'locatie' }
      : { id: 'noord', status: 'ok', titel: 'Noordpijl', uitleg: 'Komt automatisch op het tekenblad.', naar: 'locatie' })
  } else uit.push({ id: 'schaal', status: 'actie', titel: 'Nog geen ondergrond', uitleg: 'Zoek het adres op voor een luchtfoto of kaart op schaal, of upload de plattegrond van de locatie.', naar: 'locatie' })

  // 3. calamiteitenroute
  const routes = objs.filter(o => o.kind === 'hek' && o.mat === 'calamiteitenroute')
  if (!routes.length) uit.push({ id: 'calroute', status: 'actie', titel: 'Calamiteitenroute ontbreekt', uitleg: `Teken de route voor brandweer en ambulance. Die moet minimaal ${nl(n.calBreedte)} m breed en 4,2 m hoog vrij blijven.`, naar: 'materialen' })
  else {
    const smal = routes.filter(r => (r.dik ?? MATERIAAL.calamiteitenroute.breedte!) < n.calBreedte - 1e-6)
    const blokkers = new Set<string>()
    for (const r of routes) {
      const half = (r.dik ?? MATERIAAL.calamiteitenroute.breedte!) / 2
      for (const o of objs) {
        if (!(o.kind === 'partner' || o.kind === 'materiaal' || (o.kind === 'hek' && MATERIAAL[o.mat || '']?.soort === 'lijn'))) continue
        if (o.kind === 'materiaal' && (OMHULLEND.has(o.mat || '') || MATERIAAL[o.mat || '']?.uitgang)) continue
        const poly = hoeken(o), pts = r.pts || []
        for (let i = 1; i < pts.length; i++) {
          const d = o.kind === 'hek'
            ? Math.min(...poly.slice(1).map((p, j) => afstandSegPoly(pts[i - 1], pts[i], [poly[j], p, p])))
            : afstandSegPoly(pts[i - 1], pts[i], poly)
          if (d < half - 0.01) { blokkers.add(o.id); break }
        }
      }
    }
    if (smal.length) uit.push({ id: 'calroute', status: 'actie', titel: 'Calamiteitenroute te smal', uitleg: `De route is smaller dan ${nl(n.calBreedte)} m.`, ids: smal.map(o => o.id) })
    else if (blokkers.size) uit.push({ id: 'calroute', status: 'actie', titel: `${blokkers.size} ${blokkers.size === 1 ? 'object staat' : 'objecten staan'} in de calamiteitenroute`, uitleg: 'Klik om ze te zien en schuif ze uit de rode band. Een hekpoort mag wel in de route staan.', ids: [...blokkers] })
    else uit.push({ id: 'calroute', status: 'ok', titel: 'Calamiteitenroute vrij', uitleg: `${fmt(routes.reduce((s, r) => s + lengte(r.pts || []), 0))} route, ${nl(n.calBreedte)} m breed en niets in de weg.`, ids: routes.map(o => o.id) })
  }

  // 4. (nood)uitgangen
  const uitg = mats.filter(o => MATERIAAL[o.mat || '']?.uitgang)
  const breedte = uitg.reduce((s, o) => s + Math.max(o.w, o.h), 0)
  const cap = Math.floor(breedte * n.uitgangPm)
  const teSmal = uitg.filter(o => Math.max(o.w, o.h) < n.uitgangMin)
  if (uitg.length < 2) uit.push({ id: 'uitgang', status: 'actie', titel: 'Minimaal twee uitgangen', uitleg: 'Teken de ingang en de nooduitgangen in. Er horen er minstens twee te zijn, bij voorkeur tegenover elkaar.', naar: 'materialen', ids: uitg.map(o => o.id) })
  else if (teSmal.length) uit.push({ id: 'uitgang', status: 'actie', titel: 'Uitgang te smal', uitleg: `Een nooduitgang is minimaal ${nl(n.uitgangMin)} m breed.`, ids: teSmal.map(o => o.id) })
  else if (bez && cap < bez) uit.push({ id: 'uitgang', status: 'actie', titel: 'Te weinig uitgangsbreedte', uitleg: `${uitg.length} uitgangen, samen ${fmt(breedte)}: genoeg voor ${nl(cap)} personen (${n.uitgangPm} per meter). Je verwacht er ${nl(bez)}. Je hebt nog ${fmt((bez - cap) / n.uitgangPm)} extra nodig.`, ids: uitg.map(o => o.id) })
  else uit.push({ id: 'uitgang', status: bez ? 'ok' : 'tip', titel: `${uitg.length} uitgangen, samen ${fmt(breedte)}`, uitleg: bez ? `Genoeg voor ${nl(cap)} personen bij ${n.uitgangPm} per meter. De breedtes staan bij elke uitgang op de tekening.` : 'Vul het aantal bezoekers in, dan reken ik de capaciteit na.', ids: uitg.map(o => o.id) })

  // 5. capaciteit publieksruimte
  const zones = objs.filter(o => o.publiek)
  if (zones.length) {
    const opp = zones.reduce((s, o) => s + oppervlak(o), 0)
    const max = Math.floor(zones.reduce((s, o) => s + oppervlak(o) * (o.dichtheid || n.dichtheid), 0))
    uit.push(bez && max < bez
      ? { id: 'capaciteit', status: 'actie', titel: 'Publieksruimte te klein', uitleg: `${nl(opp)} m² publieksruimte is goed voor ${nl(max)} personen. Je verwacht er ${nl(bez)}.`, ids: zones.map(o => o.id) }
      : { id: 'capaciteit', status: 'ok', titel: `Publieksruimte ${nl(Math.round(opp))} m²`, uitleg: `Goed voor maximaal ${nl(max)} personen.`, ids: zones.map(o => o.id) })
  } else uit.push({ id: 'capaciteit', status: 'tip', titel: 'Publieksruimte aangeven', uitleg: 'Teken met de pen het vlak waar publiek staat en vink Publieksruimte aan. Dan zie je het oppervlak en hoeveel mensen erop passen.' })

  // 6. toiletten
  const wcs = mats.reduce((s, o) => s + (MATERIAAL[o.mat || '']?.wc || 0), 0)
  const nodig = bez ? Math.max(2, Math.ceil(bez / n.toiletPer)) : 2
  const miva = van('mivatoilet').length
  if (wcs < nodig) uit.push({ id: 'toilet', status: 'actie', titel: `Toiletten: ${wcs} van ${nodig}`, uitleg: `Vuistregel van de GHOR: één toilet per ${n.toiletPer} bezoekers tegelijk, minimaal twee. Een toiletwagen telt hier voor 8, een urinoir voor 4.`, naar: 'materialen', ids: mats.filter(o => MATERIAAL[o.mat || '']?.wc).map(o => o.id) })
  else if (!miva) uit.push({ id: 'toilet', status: 'tip', titel: `Toiletten: ${wcs} (${nodig} nodig)`, uitleg: 'Aantal is in orde. Er staat nog geen toilet voor mindervaliden op de tekening.', naar: 'materialen' })
  else uit.push({ id: 'toilet', status: 'ok', titel: `Toiletten: ${wcs} (${nodig} nodig)`, uitleg: 'Inclusief toilet voor mindervaliden.' })

  // 7. EHBO
  const ehbo = van('ehbo')
  uit.push(ehbo.length
    ? { id: 'ehbo', status: 'ok', titel: 'EHBO-post ingetekend', uitleg: bez ? `Richtlijn: ${Math.max(2, Math.ceil(bez / n.ehboPer))} hulpverleners bij ${nl(bez)} bezoekers.` : 'Staat op de tekening.', ids: ehbo.map(o => o.id) }
    : { id: 'ehbo', status: bez >= 1000 ? 'actie' : 'tip', titel: 'EHBO-post ontbreekt', uitleg: 'Richtlijn: één hulpverlener per 1.000 bezoekers tegelijk, minimaal twee. Teken de post in op een plek die een ambulance kan bereiken.', naar: 'materialen' })

  // 8. blusmiddelen bij brandrisico
  const blussers = van('blusser', 'haspel').map(middenVan)
  const risico = objs.filter(o => (o.kind === 'materiaal' && MATERIAAL[o.mat || '']?.brand) || (o.kind === 'partner' && partnerById[o.partnerId || '']?.type === 'food'))
  const zonder = risico.filter(o => { const [x, y] = middenVan(o); const straal = Math.max(o.w, o.h) / 2 + n.blusAfstand; return !blussers.some(b => Math.hypot(b[0] - x, b[1] - y) <= straal) })
  if (zonder.length) uit.push({ id: 'blusser', status: 'actie', titel: `${zonder.length}× geen blusser in de buurt`, uitleg: `Bij foodtrucks, bak- en braadkramen, aggregaten en gasflessen hoort een blusser binnen ${nl(n.blusAfstand)} m. Klik om te zien waar er een mist.`, ids: zonder.map(o => o.id) })
  else if (risico.length) uit.push({ id: 'blusser', status: 'ok', titel: 'Blusmiddelen bij elk brandrisico', uitleg: `${risico.length} objecten met brandrisico, overal een blusser binnen ${nl(n.blusAfstand)} m.` })
  else if (!blussers.length) uit.push({ id: 'blusser', status: 'tip', titel: 'Blusmiddelen intekenen', uitleg: 'Teken in waar brandblussers staan. De brandweer wil ze op de tekening zien.', naar: 'materialen' })

  // 9. overlap
  const blokken = objs.filter(o => (o.kind === 'partner' || o.kind === 'materiaal') && !OMHULLEND.has(o.mat || ''))
  const ov = new Set<string>()
  for (let i = 0; i < blokken.length; i++) for (let j = i + 1; j < blokken.length; j++) if (overlapt(hoeken(blokken[i]), hoeken(blokken[j]))) { ov.add(blokken[i].id); ov.add(blokken[j].id) }
  if (ov.size) uit.push({ id: 'overlap', status: 'actie', titel: `${ov.size} objecten staan over elkaar`, uitleg: 'Twee dingen kunnen niet op dezelfde plek staan. Klik om ze te zien.', ids: [...ov] })

  // 10. tenten
  const tenten = mats.filter(o => (o.mat || '').includes('tent'))
  const groot = tenten.filter(o => o.w * o.h > 25)
  if (groot.length) uit.push({ id: 'tent', status: 'tip', titel: `${groot.length} ${groot.length === 1 ? 'tent' : 'tenten'} groter dan 25 m²`, uitleg: 'Stuur het tentboek en het brandcertificaat van het doek mee. Bij meer dan 150 personen in één tent wil de brandweer ook een indeling van de tent op schaal 1:100 of 1:200 zien: maak daarvoor een kopie van deze tekening en exporteer alleen de tent.', ids: groot.map(o => o.id) })

  // 11. maatvoering
  const maten = objs.filter(o => o.kind === 'maat')
  uit.push(maten.length
    ? { id: 'maat', status: 'ok', titel: maten.length === 1 ? '1 maatlijn' : `${maten.length} maatlijnen`, uitleg: 'Doorgangen en afstanden staan met maat op de tekening.', ids: maten.map(o => o.id) }
    : { id: 'maat', status: 'tip', titel: 'Maten van doorgangen aangeven', uitleg: 'Zet met de maatlijn (D) de breedte van gangpaden en de afstand tussen tenten en kramen op de tekening. Daar kijkt de brandweer naar.' })

  return uit
}

// Gedeelde types van de plattegrond-tekenaar. De map plattegrond/ is één
// module die in meerdere apps draait (NvdW partnerportal, APÉRO Studio):
// alles wat app-specifiek is (opslag, deelnemers, huisstijl) komt binnen via
// de Adapter. Wijzig je hier iets, kopieer de map dan naar de andere app.
export type Pt = [number, number]
export type Kind = 'rect' | 'ellipse' | 'line' | 'poly' | 'text' | 'partner' | 'materiaal' | 'hek' | 'legenda' | 'maat' | 'voorziening'
export type Obj = {
  id: string; kind: Kind
  x: number; y: number; w: number; h: number; rot: number
  pts?: Pt[]
  label?: string
  color?: string      // vulling (bij lijn: lijnkleur)
  lijn?: string        // lijnkleur, 'none' = geen
  lijnDik?: number     // meters
  streep?: boolean
  dekking?: number     // 0..1
  hoek?: number        // hoekradius in meters
  locked?: boolean; verborgen?: boolean
  groep?: string; laag?: string
  nr?: number
  partnerId?: string; mat?: string; voorziening?: string
  dik?: number; tekstgrootte?: number
  toonLabel?: boolean
  publiek?: boolean    // vlak telt mee als publieksruimte
  dichtheid?: number   // personen per m2
}
export type Laag = { id: string; naam: string; zichtbaar: boolean; vast: boolean }
export type Bg = { src: string; x: number; y: number; w: number; h: number; opacity: number; locked: boolean; opSchaal?: boolean }
// Kaartondergrond van PDOK. rd = Rijksdriehoekscoördinaat (meters) van het
// nulpunt van de tekening; noord is altijd boven.
export type Kaart = { rd: Pt; adres: string; type: 'luchtfoto' | 'kaart'; opacity: number; zichtbaar: boolean }
export type Meta = {
  evenement?: string; locatie?: string; datum?: string; organisator?: string
  bezoekers?: number      // gelijktijdig aanwezig
  tekenaar?: string; versie?: string
  noordHoek?: number | null // graden, alleen zonder kaartondergrond
}
export type Normen = { calBreedte: number; uitgangPm: number; uitgangMin: number; toiletPer: number; ehboPer: number; blusAfstand: number; dichtheid: number }
export const STANDAARD_NORMEN: Normen = { calBreedte: 3.5, uitgangPm: 90, uitgangMin: 0.85, toiletPer: 150, ehboPer: 1000, blusAfstand: 5, dichtheid: 2.5 }
export type PartnerRij = { id: string; naam: string; bedrijfsnaam: string | null; pakket: string; type: string; stand_breedte_m: number | null; stand_diepte_m: number | null; barlocatie?: string | null }
export type Maat = { pakket: string; label: string; breedte_m: number; diepte_m: number; kleur: string }
export type Doc = {
  objs: Obj[]; bg?: Bg | null; kaart?: Kaart | null
  lagen?: Laag[]; gidsen?: { x: number[]; y: number[] }; nrGrootte?: number
  meta?: Meta; normen?: Partial<Normen>
  deelnemers?: PartnerRij[] // los toegevoegd in deze tekening
}

export type Adapter = {
  sleutel: string                       // localStorage-sleutel voor 'laatst geopend'
  merk: string                          // naam in het titelblok
  deelnemerLabel: string                // 'Partners' of 'Standhouders'
  pdfWorker: string                     // pad naar pdf.worker.min.js
  thema: { inkt: string; papier: string; kaart: string; accent: string; serif: string; sans: string }
  lijst(): Promise<{ id: string; naam: string; updated_at: string }[]>
  open(id: string): Promise<{ naam: string; data: unknown } | null>
  nieuw(naam: string, data: Doc): Promise<{ id?: string; fout?: string }>
  opslaan(id: string, naam: string, data: Doc): Promise<string | null>
  verwijder(id: string): Promise<void>
  upload(id: string, blob: Blob, ext: string, contentType: string): Promise<string>
  deelnemers(): Promise<{ partners: PartnerRij[]; maten: Maat[] }>
  slaMaatOp?(partnerId: string, breedte: number | null, diepte: number | null): Promise<string | null>
  slaStandaardOp?(pakket: string, veld: 'breedte_m' | 'diepte_m', waarde: number): Promise<string | null>
}

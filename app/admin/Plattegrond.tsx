'use client'
// Plattegrond-tab van de NvdW-portal. De tekenaar zelf staat in ./plattegrond
// (gedeeld met APÉRO Studio); dit bestand koppelt hem aan de NvdW-database.
import { useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import PlattegrondEditor from './plattegrond/Editor'
import type { Adapter, Doc, PartnerRij, Maat } from './plattegrond/types'

export default function Plattegrond({ flash }: { flash: (m: string, ms?: number) => void }) {
  const adapter = useMemo<Adapter>(() => ({
    sleutel: 'nvdw-plattegrond',
    merk: 'Nacht van de Wijn',
    deelnemerLabel: 'Partners',
    pdfWorker: '/pdf.worker.min.js',
    thema: { inkt: '#010341', papier: '#fef1d5', kaart: '#fffdf9', accent: '#9b3737', serif: 'Fraunces, Georgia, serif', sans: 'Inter, sans-serif' },
    async lijst() {
      const { data } = await supabase.from('plattegronden').select('id,naam,updated_at').order('updated_at', { ascending: false })
      return data || []
    },
    async open(id) {
      const { data, error } = await supabase.from('plattegronden').select('naam,data').eq('id', id).single()
      return error || !data ? null : data
    },
    async nieuw(naam, data: Doc) {
      const { data: rij, error } = await supabase.from('plattegronden').insert({ naam, data }).select('id').single()
      return error ? { fout: error.message } : { id: rij.id }
    },
    async opslaan(id, naam, data) {
      const { error } = await supabase.from('plattegronden').update({ data, naam, updated_at: new Date().toISOString() }).eq('id', id)
      return error ? error.message : null
    },
    async verwijder(id) { await supabase.from('plattegronden').delete().eq('id', id) },
    async upload(id, blob, ext, contentType) {
      const pad = `${id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('plattegronden').upload(pad, blob, { contentType, upsert: false })
      if (error) throw new Error('Uploaden mislukt: ' + error.message)
      return supabase.storage.from('plattegronden').getPublicUrl(pad).data.publicUrl
    },
    async deelnemers() {
      const [{ data: p }, { data: m }] = await Promise.all([
        supabase.from('partners').select('id,naam,bedrijfsnaam,pakket,type,stand_breedte_m,stand_diepte_m,barlocatie'),
        supabase.from('plattegrond_standaardmaten').select('*'),
      ])
      return { partners: ((p || []) as PartnerRij[]).filter(x => x.type !== 'personeel'), maten: ((m || []) as Maat[]).filter(x => x.pakket !== 'personeel') }
    },
    async slaMaatOp(partnerId, b, d) {
      const { error } = await supabase.from('partners').update({ stand_breedte_m: b, stand_diepte_m: d }).eq('id', partnerId)
      return error ? error.message : null
    },
    async slaStandaardOp(pakket, veld, waarde) {
      const { error } = await supabase.from('plattegrond_standaardmaten').update({ [veld]: waarde }).eq('pakket', pakket)
      return error ? error.message : null
    },
  }), [])
  return <PlattegrondEditor adapter={adapter} flash={flash} />
}

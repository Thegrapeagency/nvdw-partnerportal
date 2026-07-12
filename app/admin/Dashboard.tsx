'use client'
// Dashboard-cijfers voor de Start-tab: de cijfers die er nu toe doen, in
// één oogopslag. Ticketing leest de admin direct (RLS), POS via posRpc.
import { useEffect, useState } from 'react'
import { supabase, posRpc } from '@/lib/supabase'
import type { PosSummary } from '@/lib/supabase'
import { euro } from './ui'

const FESTIVAL_START = new Date('2026-11-06T17:00:00+01:00')

type Cijfers = {
  ticketsVandaag: number
  ticketsTotaal: number
  omzetVandaagCents: number
  omzetTotaalCents: number
  crewGaten: number
  posOmzetCents: number | null
}

export default function Dashboard() {
  const [c, setC] = useState<Cijfers | null>(null)

  useEffect(() => {
    let stop = false
    const laad = async () => {
      const vandaagStart = new Date()
      vandaagStart.setHours(0, 0, 0, 0)
      const [ordersRes, itemsRes, gatenRes] = await Promise.all([
        supabase.from('orders').select('id, total_cents, paid_at').eq('status', 'paid'),
        supabase.from('order_items').select('order_id, quantity'),
        supabase.from('crew_gaten').select('tekort'),
      ])
      const orders = ordersRes.data || []
      const qtyPerOrder = new Map<string, number>()
      for (const it of itemsRes.data || []) {
        qtyPerOrder.set(it.order_id, (qtyPerOrder.get(it.order_id) || 0) + it.quantity)
      }
      let ticketsVandaag = 0, ticketsTotaal = 0, omzetVandaag = 0, omzetTotaal = 0
      for (const o of orders) {
        const qty = qtyPerOrder.get(o.id) || 0
        ticketsTotaal += qty
        omzetTotaal += o.total_cents
        if (o.paid_at && new Date(o.paid_at) >= vandaagStart) {
          ticketsVandaag += qty
          omzetVandaag += o.total_cents
        }
      }
      const crewGaten = (gatenRes.data || []).reduce((s, g) => s + (g.tekort || 0), 0)

      let posOmzet: number | null = null
      try {
        const sum = await posRpc<PosSummary>('merchant_sales_summary', { p_merchant_id: null })
        posOmzet = sum?.total_cents ?? null
      } catch { /* kassa niet bereikbaar: cijfer verbergen, geen foutscherm */ }

      if (!stop) setC({ ticketsVandaag, ticketsTotaal, omzetVandaagCents: omzetVandaag, omzetTotaalCents: omzetTotaal, crewGaten, posOmzetCents: posOmzet })
    }
    laad()
    return () => { stop = true }
  }, [])

  const dagen = Math.max(0, Math.ceil((FESTIVAL_START.getTime() - Date.now()) / 86400000))

  const vak = (label: string, val: string, sub: string, alarm = false) => (
    <div key={label} style={{
      background: 'var(--card)', padding: '18px 20px', borderRadius: '14px',
      border: alarm ? '1px solid #e65100' : '1px solid rgba(1,3,65,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '26px', fontWeight: 800, color: alarm ? '#e65100' : 'var(--navy)', lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: '11px', color: '#888', marginTop: '6px' }}>{sub}</div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
      {c === null ? (
        <div style={{ gridColumn: '1 / -1', fontSize: '13px', color: '#999', padding: '12px 4px' }}>Cijfers laden...</div>
      ) : <>
        {vak('Tickets vandaag', String(c.ticketsVandaag), c.ticketsVandaag === 0 ? 'nog geen verkoop vandaag' : euro(c.omzetVandaagCents) + ' omzet')}
        {vak('Tickets totaal', String(c.ticketsTotaal), euro(c.omzetTotaalCents) + ' ticketomzet')}
        {vak('POS-omzet', c.posOmzetCents != null ? euro(c.posOmzetCents) : '–', c.posOmzetCents != null ? 'kassa, bruto' : 'kassa niet bereikbaar')}
        {vak('Dagen tot festival', String(dagen), '6, 7 en 8 november')}
        {vak('Crew-gaten', String(c.crewGaten), c.crewGaten === 0 ? 'rooster is rond' : 'plekken nog niet ingevuld', c.crewGaten > 0)}
      </>}
    </div>
  )
}

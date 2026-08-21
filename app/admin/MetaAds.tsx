'use client'
// Meta Ads sturing: leest de campagnes uit de Meta Marketing API, toetst ze aan
// de budgetregels uit het marketingadvies 2026 en zet de voorstellen hier neer.
// Alle logica en het Meta-token zitten in de edge function meta-ads; deze tab
// praat daar mee met de ingelogde portal-sessie (geen aparte sleutel nodig).
//
// Dry run is de standaard: goedkeuren simuleert en logt, er gaat niets naar
// Meta tot Milan de live-modus expliciet aanzet.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AS, euro } from './ui'

type Status = {
  geconfigureerd: boolean
  account: string | null
  live_mode: boolean
  laatste_sync: { started_at: string; ok: boolean | null; error: string | null; samenvatting: Record<string, unknown> | null } | null
  open_voorstellen: number
  actor: string
  mag_live_schakelen: boolean
}

type Voorstel = {
  id: string
  created_at: string
  regel: string
  severity: 'info' | 'kans' | 'waarschuwing' | 'alarm'
  entity_name: string | null
  titel: string
  probleem: string
  voorstel: string
  onderbouwing: string
  actie: { type?: string; adset_name?: string; huidig_budget_cents?: number; nieuw_budget_cents?: number } | null
  status: string
  beslist_door: string | null
  beslist_op: string | null
}

type Snapshot = {
  venster: string
  level: string
  entity_name: string | null
  effective_status: string | null
  daily_budget_cents: number | null
  spend: number | null
  purchases: number | null
  cost_per_purchase: number | null
  frequency: number | null
  ctr: number | null
  cpm: number | null
}

type LogRegel = {
  id: number
  at: string
  mode: string
  actor: string | null
  actie: { type?: string; adset_name?: string; adset_id?: string; value?: boolean } | null
  voor: { daily_budget_cents?: number } | null
  na: { daily_budget_cents?: number } | null
  resultaat: string | null
}

const SEV_KLEUR: Record<Voorstel['severity'], { bg: string; fg: string; label: string }> = {
  alarm: { bg: 'rgba(155,55,55,0.12)', fg: 'var(--bordeaux)', label: 'Alarm' },
  waarschuwing: { bg: 'rgba(254,183,42,0.18)', fg: '#8a6100', label: 'Let op' },
  kans: { bg: 'rgba(63,125,78,0.14)', fg: '#2f6b3d', label: 'Kans' },
  info: { bg: 'rgba(1,3,65,0.05)', fg: '#777162', label: 'Info' },
}

const SEV_ORDE: Record<Voorstel['severity'], number> = { alarm: 0, waarschuwing: 1, kans: 2, info: 3 }

// Meta-fouten zijn lang en Engels. De twee die je in de praktijk tegenkomt
// vertalen we naar iets waar je wat mee kunt.
const leesbareFout = (e: string | null): string => {
  if (!e) return ''
  if (e === 'not_configured') return 'Nog niet verbonden met Meta: token en accountnummer ontbreken.'
  if (/access token|Session has expired/i.test(e)) return 'Het Meta-token is verlopen of ingetrokken. Zet een nieuw token in Supabase, dan werkt de sync weer.'
  if (/permission|OAuthException/i.test(e)) return 'Meta weigert de toegang: het token mist rechten op dit advertentieaccount (ads_read en ads_management nodig).'
  return e
}

const datumTijd = (s: string | null) =>
  s ? new Date(s).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–'

const eurGetal = (n: number | null | undefined) =>
  n == null ? '–' : '€' + Number(n).toFixed(2).replace('.', ',')

type Tabblad = 'voorstellen' | 'overzicht' | 'meting' | 'logboek'

export default function MetaAds({ flash }: { flash: (m: string, ms?: number) => void }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [voorstellen, setVoorstellen] = useState<Voorstel[]>([])
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [logboek, setLogboek] = useState<LogRegel[]>([])
  const [blad, setBlad] = useState<Tabblad>('voorstellen')
  const [bezig, setBezig] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [toonToken, setToonToken] = useState(false)
  const [tokenVeld, setTokenVeld] = useState('')
  const [tokenFout, setTokenFout] = useState<string | null>(null)
  const [meting, setMeting] = useState<{ oordeel: string; meta_purchases: number; echte_orders: number; ratio: number | null; spend?: number; detail: Voorstel | null } | null>(null)

  const roep = useCallback(async <T,>(action: string, extra: Record<string, unknown> = {}): Promise<T> => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/meta-ads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({ action, ...extra }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Fout ${res.status}`)
    return data as T
  }, [])

  const laad = useCallback(async () => {
    try {
      setFout(null)
      const [s, p] = await Promise.all([
        roep<Status>('status'),
        roep<{ proposals: Voorstel[] }>('proposals'),
      ])
      setStatus(s)
      setVoorstellen(p.proposals)
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Laden mislukt')
    }
  }, [roep])

  useEffect(() => { laad() }, [laad])

  useEffect(() => {
    if (blad === 'overzicht' && snapshots.length === 0) {
      roep<{ adsets: Snapshot[]; account: Snapshot | null }>('overview')
        .then(r => setSnapshots([...(r.account ? [r.account] : []), ...r.adsets]))
        .catch(e => setFout(e.message))
    }
    if (blad === 'logboek') {
      roep<{ log: LogRegel[] }>('log').then(r => setLogboek(r.log)).catch(e => setFout(e.message))
    }
  }, [blad, snapshots.length, roep])

  const sync = async () => {
    setBezig('sync')
    try {
      const r = await roep<{ ok: boolean; melding?: string; error?: string; voorstellen_nieuw?: number }>('sync')
      if (!r.ok) flash(leesbareFout(r.error ?? null) || r.melding || 'Sync mislukt', 8000)
      else flash(`Sync klaar: ${r.voorstellen_nieuw ?? 0} nieuwe voorstellen`)
      setSnapshots([])
      await laad()
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Sync mislukt', 6000)
    }
    setBezig(null)
  }

  const beslis = async (v: Voorstel, decision: 'approve' | 'reject') => {
    if (decision === 'approve' && v.actie?.type === 'update_adset_budget' && status?.live_mode) {
      const oud = eurGetal((v.actie.huidig_budget_cents ?? 0) / 100)
      const nieuw = eurGetal((v.actie.nieuw_budget_cents ?? 0) / 100)
      if (!confirm(`LIVE MODUS: het dagbudget van ${v.actie.adset_name} gaat nu echt van ${oud} naar ${nieuw} bij Meta. Doorzetten?`)) return
    }
    const notitie = decision === 'reject' ? (prompt('Waarom wijs je dit af? (mag leeg)') || null) : null
    setBezig(v.id)
    try {
      const r = await roep<{ status: string; melding?: string }>('decide', { id: v.id, decision, notitie })
      flash(r.melding || `Voorstel ${r.status}`)
      await laad()
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Niet gelukt', 6000)
    }
    setBezig(null)
  }

  const checkMeting = async () => {
    setBezig('meting')
    try {
      setMeting(await roep('purchase_check'))
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Check mislukt', 6000)
    }
    setBezig(null)
  }

  const bewaarToken = async () => {
    setBezig('token'); setTokenFout(null)
    try {
      const r = await roep<{ account: string }>('set_token', { token: tokenVeld.trim() })
      setTokenVeld(''); setToonToken(false)
      flash(`Token opgeslagen en goedgekeurd door Meta voor ${r.account}`)
      await laad()
    } catch (e) {
      setTokenFout(e instanceof Error ? e.message : 'Opslaan mislukt')
    }
    setBezig(null)
  }

  const schakelLive = async (aan: boolean) => {
    if (aan && !confirm('Hierna voert het systeem goedgekeurde budgetverhogingen ECHT door bij Meta. Zeker weten?')) return
    setBezig('live')
    try {
      await roep('set_live_mode', { value: aan, bevestiging: aan ? 'IK ZET LIVE AAN' : undefined })
      flash(aan ? 'Live-modus staat aan' : 'Terug in dry run')
      await laad()
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Schakelen mislukt', 6000)
    }
    setBezig(null)
  }

  const open = voorstellen.filter(v => v.status === 'open').sort((a, b) => SEV_ORDE[a.severity] - SEV_ORDE[b.severity])
  const afgehandeld = voorstellen.filter(v => v.status !== 'open').slice(0, 25)
  const adsetRijen = snapshots.filter(s => s.level === 'adset' && s.venster === 'd7')
  const accountRij = snapshots.find(s => s.level === 'account') || null

  return (
    <div>
      <h2 style={AS.title}>Meta Ads sturing</h2>
      <p style={AS.sub}>
        Toetst de campagnes elke ochtend aan de budgetregels uit het marketingadvies en doet voorstellen.
        Niets gaat naar Meta zonder dat jij het hier goedkeurt.
      </p>

      {fout && (
        <div style={{ ...AS.card, background: 'rgba(155,55,55,0.08)', border: '1px solid rgba(155,55,55,0.3)' }}>
          <strong>Kan de sturing niet laden:</strong> {fout}
        </div>
      )}

      {status && (
        <div style={{ ...AS.card, display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div>
            <span style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
              background: status.live_mode ? 'rgba(155,55,55,0.12)' : 'rgba(254,183,42,0.2)',
              color: status.live_mode ? 'var(--bordeaux)' : '#8a6100',
            }}>
              {status.live_mode ? 'Live modus' : 'Dry run'}
            </span>
            <span style={{ marginLeft: '12px', fontSize: '13px', color: '#8b8574' }}>
              {status.laatste_sync
                ? `Laatste sync ${datumTijd(status.laatste_sync.started_at)}${status.laatste_sync.ok === false ? ` · mislukt: ${leesbareFout(status.laatste_sync.error)}` : ''}`
                : 'Nog geen sync gedraaid'}
              {' · '}{status.open_voorstellen} open
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {status.mag_live_schakelen && (
              <button style={AS.btnSm} disabled={bezig === 'live'} onClick={() => schakelLive(!status.live_mode)}>
                {status.live_mode ? 'Terug naar dry run' : 'Live modus aanzetten'}
              </button>
            )}
            <button style={AS.btnSm} onClick={() => setToonToken(!toonToken)}>
              {status.geconfigureerd ? 'Token vervangen' : 'Token instellen'}
            </button>
            <button style={{ ...AS.btn, marginTop: 0 }} disabled={bezig === 'sync'} onClick={sync}>
              {bezig === 'sync' ? 'Bezig…' : 'Sync nu'}
            </button>
          </div>
        </div>
      )}

      {status && !status.geconfigureerd && (
        <div style={{ ...AS.card, background: 'rgba(254,183,42,0.1)', border: '1px solid rgba(254,183,42,0.4)' }}>
          <strong>Nog niet verbonden met Meta.</strong> Zet <code>META_ACCESS_TOKEN</code> en <code>META_AD_ACCOUNT_ID</code> als
          secrets bij de edge function <code>meta-ads</code> in Supabase (Project → Edge Functions → Secrets). Daarna werkt Sync nu direct.
        </div>
      )}

      {toonToken && (
        <div style={AS.card}>
          <div style={AS.cardTitle}>Meta-token instellen</div>
          <p style={{ fontSize: '13px', lineHeight: 1.6, marginBottom: '4px' }}>
            Plak hier het toegangstoken uit Meta. Het wordt eerst bij Meta gecontroleerd en pas opgeslagen als het werkt
            én bij het juiste advertentieaccount mag. Het token gaat rechtstreeks naar de beveiligde opslag en is daarna
            niet meer op te vragen.
          </p>
          <label style={AS.label}>Toegangstoken</label>
          <input
            type="password"
            style={AS.input}
            value={tokenVeld}
            placeholder="EAA..."
            autoComplete="off"
            onChange={e => setTokenVeld(e.target.value)}
          />
          {tokenFout && (
            <p style={{ fontSize: '13px', lineHeight: 1.6, marginTop: '10px', color: 'var(--bordeaux)' }}>{tokenFout}</p>
          )}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px' }}>
            <button style={{ ...AS.btn, marginTop: 0 }} disabled={bezig === 'token' || tokenVeld.trim().length < 40} onClick={bewaarToken}>
              {bezig === 'token' ? 'Controleren…' : 'Controleren en opslaan'}
            </button>
            <button style={AS.btnSm} onClick={() => { setToonToken(false); setTokenVeld(''); setTokenFout(null) }}>Annuleren</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', margin: '18px 0 14px', flexWrap: 'wrap' }}>
        {(['voorstellen', 'overzicht', 'meting', 'logboek'] as Tabblad[]).map(t => (
          <button key={t} onClick={() => setBlad(t)} style={{
            padding: '7px 15px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
            border: blad === t ? '1px solid var(--navy)' : '1px solid rgba(1,3,65,0.12)',
            background: blad === t ? 'var(--navy)' : 'transparent',
            color: blad === t ? 'var(--cream)' : '#777162',
          }}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {blad === 'voorstellen' && (
        <div>
          {open.length === 0 && <div style={AS.card}>Geen open voorstellen. Draai een sync om de regels opnieuw te toetsen.</div>}
          {open.map(v => {
            const k = SEV_KLEUR[v.severity]
            const uitvoerbaar = v.actie?.type === 'update_adset_budget'
            return (
              <div key={v.id} style={AS.card}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: k.bg, color: k.fg }}>{k.label}</span>
                  <strong style={{ fontSize: '14.5px', color: 'var(--navy)' }}>{v.titel}</strong>
                </div>
                {v.entity_name && <p style={{ fontSize: '12px', color: '#9a9484', marginBottom: '10px' }}>{v.entity_name}</p>}
                <p style={{ fontSize: '13px', lineHeight: 1.6, marginBottom: '8px' }}><strong>Wat speelt er:</strong> {v.probleem}</p>
                <p style={{ fontSize: '13px', lineHeight: 1.6, marginBottom: '8px' }}><strong>Voorstel:</strong> {v.voorstel}</p>
                <p style={{ fontSize: '12.5px', lineHeight: 1.6, color: '#777162' }}><strong>Onderbouwing:</strong> {v.onderbouwing}</p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap' }}>
                  <button style={{ ...AS.btn, marginTop: 0 }} disabled={bezig === v.id} onClick={() => beslis(v, 'approve')}>
                    {uitvoerbaar ? (status?.live_mode ? 'Goedkeuren en doorvoeren' : 'Goedkeuren (simulatie)') : 'Gezien, akkoord'}
                  </button>
                  <button style={AS.btnSm} disabled={bezig === v.id} onClick={() => beslis(v, 'reject')}>Afwijzen</button>
                  {uitvoerbaar && !status?.live_mode && (
                    <span style={{ fontSize: '12px', color: '#9a9484' }}>Dry run: wordt alleen gelogd, niet naar Meta gestuurd.</span>
                  )}
                </div>
              </div>
            )
          })}

          {afgehandeld.length > 0 && (
            <div style={AS.card}>
              <div style={AS.cardTitle}>Afgehandeld</div>
              <table style={AS.table}>
                <thead><tr><th style={AS.th}>Voorstel</th><th style={AS.th}>Status</th><th style={AS.th}>Door</th><th style={AS.th}>Wanneer</th></tr></thead>
                <tbody>
                  {afgehandeld.map(v => (
                    <tr key={v.id}>
                      <td style={AS.td}>{v.titel}</td>
                      <td style={AS.td}>{v.status}</td>
                      <td style={AS.td}>{v.beslist_door || '–'}</td>
                      <td style={AS.td}>{datumTijd(v.beslist_op || v.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {blad === 'overzicht' && (
        <div>
          {accountRij && (
            <div style={{ ...AS.card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
              <div><div style={{ fontSize: '11px', color: '#9a9484' }}>Spend 7 dagen</div><div style={{ fontSize: '21px', fontFamily: 'Fraunces, serif' }}>{eurGetal(accountRij.spend)}</div></div>
              <div><div style={{ fontSize: '11px', color: '#9a9484' }}>Aankopen (Meta)</div><div style={{ fontSize: '21px', fontFamily: 'Fraunces, serif' }}>{accountRij.purchases ?? '–'}</div></div>
              <div><div style={{ fontSize: '11px', color: '#9a9484' }}>Kosten per aankoop</div><div style={{ fontSize: '21px', fontFamily: 'Fraunces, serif' }}>{eurGetal(accountRij.cost_per_purchase)}</div></div>
              <div><div style={{ fontSize: '11px', color: '#9a9484' }}>Frequentie</div><div style={{ fontSize: '21px', fontFamily: 'Fraunces, serif' }}>{accountRij.frequency ? Number(accountRij.frequency).toFixed(1) : '–'}</div></div>
            </div>
          )}
          <div style={AS.card}>
            <div style={AS.cardTitle}>Per ad set, laatste 7 dagen</div>
            {adsetRijen.length === 0 ? <p style={{ fontSize: '13px', color: '#8b8574' }}>Nog geen data. Draai een sync zodra de Meta-secrets staan.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={AS.table}>
                  <thead><tr>
                    <th style={AS.th}>Ad set</th><th style={AS.th}>Status</th><th style={AS.th}>Dagbudget</th><th style={AS.th}>Spend</th>
                    <th style={AS.th}>Aankopen</th><th style={AS.th}>Per aankoop</th><th style={AS.th}>Freq</th><th style={AS.th}>CTR</th><th style={AS.th}>CPM</th>
                  </tr></thead>
                  <tbody>
                    {adsetRijen.map((s, i) => (
                      <tr key={i}>
                        <td style={AS.td}>{s.entity_name}</td>
                        <td style={AS.td}>{s.effective_status === 'ACTIVE' ? 'Actief' : (s.effective_status || '').toLowerCase()}</td>
                        <td style={AS.td}>{s.daily_budget_cents != null ? euro(s.daily_budget_cents) : '–'}</td>
                        <td style={AS.td}>{eurGetal(s.spend)}</td>
                        <td style={AS.td}>{s.purchases ?? 0}</td>
                        <td style={AS.td}>{eurGetal(s.cost_per_purchase)}</td>
                        <td style={AS.td}>{s.frequency ? Number(s.frequency).toFixed(1) : '–'}</td>
                        <td style={AS.td}>{s.ctr ? Number(s.ctr).toFixed(2) + '%' : '–'}</td>
                        <td style={AS.td}>{eurGetal(s.cpm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {blad === 'meting' && (
        <div style={AS.card}>
          <div style={AS.cardTitle}>Purchase-meting: Meta tegenover de echte kaartverkoop</div>
          <p style={{ fontSize: '13px', lineHeight: 1.6, marginBottom: '12px' }}>
            Vergelijkt wat Meta aan aankopen rapporteert met de betaalde orders in onze eigen ticketverkoop over dezelfde periode.
            In 2025 mat Meta 490 aankopen tegenover 1.912 echte orders; deze check bewaakt dat dat niet opnieuw gebeurt.
          </p>
          <button style={{ ...AS.btn, marginTop: 0 }} disabled={bezig === 'meting'} onClick={checkMeting}>
            {bezig === 'meting' ? 'Bezig…' : 'Check nu'}
          </button>
          {meting && (
            <div style={{ marginTop: '16px', padding: '14px 16px', borderRadius: '12px', fontSize: '13px', lineHeight: 1.6,
              background: meting.oordeel === 'alarm' ? 'rgba(155,55,55,0.1)' : 'rgba(63,125,78,0.1)' }}>
              {meting.oordeel === 'in_orde' && <>In orde. Meta telt {meting.meta_purchases} aankopen, de kaartverkoop {meting.echte_orders} betaalde orders (verhouding {meting.ratio?.toFixed(2)}).</>}
              {meting.oordeel === 'geen_spend' && <>Er draaien op dit moment geen advertenties (geen spend in de periode), dus valt er niets te vergelijken. Zodra er weer budget loopt zegt deze check je of de meting klopt.</>}
              {meting.oordeel === 'te_weinig_volume' && <>Te weinig orders ({meting.echte_orders}) in deze periode voor een betrouwbaar oordeel. Meta rapporteert {meting.meta_purchases} aankopen.</>}
              {meting.oordeel === 'alarm' && <><strong>{meting.detail?.probleem}</strong><br /><br />{meting.detail?.voorstel}</>}
            </div>
          )}
        </div>
      )}

      {blad === 'logboek' && (
        <div style={AS.card}>
          <div style={AS.cardTitle}>Wijzigingslogboek</div>
          {logboek.length === 0 ? <p style={{ fontSize: '13px', color: '#8b8574' }}>Nog niets gelogd.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={AS.table}>
                <thead><tr>
                  <th style={AS.th}>Wanneer</th><th style={AS.th}>Modus</th><th style={AS.th}>Wie</th>
                  <th style={AS.th}>Actie</th><th style={AS.th}>Van → naar</th><th style={AS.th}>Resultaat</th>
                </tr></thead>
                <tbody>
                  {logboek.map(r => (
                    <tr key={r.id}>
                      <td style={AS.td}>{datumTijd(r.at)}</td>
                      <td style={AS.td}>{r.mode === 'live' ? 'Live' : 'Dry run'}</td>
                      <td style={AS.td}>{r.actor || '–'}</td>
                      <td style={AS.td}>
                        {r.actie?.type === 'update_adset_budget' ? `Budget ${r.actie.adset_name || r.actie.adset_id}`
                          : r.actie?.type === 'set_live_mode' ? (r.actie.value ? 'Live-modus aan' : 'Live-modus uit')
                          : (r.actie?.type || '–')}
                      </td>
                      <td style={AS.td}>{r.voor?.daily_budget_cents != null ? `${euro(r.voor.daily_budget_cents)} → ${r.na?.daily_budget_cents != null ? euro(r.na.daily_budget_cents) : '–'}` : '–'}</td>
                      <td style={AS.td}>{r.resultaat || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

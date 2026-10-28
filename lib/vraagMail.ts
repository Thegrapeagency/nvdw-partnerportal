// Mailt een in de portal gegeven antwoord naar de vragensteller
// (edge function vraag-antwoord-mail). Geeft een korte melding terug voor flash().
import { supabase } from '@/lib/supabase'

export async function mailAntwoord(soort: 'bezoeker' | 'partner', id: string, opnieuw = false): Promise<{ ok: boolean; melding: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/vraag-antwoord-mail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
      body: JSON.stringify({ soort, id, opnieuw }),
    })
    const j = await res.json().catch(() => ({})) as { ok?: boolean; naar?: string; al_gemaild?: boolean; error?: string }
    if (res.ok && j.ok) return { ok: true, melding: j.al_gemaild ? 'Was al gemaild.' : `Antwoord gemaild naar ${j.naar}.` }
    return { ok: false, melding: 'Antwoord opgeslagen, maar mailen mislukte: ' + (j.error || res.status) }
  } catch {
    return { ok: false, melding: 'Antwoord opgeslagen, maar mailen mislukte (geen verbinding).' }
  }
}

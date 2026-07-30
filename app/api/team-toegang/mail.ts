// Mailtemplates voor toegang tot het portal. Gedeeld tussen team-toegang (een
// beheerder stuurt een link) en hulp-inloggen (iemand vraagt zelf een verse
// link aan), zodat er één versie van deze mail bestaat.

export function wachtwoordHtml(naam: string, link: string) {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f0e4c0;font-family:Helvetica,Arial,sans-serif;color:#010341;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="background:#fef1d5;border:1px solid rgba(1,3,65,0.1);padding:36px 32px;">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9b3737;margin-bottom:10px;">Partner Portal</div>
      <h1 style="font-size:26px;line-height:1.1;margin:0 0 18px;color:#010341;text-transform:uppercase;">Nieuw<br/>wachtwoord</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">Hoi ${naam || 'daar'},</p>
      <p style="font-size:15px;line-height:1.7;margin:0 0 24px;">Er is een nieuw wachtwoord voor je account bij het Nacht van de Wijn portal aangevraagd. Klik op de knop hieronder om een nieuw wachtwoord te kiezen.</p>
      <a href="${link}" style="display:inline-block;background:#010341;color:#fef1d5;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:14px 28px;">Wachtwoord instellen</a>
      <p style="font-size:12px;line-height:1.6;color:rgba(1,3,65,0.5);margin:28px 0 0;">Werkt de knop niet? Plak deze link in je browser:<br/><span style="color:#9b3737;word-break:break-all;">${link}</span></p>
      <p style="font-size:13px;line-height:1.6;color:rgba(1,3,65,0.75);margin:24px 0 0;background:#f7f0dc;padding:12px 14px;">Let op: er is er steeds maar één geldig. Staan er meerdere van deze mails in je inbox, gebruik dan de allerlaatste. Klik je op een oudere, dan zie je dat de link niet meer werkt.</p>
      <p style="font-size:12px;line-height:1.6;color:rgba(1,3,65,0.45);margin:16px 0 0;">Heb je dit niet aangevraagd? Dan kun je deze mail negeren.</p>
    </div>
    <div style="text-align:center;font-size:11px;color:rgba(1,3,65,0.4);padding:18px 0;">Nacht van de Wijn · 6, 7 &amp; 8 november 2026 · Utrecht</div>
  </div></body></html>`
}

export function magicLinkHtml(naam: string, link: string) {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f0e4c0;font-family:Helvetica,Arial,sans-serif;color:#010341;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="background:#fef1d5;border:1px solid rgba(1,3,65,0.1);padding:36px 32px;">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9b3737;margin-bottom:10px;">Partner Portal</div>
      <h1 style="font-size:26px;line-height:1.1;margin:0 0 18px;color:#010341;text-transform:uppercase;">Inloglink</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">Hoi ${naam || 'daar'},</p>
      <p style="font-size:15px;line-height:1.7;margin:0 0 24px;">Hier is een eenmalige inloglink voor het Nacht van de Wijn portal. Klik op de knop hieronder om direct in te loggen, je hebt geen wachtwoord nodig.</p>
      <a href="${link}" style="display:inline-block;background:#010341;color:#fef1d5;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:14px 28px;">Inloggen</a>
      <p style="font-size:12px;line-height:1.6;color:rgba(1,3,65,0.5);margin:28px 0 0;">Werkt de knop niet? Plak deze link in je browser:<br/><span style="color:#9b3737;word-break:break-all;">${link}</span></p>
      <p style="font-size:13px;line-height:1.6;color:rgba(1,3,65,0.75);margin:24px 0 0;background:#f7f0dc;padding:12px 14px;">Let op: deze link werkt één keer, en er is er steeds maar één geldig. Staan er meerdere van deze mails in je inbox, gebruik dan de allerlaatste.</p>
      <p style="font-size:12px;line-height:1.6;color:rgba(1,3,65,0.45);margin:16px 0 0;">Heb je dit niet aangevraagd? Dan kun je deze mail negeren.</p>
    </div>
    <div style="text-align:center;font-size:11px;color:rgba(1,3,65,0.4);padding:18px 0;">Nacht van de Wijn · 6, 7 &amp; 8 november 2026 · Utrecht</div>
  </div></body></html>`
}

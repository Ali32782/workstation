/**
 * Built-in proposal templates (HTML fragments with `{{company.*}}` tokens).
 * Bump `PROPOSAL_PRESETS_VERSION` when changing text or structure so ops can
 * correlate exports and support tickets.
 */

export const PROPOSAL_PRESETS_VERSION = 1;

export const PROPOSAL_PRESETS: Array<{ id: string; label: string; html: string }> = [
  {
    id: "standard",
    label: "Angebot Standard",
    html: `<h2>Angebot</h2>
<p><em>{{today}}</em></p>
<p>Sehr geehrte Damen und Herren,</p>
<p>hiermit unterbreiten wir Ihnen unser Angebot für <strong>{{company.name}}</strong> ({{company.city | default:"—"}}, {{company.country | default:"—"}}).</p>
<p>Unsere Einschätzung zu Ihrer Praxis:</p>
<ul>
<li>Webseite: {{company.domain | default:"—"}}</li>
<li>Ansprechpartner CRM: {{company.owner | default:"—"}}</li>
<li>Telefon: {{company.phone | default:"—"}}</li>
<li>E-Mail: {{company.email | default:"—"}}</li>
<li>geschätzte Teamgröße (Therapeut*innen): {{company.employees | default:"—"}}</li>
<li>Terminsoftware: {{company.bookingSystem | default:"—"}}</li>
</ul>
<p>Im Anschluss besprechen wir gern Umfang, Laufzeit und nächste Schritte.</p>
<p>Mit freundlichen Grüßen</p>`,
  },
  {
    id: "short",
    label: "Angebot Kurz",
    html: `<h2>Kurzangebot</h2>
<p>{{today}} · <strong>{{company.name}}</strong></p>
<p>Gern unterbreiten wir ein kompaktes Angebot. Kontakt: {{company.phone | default:"—"}}, {{company.email | default:"—"}}.</p>
<p>Nächster Schritt: Termin mit {{company.owner | default:"Ihrem Team"}}.</p>`,
  },
  {
    id: "letter",
    label: "Anschreiben",
    html: `<p>{{today}}</p>
<p><strong>{{company.name}}</strong><br/>
{{company.city | default:"—"}} {{company.country | default:"—"}}</p>
<p>Betreff: MedTheris / Zusammenarbeit</p>
<p>Sehr geehrte Damen und Herren,</p>
<p>bezugnehmend auf unsere Gespräche möchten wir Ihnen die Zusammenarbeit mit MedTheris vorschlagen. Ihre Praxis mit {{company.employees | default:"—"}} Therapeut*innen und Standort {{company.city | default:"—"}} passt hervorragend zu unserem Fokus.</p>
<p>Wir freuen uns auf Ihre Rückmeldung.</p>
<p>Mit freundlichen Grüßen</p>`,
  },
];

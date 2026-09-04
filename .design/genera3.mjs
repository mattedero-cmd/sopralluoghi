import fs from 'fs';

/** Le icone VERE dell'app, lette dal suo sorgente: l'artboard «Oggi» deve
 *  mostrare quelle che l'utente ha davvero sotto il dito, non un ridisegno. */
function iconeDellApp() {
  const s = fs.readFileSync('../src/components/Icona.tsx', 'utf8');
  const blocco = s.slice(s.indexOf('const FORME'), s.indexOf('export function Icona'));
  const out = {};
  for (const m of blocco.matchAll(/^  ('?[a-z0-9-]+'?):\s*(<[^\n]*?)(?:,\s*)?$/gm)) {
    if (m[2].startsWith('(')) continue;
    out[m[1].replace(/'/g, '')] = m[2].replace(/,$/, '').replace(/\s+/g, ' ').trim();
  }
  for (const m of blocco.matchAll(/^  ('?[a-z0-9-]+'?):\s*\(\s*\n([\s\S]*?)\n  \),?$/gm)) {
    out[m[1].replace(/'/g, '')] = m[2].replace(/<>|<\/>/g, '').replace(/\n\s+/g, '').replace(/\s+/g, ' ').trim();
  }
  return out;
}
const A = iconeDellApp();
const sv = (n, s = 24) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${A[n]}</svg>`;

// la barra QUOTATURE di oggi, esattamente com'è nel codice
const GRUPPI = [
  ['quota-allin', 'Quote'], ['griglia', 'Quote multiple'], ['cerchio-3p', 'Cerchi e dettagli'],
  ['rettangolo', 'Forme quotate'], ['righello', 'Scala e piano']
];
// il pannello aperto: Scala e piano — sei voci, e «Togli la scala» prende il cestino
const VOCI = [
  ['auto', 'Quotatura automatica', 3], ['riferimento', 'Riferimento auto', 0],
  ['righello', 'Scala (segmento)', 5], ['piano', 'Piano (prospettiva)', 0],
  ['auto', 'Piano dalle forme', 3], ['cestino', 'Togli la scala', 3]
];

fs.writeFileSync('Prima.dc.html', `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
  body { margin: 0; }
  .tel { width: 390px; height: 844px; display: flex; flex-direction: column; overflow: hidden;
    background: #10141a; color: #f2f5f9;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 17px; }
  a { color: #58a6ff; } a:hover { color: #f2f5f9; }
  .testata { display: flex; align-items: center; padding: 14px 12px 10px; flex-shrink: 0;
    background: rgba(26,32,41,.86); border-bottom: 1px solid #36404f; }
  .testata .tit { font-size: 19px; font-weight: 700; }
  .oggi { margin-left: auto; font-size: 11px; font-weight: 700; letter-spacing: .1em;
    text-transform: uppercase; color: #ff453a; border: 1px solid #ff453a; border-radius: 999px;
    padding: 3px 9px; }
  .tab { display: flex; gap: 4px; padding: 10px 12px 0; flex-shrink: 0; }
  .tab button { flex: 1; padding: 9px 0; border-radius: 11px; border: 1px solid #36404f;
    background: #1a2029; color: #aab4c2; font-size: 13.5px; font-weight: 700; }
  .tab button.on { background: #242c38; color: #f2f5f9; border-color: #2f81f7; }
  .tela { flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;
    background: radial-gradient(120% 80% at 50% 0%, #1c232c 0%, #10141a 70%); }
  .nota { max-width: 300px; text-align: center; color: #aab4c2; font-size: 13.5px; line-height: 1.55; }
  .nota b { color: #f2f5f9; }
  .pannello { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
    gap: 8px; padding: 12px; background: #1a2029; border-top: 1px solid #36404f; }
  .voce { position: relative; min-height: 66px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 5px; border: 1px solid #36404f;
    border-radius: 16px; background: #242c38; font-size: 13px; font-weight: 600;
    text-align: center; line-height: 1.15; padding: 6px 4px; }
  .voce .bollo { position: absolute; top: -7px; right: -5px; width: 19px; height: 19px;
    border-radius: 999px; background: #ff453a; color: #fff; font-size: 10px; font-weight: 800;
    display: flex; align-items: center; justify-content: center; }
  .barra { display: flex; gap: 6px; padding: 8px 10px 14px; background: rgba(26,32,41,.92);
    border-top: 1px solid #36404f; }
  .cass { display: inline-flex; gap: 6px; padding: 6px; background: #10141a;
    border: 1px solid #36404f; border-radius: 16px; }
  .cass.cresci { flex: 1; min-width: 0; }
  .t { position: relative; flex: 1; min-width: 0; min-height: 50px; display: flex;
    flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    border-radius: 12px; padding: 4px 2px; }
  .t.on { background: #2f81f7; color: #fff; }
  .t .lab { font-size: 10px; font-weight: 600; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; max-width: 100%; }
  .t .bollo { position: absolute; top: 1px; right: 3px; width: 16px; height: 16px;
    border-radius: 999px; background: #ff453a; color: #fff; font-size: 9px; font-weight: 800;
    display: flex; align-items: center; justify-content: center; }
  </style>
</helmet>
<div class="tel">
  <div class="testata">
    <div class="tit">Bagno · parete A</div>
    <span class="oggi">Oggi</span>
  </div>
  <div class="tab">
    <button class="on">Quotature</button>
    <button>Disegno</button>
    <button>Schizzo</button>
  </div>
  <div class="tela">
    <p class="nota">Tre menù su ogni foto, <b>70 voci</b> in tutto — e <b>30</b> stanno
    nel menù «Schizzo», che su una foto normale non può funzionare.<br><br>
    Il numero rosso dice <b>quante cose diverse</b> fa quella stessa icona nel menù di oggi.</p>
  </div>
  <div class="pannello">
${VOCI.map(([k, t, n]) => `    <div class="voce">${n > 1 ? `<span class="bollo">${n}</span>` : ''}<span>${sv(k)}</span><span>${t}</span></div>`).join('\n')}
  </div>
  <div class="barra">
    <div class="cass">
      <div class="t"><span>${sv('cursore', 22)}</span><span class="lab">Seleziona</span></div>
      <div class="t"><span>${sv('duplica', 22)}</span><span class="lab">Richiama</span></div>
    </div>
    <div class="cass cresci">
${GRUPPI.map(([k, t], i) => {
  const n = { 'quota-allin': 6, griglia: 4, 'cerchio-3p': 2, rettangolo: 6, righello: 5 }[k];
  return `      <div class="t${i === 4 ? ' on' : ''}"><span class="bollo">${n}</span><span>${sv(k, 22)}</span><span class="lab">${t}</span></div>`;
}).join('\n')}
    </div>
  </div>
</div>
</x-dc>
<script data-dc-script>
class Component extends DCLogic {}
</script>
</body>
</html>
`);

// aggiorno i bolli anche sul pannello: righello ×5, auto ×3, cestino ×3
let p = fs.readFileSync('Prima.dc.html', 'utf8');
console.log('scritto Prima.dc.html');

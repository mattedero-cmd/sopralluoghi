import fs from 'fs';
import vm from 'vm';
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('icone.js', 'utf8') + ';globalThis.__I=ICONE;', ctx);
const I = ctx.__I;
const sv = (n, s = 24, w = 1.8) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

const BASE = `
  body { margin: 0; }
  .fg { background: #10141a; color: #f2f5f9; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    padding: 34px 36px 40px; }
  a { color: #58a6ff; } a:hover { color: #f2f5f9; }
  h1 { margin: 0 0 4px; font-size: 27px; font-weight: 800; letter-spacing: -.02em; }
  .sub { margin: 0 0 26px; color: #aab4c2; font-size: 14.5px; max-width: 62ch; line-height: 1.5; }
  h2 { margin: 26px 0 12px; font-size: 12px; font-weight: 700; letter-spacing: .12em;
    text-transform: uppercase; color: #8e9aab; }
`;

/* ---------------- tavola delle icone ---------------- */
const SEZ = [
  ['Fissi', ['seleziona','richiama']],
  ['Scala', ['scalaVuota','scalaFatta']],
  ['Gruppi · foto', ['gQuote','gCatene','gPezzi','gTondi','gSegni','gNote']],
  ['Quote', ['orizzontale','verticale','inclinata','angolo']],
  ['Catene', ['inSerie','daOrigine','progressiva']],
  ['Pezzi', ['riconosci','rettangolo','quattroAngoli','triangolo','spezzata']],
  ['Tondi', ['raggio','cerchio3p','foro','smusso']],
  ['Segni', ['linea','riquadro','ovale','poligono','penna']],
  ['Note', ['etichetta','testo','freccia','dettaglio']],
  ['Gruppi · pianta', ['gTraccia','gDetta','gRaddrizza']],
  ['Traccia', ['perimetro','ingombroRett','ingombroCerchio','nomeStanza','origine']],
  ['Detta misure', ['quotaDuePunti','angoloVertice','stessaMisura']],
  ['Raddrizza', ['ortogonale','mettiDritto','allinea','semplifica','ricostruisci','eliminaLato','sblocca']]
];
const nomeUmano = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/^G /, '');
const tot = SEZ.reduce((s, x) => s + x[1].length, 0);
const griglia = SEZ.map(([t, ks]) => `  <h2>${t}</h2>
  <div class="rig">
${ks.map((k) => `    <div class="cel"><span class="ic">${sv(k, 30)}</span><span class="nm">${nomeUmano(k)}</span></div>`).join('\n')}
  </div>`).join('\n');

fs.writeFileSync('Icone.dc.html', `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>${BASE}
  .rig { display: grid; grid-template-columns: repeat(auto-fit, minmax(126px, 1fr)); gap: 10px; }
  .cel { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px;
    min-height: 96px; padding: 12px 8px; border: 1px solid #36404f; border-radius: 16px;
    background: #1a2029; text-align: center; }
  .cel .ic { color: #f2f5f9; display: flex; }
  .cel .nm { font-size: 11.5px; font-weight: 600; color: #aab4c2; line-height: 1.2; }
  .conta { display: inline-flex; gap: 22px; margin-bottom: 8px; }
  .conta div { border: 1px solid #36404f; border-radius: 14px; padding: 10px 16px; background: #1a2029; }
  .conta b { display: block; font-size: 26px; font-weight: 800; letter-spacing: -.02em; }
  .conta span { font-size: 11.5px; color: #aab4c2; letter-spacing: .04em; }
  </style>
</helmet>
<div class="fg" style="width: 1000px;">
  <h1>Le icone</h1>
  <p class="sub">Stesso stile dell'app — 24×24, tratto 1,8, estremi tondi, <em>currentColor</em> — e
  nessuna disegnata due volte. Oggi 70 voci si dividono 26 icone: <em>angolo</em> da sola ne copre
  sette, <em>quota&#8209;allineata</em> sei, <em>rettangolo</em> sei. Qui ogni voce ha la sua.</p>
  <div class="conta">
    <div><b>${tot}</b><span>ICONE, TUTTE DIVERSE</span></div>
    <div><b>26</b><span>QUELLE DI OGGI</span></div>
    <div><b>0</b><span>DISEGNI RIPETUTI</span></div>
  </div>
${griglia}
</div>
</x-dc>
<script data-dc-script>
class Component extends DCLogic {}
</script>
</body>
</html>
`);

/* ---------------- i doppioni ---------------- */
const FUSE = [
  ['Schizzo stanza <span class="pos">Quotature › Forme quotate</span> + Mano libera <span class="pos">Schizzo › Disegno</span>',
   'È <b>lo stesso strumento</b>: <code>s: ’schizzo’</code> (:271) e <code>tool: ’schizzo’</code> (:402). Due nomi, due icone, due menù. E su una foto normale i rami parametrici sono chiusi da <code>foto.ePianta</code> â il menù promette un modo che il documento non sa eseguire.',
   'Una <b>porta</b>: «Pianta della stanza →». Non uno strumento, un passaggio di documento.'],
  ['Diagonale <span class="pos">Schizzo › Quote</span> + Quota distanza <span class="pos">Schizzo › Oggetti</span>',
   'Per il dito è lo stesso gesto: armo, tocco due cose, esce una misura. Le divide solo dove finiscono scritte, e stanno in due gruppi diversi.',
   '<b>Fra due punti</b>. Un nome, un gesto, un posto.'],
  ['Rendi ortogonale 90° + Snap 45° + Snap 30° <span class="pos">Schizzo › Pulizia</span>',
   'Una funzione sola con un parametro: nel codice è una riga, <code>passo = 30 : 45 : 90</code>.',
   '<b>Ortogonale</b>, col passo scelto lì dentro. 90° è il caso normale.'],
  ['Orizzontale + Verticale + Perpendicolare <span class="pos">Schizzo › Vincoli</span>',
   'Chiedono all’utente di nominare un asse che l’app legge da sola. Nessun posatore dice «applico un vincolo di orizzontalità».',
   '<b>Metti dritto</b>: tocchi un lato, va sull’asse più vicino.'],
  ['Collineare/complanare <span class="pos">Vincoli</span> + Unisci lati allineati <span class="pos">Pulizia</span>',
   'Stesso concetto in due gruppi e due registri: uno è vocabolario CAD, l’altro la sua conseguenza pratica.',
   '<b>Allinea</b>: due lati in linea, e se sono adiacenti si fondono.'],
  ['Rettangolo × 3 · Cerchio × 3 · Mano libera × 2 · Polilinea/Poligono',
   'Non sono doppioni ma <b>omonimi</b>: lo stesso nome per esiti diversi, che è peggio. Lo stesso rettangolo esce quotato, come segno o come ingombro secondo dove l’hai preso.',
   'Si <b>rinominano per l’esito</b>: Rettangolo (quotato) · Riquadro (segno) · Ingombro (pianta).'],
  ['Quota lato · Quota di riferimento · Blocca lato/ancora <span class="pos">Schizzo</span>',
   'Non sono strumenti: sono <b>cartelli stradali</b>. Toccandole non succede niente, mostrano un avviso che spiega dove sta davvero la funzione.',
   'Tolte dal menù. Se una funzione ha bisogno di un cartello, è nel posto sbagliato.']
];
const TAGLI = [
  ['Filettatura', 'quotatura meccanica: chi posa pellicole per vetri non filetta niente'],
  ['«Schizzo» come nome', 'in cantiere uno schizzo è un disegno approssimativo â qui è il modo <em>più</em> esatto dell’app. Il codice lo chiama già <em>pianta</em> dappertutto'],
  ['I tre tab su ogni foto', 'la pianta è un altro documento (<code>foto.ePianta</code>): non deve stare in un tab della foto']
];

fs.writeFileSync('Doppioni.dc.html', `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>${BASE}
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .88em;
    background: #242c38; padding: 1px 5px; border-radius: 5px; color: #cbd5e1; }
  .pos { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: .05em;
    color: #8e9aab; border: 1px solid #36404f; border-radius: 999px; padding: 1px 7px;
    margin-left: 6px; vertical-align: 1px; }
  .f { display: grid; grid-template-columns: 1fr 1fr; gap: 0 26px; padding: 16px 0;
    border-top: 1px solid #262f3b; }
  .f .a { grid-column: 1 / -1; font-size: 15.5px; font-weight: 700; margin-bottom: 7px;
    line-height: 1.45; }
  .f .b { font-size: 13.5px; line-height: 1.55; color: #aab4c2; }
  .f .c { font-size: 13.5px; line-height: 1.55; color: #f2f5f9;
    border-left: 2px solid #32d74b; padding-left: 13px; }
  .conta { display: flex; gap: 12px; margin: 4px 0 22px; }
  .conta div { flex: 1; border: 1px solid #36404f; border-radius: 16px; padding: 14px 16px;
    background: #1a2029; }
  .conta b { display: block; font-size: 30px; font-weight: 800; letter-spacing: -.03em; }
  .conta b em { font-style: normal; font-size: 17px; color: #8e9aab; font-weight: 700; }
  .conta span { font-size: 11.5px; color: #aab4c2; letter-spacing: .04em; }
  .tag { display: flex; gap: 12px; padding: 11px 0; border-top: 1px solid #262f3b;
    font-size: 13.5px; line-height: 1.5; }
  .tag b { min-width: 176px; color: #ff453a; font-weight: 700; }
  .tag span { color: #aab4c2; }
  .difetto { border: 1px solid #36404f; border-left: 3px solid #ffd60a; border-radius: 14px;
    padding: 14px 17px; margin-bottom: 10px; background: #1a2029; font-size: 13.5px;
    line-height: 1.55; color: #aab4c2; }
  .difetto b { color: #f2f5f9; }
  </style>
</helmet>
<div class="fg" style="width: 980px;">
  <h1>Che cosa si unisce, e perché</h1>
  <p class="sub">Il menù di oggi ha 70 voci. Non sono 70 funzioni: alcune sono la stessa cosa
  scritta due volte, altre portano lo stesso nome facendo cose diverse, e tre non fanno niente —
  spiegano soltanto dove sta la funzione vera.</p>

  <div class="conta">
    <div><b>70 <em>→ 33</em></b><span>VOCI DI MENÙ</span></div>
    <div><b>26 <em>→ ${tot}</em></b><span>ICONE, TUTTE DIVERSE</span></div>
    <div><b>3 <em>→ 2</em></b><span>MENÙ SULLA FOTO</span></div>
    <div><b>7</b><span>FUSIONI</span></div>
  </div>

  <h2>Due difetti trovati nel codice, per strada</h2>
  <div class="difetto"><b>Un comando che nessuno può chiamare.</b> <code>togliPiano</code> è
  dichiarato nel tipo (:217), implementato (:1004) e gestito (:4853) — ma nessuna voce di menù
  ha <code>comando: 'togliPiano'</code>. Il piano si toglie solo da una scheda flottante, per caso.
  Il commento nel codice dice «la calibrazione si toglie da dove si mette»: appunto.</div>
  <div class="difetto"><b>Un menù che promette quello che il documento non sa fare.</b>
  «Schizzo stanza» apre sulla foto normale il menù parametrico, con Vincoli e Pulizia — ma
  35 rami in <code>EditorFoto.tsx</code> sono chiusi da <code>foto.ePianta</code>, e lì dentro
  non possono funzionare.</div>

  <h2>Le fusioni</h2>
${FUSE.map(([a, b, c]) => `  <div class="f">
    <div class="a">${a}</div>
    <div class="b">${b}</div>
    <div class="c">${c}</div>
  </div>`).join('\n')}

  <h2>Quello che esce dal menù</h2>
${TAGLI.map(([a, b]) => `  <div class="tag"><b>${a}</b><span>${b}</span></div>`).join('\n')}
</div>
</x-dc>
<script data-dc-script>
class Component extends DCLogic {}
</script>
</body>
</html>
`);
console.log('scritti Icone.dc.html, Doppioni.dc.html — icone:', tot);

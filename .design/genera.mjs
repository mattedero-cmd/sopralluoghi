import fs from 'fs';
import vm from 'vm';
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('icone.js', 'utf8') + ';globalThis.__I=ICONE;', ctx);
const I = ctx.__I;

const sv = (n, s = 24) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

const FOTO = {
  misure: [
    { id: 'quote', ic: 'gQuote', t: 'Quote', voci: [
      ['orizzontale','Orizzontale'],['verticale','Verticale'],['inclinata','Inclinata'],['angolo','Angolo']] },
    { id: 'catene', ic: 'gCatene', t: 'Catene', voci: [
      ['inSerie','In serie'],['daOrigine','Da un’origine'],['progressiva','Progressiva']] },
    { id: 'pezzi', ic: 'gPezzi', t: 'Pezzi', voci: [
      ['riconosci','Riconosci forma'],['rettangolo','Rettangolo'],['quattroAngoli','4 angoli'],
      ['triangolo','Triangolo'],['spezzata','Spezzata']] },
    { id: 'tondi', ic: 'gTondi', t: 'Tondi', voci: [
      ['raggio','Raggio'],['cerchio3p','Cerchio 3 punti'],['foro','Foro ⌀/R'],['smusso','Smusso']] }
  ],
  note: [
    { id: 'segni', ic: 'gSegni', t: 'Segni', voci: [
      ['linea','Linea'],['riquadro','Riquadro'],['ovale','Ovale'],['poligono','Poligono'],['penna','Penna']] },
    { id: 'note', ic: 'gNote', t: 'Note', voci: [
      ['etichetta','Etichetta'],['testo','Testo'],['freccia','Freccia'],['dettaglio','Dettaglio']] }
  ]
};
const PIANTA = {
  pianta: [
    { id: 'traccia', ic: 'gTraccia', t: 'Traccia', voci: [
      ['perimetro','Perimetro a mano'],['ingombroRett','Ingombro rett.'],['ingombroCerchio','Ingombro tondo'],
      ['nomeStanza','Nome stanza'],['origine','Origine']] },
    { id: 'detta', ic: 'gDetta', t: 'Detta misure', voci: [
      ['quotaDuePunti','Fra due punti'],['angoloVertice','Angolo al vertice'],['stessaMisura','Stessa misura']] },
    { id: 'raddrizza', ic: 'gRaddrizza', t: 'Raddrizza', voci: [
      ['ortogonale','Ortogonale'],['mettiDritto','Metti dritto'],['allinea','Allinea'],
      ['semplifica','Semplifica'],['ricostruisci','Ricostruisci'],['eliminaLato','Elimina lato'],
      ['sblocca','Sblocca tutto']] }
  ]
};

const STILE = `
  :host, body { margin: 0; }
  .tel { width: 390px; height: 844px; position: relative; display: flex; flex-direction: column;
    background: var(--sfondo); color: var(--testo); overflow: hidden;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 17px; }
  a { color: var(--accento-2); } a:hover { color: var(--testo); }
  .testata { display: flex; align-items: center; gap: 10px; padding: 14px 12px 10px;
    background: color-mix(in srgb, var(--sfondo-2) 86%, transparent);
    border-bottom: 1px solid var(--bordo); flex-shrink: 0; }
  .testata .tit { font-size: 19px; font-weight: 700; letter-spacing: -.01em; }
  .testata .via { margin-left: auto; display: flex; gap: 8px; color: var(--testo-2); }
  .doc { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700;
    letter-spacing: .09em; text-transform: uppercase; padding: 4px 9px; border-radius: 999px;
    border: 1px solid var(--bordo); color: var(--testo-2); }
  .scala { display: flex; align-items: center; gap: 10px; padding: 10px 12px; flex-shrink: 0;
    border-bottom: 1px solid var(--bordo); cursor: pointer; }
  .scala .eti { font-size: 11px; font-weight: 700; letter-spacing: .08em;
    text-transform: uppercase; color: var(--testo-2); }
  .scala .val { font-size: 14px; font-weight: 600; }
  .scala .fine { margin-left: auto; color: var(--testo-2); display: flex; }
  .tela { flex: 1; position: relative; overflow: hidden;
    background:
      repeating-linear-gradient(0deg, rgba(255,255,255,.028) 0 1px, transparent 1px 34px),
      repeating-linear-gradient(90deg, rgba(255,255,255,.028) 0 1px, transparent 1px 34px),
      radial-gradient(120% 80% at 50% 0%, #1c232c 0%, #10141a 70%); }
  .fondo { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    color: var(--testo-2); font-size: 13px; letter-spacing: .04em; opacity: .5; }
  .barre { position: relative; flex-shrink: 0; }
  .velo { position: absolute; inset: auto 0 100% 0; height: 420px; }
  .pannello { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
    gap: 8px; padding: 12px 12px 14px; background: var(--sfondo-2);
    border-top: 1px solid var(--bordo); box-shadow: 0 -10px 24px rgba(0,0,0,.4); }
  .pannello .cap { grid-column: 1 / -1; display: flex; align-items: baseline; gap: 8px;
    margin-bottom: 2px; }
  .pannello .cap b { font-size: 15px; font-weight: 700; }
  .pannello .cap span { font-size: 12px; color: var(--testo-2); }
  .voce { width: 100%; min-height: var(--h-voce); display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 5px; border: 1px solid var(--bordo);
    border-radius: 16px; background: var(--sfondo-3); color: var(--testo);
    font-size: 13px; font-weight: 600; cursor: pointer; padding: 6px 4px; text-align: center;
    line-height: 1.15; }
  .voce.on { background: var(--accento); border-color: var(--accento); color: #fff; }
  .voce .ico { display: flex; }
  .porta { grid-column: 1 / -1; min-height: 54px; flex-direction: row; gap: 10px;
    border-style: dashed; border-color: var(--accento); color: var(--accento-2);
    background: color-mix(in srgb, var(--accento) 12%, transparent); }
  .scelta { grid-column: 1 / -1; display: flex; gap: 6px; align-items: center;
    padding: 8px 10px; border: 1px solid var(--bordo); border-radius: 14px;
    background: var(--sfondo); }
  .scelta .lab { font-size: 12px; color: var(--testo-2); margin-right: 2px; }
  .scelta button { flex: 1; padding: 8px 0; border-radius: 10px; border: 1px solid transparent;
    background: transparent; color: var(--testo-2); font-size: 13px; font-weight: 700;
    cursor: pointer; }
  .scelta button.on { background: var(--sfondo-3); border-color: var(--bordo); color: var(--testo); }
  .barra { display: flex; align-items: stretch; gap: 6px; padding: 8px 10px;
    padding-bottom: 14px; background: color-mix(in srgb, var(--sfondo-2) 92%, transparent);
    border-top: 1px solid var(--bordo); }
  .fisso { display: inline-flex; gap: 6px; padding: 6px; background: var(--sfondo);
    border: 1px solid var(--bordo); border-radius: 16px; flex-shrink: 0; }
  .gruppi { display: inline-flex; gap: 6px; padding: 6px; background: var(--sfondo);
    border: 1px solid var(--bordo); border-radius: 16px; flex: 1; min-width: 0; }
  .tasto { flex: 1; min-width: 0; min-height: 50px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 3px; border: none; border-radius: 12px;
    background: transparent; color: var(--testo); cursor: pointer; padding: 4px 2px; }
  .tasto.on { background: var(--accento); color: #fff; }
  .tasto .lab { font-size: 10.5px; font-weight: 600; letter-spacing: -.01em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .tab { display: flex; gap: 4px; padding: 8px 12px 0; flex-shrink: 0; }
  .tab button { flex: 1; padding: 9px 0; border-radius: 11px; border: 1px solid var(--bordo);
    background: var(--sfondo-2); color: var(--testo-2); font-size: 13.5px; font-weight: 700;
    cursor: pointer; }
  .tab button.on { background: var(--sfondo-3); color: var(--testo); border-color: var(--accento); }
`;

function tasti(gruppi) {
  return gruppi.map((g) =>
    `      <button class="tasto {{c.${g.id}}}" onClick="{{h.${g.id}}}">
        <span class="ico">${sv(g.ic, 22)}</span>
        <span class="lab">${g.t}</span>
      </button>`).join('\n');
}
function pannelli(gruppi, extra = {}) {
  return gruppi.map((g) => {
    const voci = g.voci.map(([v, t]) =>
      `        <button class="voce {{s.${v}}}" onClick="{{h.v_${v}}}">
          <span class="ico">${sv(v)}</span><span>${t}</span>
        </button>`).join('\n');
    return `    <sc-if value="{{p.${g.id}}}" hint-placeholder-val="{{ false }}">
      <div class="pannello">
        <div class="cap"><b>${g.t}</b><span>${g.voci.length} voci</span></div>
${voci}
${extra[g.id] || ''}      </div>
    </sc-if>`;
  }).join('\n');
}

function schermo({ file, titolo, doc, tabs, gruppi, scalaVal, scalaEti, scalaIco, extra, primoGruppo }) {
  const tuttiG = Object.values(gruppi).flat();
  const tuttiV = tuttiG.flatMap((g) => g.voci.map((v) => v[0]));
  const tabMk = tabs
    ? `  <div class="tab">
${tabs.map((t) => `    <button class="{{t.${t[0]}}}" onClick="{{h.m_${t[0]}}}">${t[1]}</button>`).join('\n')}
  </div>\n`
    : '';
  const barre = Object.entries(gruppi).map(([m, gs]) =>
    `  <sc-if value="{{m.${m}}}" hint-placeholder-val="{{ true }}">
    <div class="gruppi">
${tasti(gs)}
    </div>
  </sc-if>`).join('\n');
  const pan = Object.values(gruppi).map((gs) => pannelli(gs, extra || {})).join('\n');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>${STILE}</style>
</helmet>
<div class="tel" style="--sfondo: #10141a; --sfondo-2: #1a2029; --sfondo-3: #242c38; --bordo: #36404f; --testo: #f2f5f9; --testo-2: #aab4c2; --accento: {{accento}}; --accento-2: #58a6ff; --h-voce: {{altezzaVoce}}px;">
  <div class="testata">
    <div class="tit">${titolo}</div>
    <span class="doc">${sv(doc[0], 13)} ${doc[1]}</span>
    <div class="via">${sv('richiama', 20)}</div>
  </div>

  <div class="scala" onClick="{{h.scala}}" style="background: {{scalaFondo}};">
    <span style="color: {{scalaTinta}}; display: flex;">${sv(scalaIco, 22)}</span>
    <div>
      <div class="eti">${scalaEti}</div>
      <div class="val">${scalaVal}</div>
    </div>
    <span class="fine">${sv('gQuote', 18)}</span>
  </div>

  <div class="tela"><div class="fondo">la foto sta qui</div></div>

${tabMk}  <div class="barre">
    <div class="velo" onClick="{{h.chiudi}}" style="display: {{velo}};"></div>
${pan}
    <div class="barra">
      <div class="fisso">
        <button class="tasto {{c.seleziona}}" onClick="{{h.seleziona}}">
          <span class="ico">${sv('seleziona', 22)}</span><span class="lab">Seleziona</span>
        </button>
        <button class="tasto {{c.richiama}}" onClick="{{h.richiama}}">
          <span class="ico">${sv('richiama', 22)}</span><span class="lab">Richiama</span>
        </button>
      </div>
${barre}
    </div>
  </div>
</div>
</x-dc>
<script data-dc-script data-props='{"accento":{"editor":"color","default":"#2f81f7","options":["#2f81f7","#ff9f0a","#32d74b","#bf5af2"]},"altezzaVoce":{"editor":"range","default":66,"min":52,"max":84,"step":2,"unit":"px","section":"Densità"},"$preview":{"width":390,"height":844}}'>
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { menu: '${Object.keys(gruppi)[0]}', aperto: '${primoGruppo}', attivo: null, passo: 90 }; }
  renderVals() {
    const s = this.state;
    const acc = this.props.accento ?? '#2f81f7';
    const G = ${JSON.stringify(tuttiG.map((g) => g.id))};
    const V = ${JSON.stringify(tuttiV)};
    const M = ${JSON.stringify(Object.keys(gruppi))};
    const h = {
      chiudi: () => this.setState({ aperto: null }),
      scala: () => {},
      seleziona: () => this.setState({ attivo: null, aperto: null }),
      richiama: () => this.setState({ attivo: 'richiama', aperto: null })
    };
    const c = { seleziona: s.attivo === null ? 'on' : '', richiama: s.attivo === 'richiama' ? 'on' : '' };
    const p = {};
    const m = {};
    const t = {};
    const sel = {};
    for (const g of G) { h[g] = () => this.setState({ aperto: s.aperto === g ? null : g });
      c[g] = s.aperto === g ? 'on' : ''; p[g] = s.aperto === g; }
    for (const v of V) { h['v_' + v] = () => this.setState({ attivo: v }); sel[v] = s.attivo === v ? 'on' : ''; }
    for (const k of M) { h['m_' + k] = () => this.setState({ menu: k, aperto: null }); m[k] = s.menu === k; t[k] = s.menu === k ? 'on' : ''; }
    for (const k of [90, 45, 30]) sel['passo' + k] = s.passo === k ? 'on' : '';
    h.p90 = () => this.setState({ passo: 90 });
    h.p45 = () => this.setState({ passo: 45 });
    h.p30 = () => this.setState({ passo: 30 });
    return { accento: acc, altezzaVoce: this.props.altezzaVoce ?? 66,
      velo: s.aperto ? 'block' : 'none',
      scalaFondo: '${scalaEti}' === 'Nessuna scala' ? 'color-mix(in srgb, #ffd60a 10%, transparent)' : 'color-mix(in srgb, #32d74b 9%, transparent)',
      scalaTinta: '${scalaEti}' === 'Nessuna scala' ? '#ffd60a' : '#32d74b',
      h, c, p, m, t, s: sel };
  }
}
</script>
</body>
</html>
`;
}

const portaPianta = `        <button class="voce porta" onClick="{{h.v_riconosci}}">
          <span class="ico">${sv('gTraccia', 22)}</span><span>Pianta della stanza →</span>
        </button>
`;
const sceltaPasso = `        <div class="scelta">
          <span class="lab">Passo</span>
          <button class="{{s.passo90}}" onClick="{{h.p90}}">90°</button>
          <button class="{{s.passo45}}" onClick="{{h.p45}}">45°</button>
          <button class="{{s.passo30}}" onClick="{{h.p30}}">30°</button>
        </div>
`;

fs.writeFileSync('Main.dc.html', schermo({
  titolo: 'Bagno · parete A', doc: ['gPezzi', 'Foto'],
  tabs: [['misure', 'Misure'], ['note', 'Note']],
  gruppi: FOTO, primoGruppo: 'quote',
  scalaEti: 'Scala', scalaVal: 'Piano · parete A (prospettiva)', scalaIco: 'scalaFatta',
  extra: { pezzi: portaPianta }
}));
fs.writeFileSync('Pianta.dc.html', schermo({
  titolo: 'Bagno · pianta', doc: ['gTraccia', 'Pianta'],
  tabs: null, gruppi: PIANTA, primoGruppo: 'raddrizza',
  scalaEti: 'Scala', scalaVal: 'Ereditata dalla foto · 1 : 20', scalaIco: 'scalaFatta',
  extra: { raddrizza: sceltaPasso }
}));
console.log('scritti Main.dc.html, Pianta.dc.html');

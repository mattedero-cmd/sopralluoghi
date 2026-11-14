import { describe, expect, it } from 'vitest';
import type { Porta, PresetProgetto, QuotaPoligono } from '../../db/types';
import {
  MATERIALI_PREDEFINITI,
  PRESET_INIZIALE,
  conMaterialeCambiato,
  conPresetApplicato,
  fasciaDelPreset,
  materialeDiNascita,
  predefinitiTeli,
  presetDelMateriale,
  teliDelPreset,
  riassuntoPreset,
  supportoDelMateriale
} from '../preset';
import {
  NOME_SENZA_MATERIALE,
  essenzeDaPezzi,
  materialeNuovo,
  migraDocumento,
  type DocumentoNesting
} from '../documentoNesting';
import { NOME_MATERIALE_KIT, essenzeKit, sincronizzaKit } from '../portePiano';
import { raggruppaPezzi, type PezzoDaMisura } from '../../geometry/pezziDaSopralluogo';

/**
 * I MATERIALI DEL LAVORO: si dicono nel preset, si richiamano quando una
 * forma o una porta nasce, e il piano di taglio esce diviso per materiale.
 */

const preset: PresetProgetto = {
  ...PRESET_INIZIALE,
  materiali: [
    { id: 'sol', nome: 'Solare', supporto: { modo: 'bobina', lastra: { larghezza: 2500, altezza: 1250 }, bobina: { larghezza: 1520, metri: 30 } } },
    { id: 'aci', nome: 'Acidato' }
  ]
};

const forma = (extra: Partial<QuotaPoligono> = {}): QuotaPoligono =>
  ({
    id: 'p1',
    fotoId: 'f',
    tipo: 'quotaPoligono',
    zIndex: 1,
    stile: { colore: '#fff', spessore: 2, dimensioneTesto: 20 },
    punti: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ],
    unita: 'cm',
    stato: 'reale',
    ...extra
  }) as QuotaPoligono;

const pezzo = (nome: string, materialeId?: string): PezzoDaMisura => ({
  nome,
  larghezza: 1000,
  altezza: 800,
  quantita: 1,
  conAbbondanze: false,
  ...(materialeId ? { materialeId } : {})
});

describe('i materiali nel preset', () => {
  it('i cinque materiali di partenza', () => {
    expect(MATERIALI_PREDEFINITI).toEqual(['Solare', 'Acidato', 'Sicurezza', 'Murales', 'Coverstyle']);
  });

  it('una forma nasce col materiale del momento, o col primo', () => {
    expect(conPresetApplicato(forma(), preset, 'aci').materialeId).toBe('aci');
    expect(conPresetApplicato(forma(), preset).materialeId).toBe('sol');
    // un materiale che non c'è più nel preset non vale
    expect(conPresetApplicato(forma(), preset, 'via').materialeId).toBe('sol');
    expect(materialeDiNascita(preset, 'via')).toBe('sol');
  });

  it('una copia tiene il materiale che ha; senza materiali nel preset nessuno', () => {
    expect(conPresetApplicato(forma({ materialeId: 'aci' }), preset, 'sol').materialeId).toBe('aci');
    expect(conPresetApplicato(forma(), PRESET_INIZIALE, 'sol').materialeId).toBeUndefined();
    // la copia «solo etichetta» non è un pezzo: niente materiale
    expect(conPresetApplicato(forma({ soloEtichetta: true }), preset).materialeId).toBeUndefined();
  });

  it('il supporto è quello del materiale sopra quello del lavoro', () => {
    const s = supportoDelMateriale(preset, 'sol')!;
    expect(s.bobina.larghezza).toBe(1520);
    expect(s.margine).toBe(PRESET_INIZIALE.supporto.margine);
    expect(supportoDelMateriale(preset, 'aci')).toEqual(PRESET_INIZIALE.supporto);
  });

  it('la fascia dei teli è quella della bobina del materiale della forma', () => {
    const m = PRESET_INIZIALE.supporto.margine;
    expect(fasciaDelPreset(preset, 'mm', 'sol').massimo).toBe(1520 - 2 * m);
    expect(fasciaDelPreset(preset, 'mm', 'aci').massimo).toBe(1370 - 2 * m);
  });

  it('il riassunto dice i materiali', () => {
    expect(riassuntoPreset(preset)).toContain('Solare (preset suo), Acidato');
  });
});

describe('ogni materiale col suo preset', () => {
  // il coverstyle si lavora con cinque centimetri attorno, su bobina da
  // 1600, a teli orizzontali; il solare resta col predefinito
  const conSuo: PresetProgetto = {
    ...PRESET_INIZIALE,
    abbPerimetroMm: 20,
    materiali: [
      { id: 'sol', nome: 'Solare' },
      {
        id: 'cov',
        nome: 'Coverstyle',
        preset: {
          abbPerimetroMm: 50,
          supporto: { ...PRESET_INIZIALE.supporto, bobina: { larghezza: 1600, metri: 50 } },
          teli: { ...PRESET_INIZIALE.teli, asse: 'orizzontale', sormontoMm: 20 }
        }
      }
    ]
  };

  it('il preset di un materiale è il suo; senza, il predefinito', () => {
    expect(presetDelMateriale(conSuo, 'cov')?.abbPerimetroMm).toBe(50);
    expect(presetDelMateriale(conSuo, 'sol')?.abbPerimetroMm).toBe(20);
    expect(presetDelMateriale(conSuo, undefined)?.abbPerimetroMm).toBe(20);
    // il predefinito non porta con sé la lista dei materiali
    expect(presetDelMateriale(conSuo, 'sol')?.materiali).toBeUndefined();
  });

  it('una forma nasce con l\'abbondanza del preset del suo materiale', () => {
    expect(conPresetApplicato(forma(), conSuo, 'cov')).toMatchObject({ materialeId: 'cov', abbPerimetro: 5 });
    expect(conPresetApplicato(forma(), conSuo, 'sol')).toMatchObject({ materialeId: 'sol', abbPerimetro: 2 });
  });

  it('teli e fascia sono quelli del materiale', () => {
    expect(predefinitiTeli(conSuo, 'mm', 'cov')).toMatchObject({ asse: 'orizzontale', sormonto: 20 });
    expect(predefinitiTeli(conSuo, 'mm', 'sol')).toMatchObject({ asse: 'verticale', sormonto: 10 });
    expect(fasciaDelPreset(conSuo, 'mm', 'cov').massimo).toBe(1600 - 2 * PRESET_INIZIALE.supporto.margine);
    expect(teliDelPreset(forma({ materialeId: 'cov' }), null, conSuo)).toBeNull();
  });

  it('cambiando materiale l\'abbondanza segue il nuovo preset, se non era scritta a mano', () => {
    const nata = conPresetApplicato(forma(), conSuo, 'sol');
    expect(conMaterialeCambiato(nata, conSuo, 'cov')).toMatchObject({ materialeId: 'cov', abbPerimetro: 5 });
    // tre centimetri scritti a mano restano tre
    const aMano = { ...nata, abbPerimetro: 3 } as QuotaPoligono;
    expect(conMaterialeCambiato(aMano, conSuo, 'cov')).toMatchObject({ materialeId: 'cov', abbPerimetro: 3 });
  });

  it('il piano di taglio dà al materiale il supporto del suo preset', () => {
    const ess = essenzeDaPezzi([pezzo('A1', 'cov'), pezzo('A2', 'sol')], conSuo);
    expect(ess.map((m) => [m.nome, m.bobina.larghezza])).toEqual([
      ['Solare', 1370],
      ['Coverstyle', 1600]
    ]);
  });

  it('il riassunto segna chi ha un preset suo', () => {
    expect(riassuntoPreset(conSuo)).toContain('Solare, Coverstyle (preset suo)');
  });
});

describe('il piano di taglio diviso per materiale', () => {
  it('un\'essenza per materiale, col suo supporto; i pezzi senza materiale a parte', () => {
    const ess = essenzeDaPezzi([pezzo('A1', 'sol'), pezzo('A2', 'aci'), pezzo('A3', 'sol'), pezzo('A4')], preset);
    expect(ess.map((m) => [m.nome, m.pezzi.map((p) => p.nome)])).toEqual([
      ['Solare', ['A1', 'A3']],
      ['Acidato', ['A2']],
      [NOME_SENZA_MATERIALE, ['A4']]
    ]);
    expect(ess[0].modo).toBe('bobina');
    expect(ess[0].bobina.larghezza).toBe(1520);
    expect(ess[1].bobina.larghezza).toBe(1370);
  });

  it('un materiale senza pezzi non fa essenza, ma senza pezzi le fa tutte', () => {
    expect(essenzeDaPezzi([pezzo('A1', 'aci')], preset).map((m) => m.nome)).toEqual(['Acidato']);
    expect(essenzeDaPezzi([], preset).map((m) => m.nome)).toEqual(['Solare', 'Acidato']);
  });

  it('senza materiali nel preset è com\'era: un materiale solo', () => {
    const ess = essenzeDaPezzi([pezzo('A1'), pezzo('A2', 'sol')], PRESET_INIZIALE);
    expect(ess.map((m) => [m.nome, m.pezzi.length])).toEqual([['Materiale 1', 2]]);
  });

  it('due pezzi uguali di due materiali restano due righe', () => {
    expect(raggruppaPezzi([pezzo('A1', 'sol'), pezzo('A1', 'aci'), pezzo('A1', 'sol')]).map((p) => p.quantita)).toEqual([2, 1]);
  });
});

describe('i kit delle porte, per materiale', () => {
  const righe = [{ nome: 'Traverso · Stipite', larghezza: 158, lunghezza: 854, anta: false }];
  const porta = (id: string, materialeId?: string): Porta => ({
    id,
    progettoId: 'p',
    nome: `Porta ${id}`,
    lettera: id,
    descrizione: '',
    config: {},
    righe,
    creatoIl: 1,
    modificatoIl: 1,
    ...(materialeId ? { materialeId } : {})
  });
  const doc = (): DocumentoNesting => ({
    versione: 2,
    nome: 'T',
    materiali: [materialeNuovo('m1', 'Pareti')],
    attivo: 'm1',
    porte: { modi: { A: 'kit', B: 'kit', C: 'kit' } }
  });
  const conto = new Map([['A', 2], ['B', 1], ['C', 1]]);

  it('ogni materiale ha la sua essenza dei kit', () => {
    const d = sincronizzaKit(doc(), [porta('A', 'sol'), porta('B', 'aci'), porta('C')], conto, preset);
    const nomi = essenzeKit(d.porte).map((id) => d.materiali.find((m) => m.id === id)?.nome);
    expect(nomi.sort()).toEqual([NOME_MATERIALE_KIT, `${NOME_MATERIALE_KIT} · Acidato`, `${NOME_MATERIALE_KIT} · Solare`].sort());
    const sol = d.materiali.find((m) => m.nome.endsWith('Solare'))!;
    expect(sol.bobina.larghezza).toBe(1520);
    expect(sol.pezzi[0].quantita).toBe(2);
    // ferma: rifatta senza cambiamenti è lo stesso documento
    expect(sincronizzaKit(d, [porta('A', 'sol'), porta('B', 'aci'), porta('C')], conto, preset)).toBe(d);
    // e si rilegge dal salvataggio
    expect(migraDocumento(JSON.parse(JSON.stringify(d)))?.porte?.kitPerMateriale).toEqual(d.porte?.kitPerMateriale);
  });

  it('una porta che cambia materiale passa di essenza, e quella vuota se ne va', () => {
    const d1 = sincronizzaKit(doc(), [porta('A', 'sol')], conto, preset);
    const d2 = sincronizzaKit(d1, [porta('A', 'aci')], conto, preset);
    expect(d2.materiali.map((m) => m.nome)).toEqual(['Pareti', `${NOME_MATERIALE_KIT} · Acidato`]);
    expect(Object.keys(d2.porte?.kitPerMateriale ?? {})).toEqual(['aci']);
  });
});

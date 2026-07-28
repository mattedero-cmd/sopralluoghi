import Dexie, { type Table } from 'dexie';
import type {
  Annotazione,
  Cartella,
  Cliente,
  DisegnoSvg,
  Foto,
  Impostazioni,
  LavoroNesting,
  Preventivo,
  Progetto
} from './types';

/**
 * IndexedDB è l'unica fonte di verità dell'applicazione.
 * Tutte le scritture passano dal repository (vedi repository.ts),
 * che le esegue in transazioni e segnala ogni errore.
 */
export class SopralluoghiDB extends Dexie {
  cartelle!: Table<Cartella, string>;
  progetti!: Table<Progetto, string>;
  foto!: Table<Foto, string>;
  annotazioni!: Table<Annotazione, string>;
  impostazioni!: Table<Impostazioni, string>;
  clienti!: Table<Cliente, string>;
  preventivi!: Table<Preventivo, string>;
  nesting!: Table<LavoroNesting, string>;
  disegni!: Table<DisegnoSvg, string>;

  constructor() {
    super('sopralluoghi');
    this.version(1).stores({
      cartelle: 'id, parentId',
      progetti: 'id, cartellaId, modificatoIl',
      foto: 'id, progettoId',
      annotazioni: 'id, fotoId',
      impostazioni: 'id'
    });
    // Fase 3: anagrafica clienti e preventivi
    this.version(2).stores({
      cartelle: 'id, parentId',
      progetti: 'id, cartellaId, clienteId, modificatoIl',
      foto: 'id, progettoId',
      annotazioni: 'id, fotoId',
      impostazioni: 'id',
      clienti: 'id, nome',
      preventivi: 'id, progettoId, clienteId, numero'
    });
    // Fase 4: lavori di nesting salvati in archivio
    this.version(3).stores({
      cartelle: 'id, parentId',
      progetti: 'id, cartellaId, clienteId, modificatoIl',
      foto: 'id, progettoId',
      annotazioni: 'id, fotoId',
      impostazioni: 'id',
      clienti: 'id, nome',
      preventivi: 'id, progettoId, clienteId, numero',
      nesting: 'id, nome, modificatoIl'
    });
    // Fase 5: i lavori di nesting vivono nelle cartelle dell'archivio
    this.version(4)
      .stores({
        cartelle: 'id, parentId',
        progetti: 'id, cartellaId, clienteId, modificatoIl',
        foto: 'id, progettoId',
        annotazioni: 'id, fotoId',
        impostazioni: 'id',
        clienti: 'id, nome',
        preventivi: 'id, progettoId, clienteId, numero',
        nesting: 'id, nome, cartellaId, modificatoIl'
      })
      .upgrade(async (tx) => {
        // i lavori salvati prima non avevano una cartella: vanno in radice
        await tx
          .table('nesting')
          .toCollection()
          .modify((l: { cartellaId?: string | null }) => {
            if (l.cartellaId === undefined) l.cartellaId = null;
          });
      });
    // Fase 6: disegni SVG (file di taglio) tenuti in archivio
    this.version(5).stores({
      cartelle: 'id, parentId',
      progetti: 'id, cartellaId, clienteId, modificatoIl',
      foto: 'id, progettoId',
      annotazioni: 'id, fotoId',
      impostazioni: 'id',
      clienti: 'id, nome',
      preventivi: 'id, progettoId, clienteId, numero',
      nesting: 'id, nome, cartellaId, modificatoIl',
      disegni: 'id, nome, cartellaId, modificatoIl'
    });
    // Fase 7: piani di taglio e disegni possono stare DENTRO un progetto
    this.version(6).stores({
      cartelle: 'id, parentId',
      progetti: 'id, cartellaId, clienteId, modificatoIl',
      foto: 'id, progettoId',
      annotazioni: 'id, fotoId',
      impostazioni: 'id',
      clienti: 'id, nome',
      preventivi: 'id, progettoId, clienteId, numero',
      nesting: 'id, nome, cartellaId, progettoId, modificatoIl',
      disegni: 'id, nome, cartellaId, progettoId, modificatoIl'
    });
  }
}

export const db = new SopralluoghiDB();

import Dexie, { type Table } from 'dexie';
import type {
  Annotazione,
  Cartella,
  Cliente,
  Foto,
  Impostazioni,
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
  }
}

export const db = new SopralluoghiDB();

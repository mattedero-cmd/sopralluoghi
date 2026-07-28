import { useRotta } from './router';
import { Archivio } from './pages/Archivio';
import { ProgettoPage } from './pages/ProgettoPage';
import { ImpostazioniPage } from './pages/ImpostazioniPage';
import { ClientiPage, ClientePage } from './pages/ClientiPage';
import { PreventivoPage } from './pages/PreventivoPage';
import { NestingPage } from './pages/NestingPage';
import { DisegnoPage } from './pages/DisegnoPage';
import { EditorFoto } from './editor/EditorFoto';
import { Toasts } from './components/comuni';
import { PromemoriaSync } from './components/PromemoriaSync';

export function App() {
  const rotta = useRotta();
  return (
    <>
      {rotta.nome === 'archivio' && <Archivio cartellaId={rotta.cartellaId} key={rotta.cartellaId ?? 'radice'} />}
      {rotta.nome === 'progetto' && <ProgettoPage id={rotta.id} key={rotta.id} />}
      {rotta.nome === 'foto' && <EditorFoto fotoId={rotta.id} key={rotta.id} />}
      {rotta.nome === 'clienti' && <ClientiPage />}
      {rotta.nome === 'cliente' && <ClientePage id={rotta.id} key={rotta.id} />}
      {rotta.nome === 'preventivo' && <PreventivoPage id={rotta.id} key={rotta.id} />}
      {rotta.nome === 'nesting' && (
        <NestingPage
          key={rotta.id ?? rotta.nuovoIn ?? 'bozza'}
          id={rotta.id}
          nuovoIn={rotta.nuovoIn}
        />
      )}
      {rotta.nome === 'disegno' && <DisegnoPage id={rotta.id} key={rotta.id} />}
      {rotta.nome === 'impostazioni' && <ImpostazioniPage />}
      <PromemoriaSync />
      <Toasts />
    </>
  );
}

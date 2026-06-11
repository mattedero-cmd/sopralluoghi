import { useRotta } from './router';
import { Archivio } from './pages/Archivio';
import { ProgettoPage } from './pages/ProgettoPage';
import { ImpostazioniPage } from './pages/ImpostazioniPage';
import { EditorFoto } from './editor/EditorFoto';
import { Toasts } from './components/comuni';

export function App() {
  const rotta = useRotta();
  return (
    <>
      {rotta.nome === 'archivio' && <Archivio cartellaId={rotta.cartellaId} key={rotta.cartellaId ?? 'radice'} />}
      {rotta.nome === 'progetto' && <ProgettoPage id={rotta.id} key={rotta.id} />}
      {rotta.nome === 'foto' && <EditorFoto fotoId={rotta.id} key={rotta.id} />}
      {rotta.nome === 'impostazioni' && <ImpostazioniPage />}
      <Toasts />
    </>
  );
}

import { Link } from 'react-router-dom';
import { EmptyState } from '../components/Feedback';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Esta página no existe"
      action={
        <Link className="btn btn-primary" to="/personajes">
          Ir a Personajes
        </Link>
      }
    >
      Puede que el enlace esté mal escrito o que la página se haya movido.
    </EmptyState>
  );
}

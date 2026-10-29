import { NavLink, Link, Outlet } from 'react-router-dom';
import { useConnection } from '../hooks/useSettings';
import { ToastProvider } from './Toast';

const icons: Record<string, string> = {
  personajes: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c.7-4.4 4-7 8-7s7.300 2.600 8 7',
  estudio: 'M4 20l9-9m0 0l2 2m-2-2l2-2 4 4-2 2m-4-4l4 4M5 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
  galeria: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M9 9h.01',
  ajustes: 'M5 7h9m4 0h1M5 17h1m4 0h9M14 4v6M10 14v6',
};
const NAV = [
  { to: '/personajes', label: 'Personajes', icon: 'personajes' },
  { to: '/estudio', label: 'Estudio', icon: 'estudio' },
  { to: '/galeria', label: 'Galería', icon: 'galeria' },
  { to: '/ajustes', label: 'Ajustes', icon: 'ajustes' },
];

function ConnectionBanner() {
  const state = useConnection();
  if (state === 'offline') {
    return (
      <div className="banner banner-warn" role="alert">
        <p>
          <strong>No se puede conectar con la API.</strong> Revisa que el servidor esté en marcha y que la URL sea correcta.
        </p>
        <Link to="/ajustes" className="banner-link">
          Ir a Ajustes
        </Link>
      </div>
    );
  }
  if (state === 'unauthorized') {
    return (
      <div className="banner banner-error" role="alert">
        <p>
          <strong>La clave de acceso no es válida.</strong> El servidor rechazó la clave API que tienes guardada.
        </p>
        <Link to="/ajustes" className="banner-link">
          Ir a Ajustes
        </Link>
      </div>
    );
  }
  return null;
}

export function Layout() {
  return (
    <ToastProvider>
      <div className="app">
        <header className="brandbar">
          <Link to="/personajes" className="brand">
            <img src="/icons/favicon.svg" alt="" width="32" height="32" />
            <span>
              AI Creator <b>Studio</b>
            </span>
          </Link>
        </header>
        <nav className="nav" aria-label="Principal">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path d={icons[n.icon]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <main className="main" id="contenido">
          <ConnectionBanner />
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}

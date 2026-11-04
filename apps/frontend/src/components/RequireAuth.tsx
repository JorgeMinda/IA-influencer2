import { useEffect, useState } from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { isAuthenticated, subscribeAuth } from '../services/auth';

export function RequireAuth() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const location = useLocation();

  useEffect(() => {
    return subscribeAuth((session) => {
      setAuthed(!!session?.access_token);
    });
  }, []);

  if (!authed) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

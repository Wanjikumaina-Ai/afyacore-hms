import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigate,
  useLocation,
} from 'react-router';
import './global.css';
import { Toaster } from 'sonner';
import { useEffect, useState } from 'react';

const SessionProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export const links = () => [];

function AppGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const publicPaths = ['/account/signin', '/account/activate'];
    if (publicPaths.includes(location.pathname)) {
      setChecking(false);
      return;
    }

    async function check() {
      try {
        // Check session via GET
        const authRes = await fetch('http://localhost:8080/api/auth/token', {
          credentials: 'include',
        });
        const authData = await authRes.json();

        if (authData.user) {
          setChecking(false);
          return;
        }

        // No session — check license by attempting dummy signin
        const licRes = await fetch('http://localhost:8080/api/auth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'signin', email: '', password: '' }),
          credentials: 'include',
        });
        const licData = await licRes.json();

        if (licData.error?.includes('License error')) {
          navigate('/account/activate');
        } else {
          navigate('/account/signin');
        }
      } catch {
        navigate('/account/signin');
      } finally {
        setChecking(false);
      }
    }

    check();
  }, [location.pathname]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F172A]">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-white/10">
            <svg className="h-10 w-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="text-white font-semibold text-lg">AfyaCore HMS</p>
          <p className="text-white/60 text-sm mt-1">Starting...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <AppGuard>{children}</AppGuard>
        <Toaster position="bottom-right" />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  );
}
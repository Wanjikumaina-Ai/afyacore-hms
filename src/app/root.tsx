import {
  Links, Meta, Outlet, Scripts, ScrollRestoration, useNavigate, useLocation,
} from 'react-router';
import './global.css';
import { Toaster } from 'sonner';
import { useEffect, useState, useRef } from 'react';

export const links = () => [];

const publicPaths = ['/account/signin', '/account/activate'];
const API_BASE = typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'http://localhost:8080' : '';

function AppGuard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(() => !publicPaths.includes(location.pathname));
  const checked = useRef(false);

  useEffect(() => {
    if (publicPaths.includes(location.pathname)) { setChecking(false); return; }
    if (checked.current) return;
    checked.current = true;

    async function check() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const authRes = await fetch(`${API_BASE}/api/auth/token`, {
          credentials: 'include', signal: controller.signal,
        });
        clearTimeout(timeout);
        const authData = await authRes.json();
        if (authData.user) { setChecking(false); return; }
        navigate('/account/signin');
      } catch {
        navigate('/account/signin');
      } finally {
        setChecking(false);
      }
    }
    check();
  }, []);

  if (checking) {
    return (
      <div style={{ display:'flex', minHeight:'100vh', alignItems:'center', justifyContent:'center', background:'#0F172A' }}>
        <div style={{ textAlign:'center' }}>
          <img src={window.location.protocol === 'file:' ? './icon.png' : '/icon.png'} alt="" style={{ width:64, height:64, borderRadius:16, marginBottom:16 }} />
          <p style={{ color:'#fff', fontWeight:600, fontSize:18, margin:0 }}>AfyaCore HMS</p>
          <p style={{ color:'rgba(255,255,255,0.5)', fontSize:14, marginTop:4 }}>Starting...</p>
        </div>
      </div>
    );
  }

  return <Outlet />;
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
        {children}
        <Toaster position="bottom-right" />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <AppGuard />;
}
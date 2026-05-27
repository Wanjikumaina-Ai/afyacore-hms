import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ClientConnectScreen from '../setup/ClientConnectScreen';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClientConnectScreen />
  </StrictMode>
);

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Client app build - only the connect-to-server screen
// This is a tiny build, no HMS modules loaded here
export default defineConfig({
  plugins: [react()],
  base: './',
  root: 'src/client-app',
  build: {
    outDir: '../../dist-client',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/client-app/index.html'),
      },
    },
  },
  server: {
    port: 5174,
  },
  define: {
    __APP_MODE__: JSON.stringify('client'),
  },
});

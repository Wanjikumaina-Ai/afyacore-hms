import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Hono } from 'hono';
import type { Handler } from 'hono/types';
import updatedFetch from '../src/__create/fetch';

const API_BASENAME = '/api';
const api = new Hono();

// In production (packaged Electron), APP_ROOT is set by main.cjs to the app root.
// In dev, resolve relative to this file as before.
const __dirname = process.env.APP_ROOT
  ? join(process.env.APP_ROOT, 'src/app/api').replace(/\\/g, '/')
  : join(fileURLToPath(new URL('.', import.meta.url)), '../src/app/api').replace(/\\/g, '/');

if (globalThis.fetch) {
  globalThis.fetch = updatedFetch;
}

async function findRouteFiles(dir: string): Promise<string[]> {
  const files = await readdir(dir);
  let routes: string[] = [];
  for (const file of files) {
    try {
      const filePath = join(dir, file).replace(/\\/g, '/');
      const statResult = await stat(filePath);
      if (statResult.isDirectory()) {
        routes = routes.concat(await findRouteFiles(filePath));
      } else if (file === 'route.js') {
        if (filePath === join(__dirname, 'route.js').replace(/\\/g, '/')) {
          routes.unshift(filePath);
        } else {
          routes.push(filePath);
        }
      }
    } catch (error) {
      console.error(`Error reading file ${file}:`, error);
    }
  }
  return routes;
}

function getHonoPath(routeFile: string): { name: string; pattern: string }[] {
  const normalizedFile = routeFile.replace(/\\/g, '/');
  const normalizedDirname = __dirname.replace(/\\/g, '/');
  const relativePath = normalizedFile.replace(normalizedDirname, '');
  const parts = relativePath.split('/').filter(Boolean);
  const routeParts = parts.slice(0, -1);
  if (routeParts.length === 0) {
    return [{ name: 'root', pattern: '' }];
  }
  const transformedParts = routeParts.map((segment) => {
    const match = segment.match(/^\[(\.{3})?([^\]]+)\]$/);
    if (match) {
      const [_, dots, param] = match;
      return dots === '...'
        ? { name: param, pattern: `:${param}{.+}` }
        : { name: param, pattern: `:${param}` };
    }
    return { name: segment, pattern: segment };
  });
  return transformedParts;
}

async function registerRoutes() {
  const routeFiles = (
    await findRouteFiles(__dirname).catch((error) => {
      console.error('Error finding route files:', error);
      return [];
    })
  )
    .slice()
    .sort((a, b) => b.length - a.length);

  api.routes = [];

  for (const routeFile of routeFiles) {
    try {
      const fileUrl = pathToFileURL(routeFile).href;
      const route = await import(/* @vite-ignore */ `${fileUrl}?update=${Date.now()}`);
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      for (const method of methods) {
        try {
          if (route[method]) {
            const parts = getHonoPath(routeFile);
            const honoPath = `/${parts.map(({ pattern }) => pattern).join('/')}`;
            console.log(`[route-builder] Registered ${method} ${honoPath}`);
            const handler: Handler = async (c) => {
              const params = c.req.param();
              if (import.meta.env.DEV) {
                const updatedRoute = await import(
                  /* @vite-ignore */ `${pathToFileURL(routeFile).href}?update=${Date.now()}`
                );
                return await updatedRoute[method](c.req.raw, { params });
              }
              return await route[method](c.req.raw, { params });
            };
            switch (method.toLowerCase()) {
              case 'get':    api.get(honoPath, handler);    break;
              case 'post':   api.post(honoPath, handler);   break;
              case 'put':    api.put(honoPath, handler);    break;
              case 'delete': api.delete(honoPath, handler); break;
              case 'patch':  api.patch(honoPath, handler);  break;
            }
          }
        } catch (error) {
          console.error(`Error registering route ${routeFile} for method ${method}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error importing route file ${routeFile}:`, error);
    }
  }
}

await registerRoutes();

if (import.meta.env.DEV) {
  import.meta.glob('../src/app/api/**/route.js', { eager: true });
  if (import.meta.hot) {
    import.meta.hot.accept(() => {
      registerRoutes().catch((err) => console.error('Error reloading routes:', err));
    });
  }
}

export { api, API_BASENAME };
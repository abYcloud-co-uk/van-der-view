import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev-only proxy for the DeepSeek chat API. The key lives in `examples/demo/.env`
 * (gitignored) and is read here in the Node config — it is NEVER sent to the
 * browser bundle. The browser POSTs to `/api/chat`; this forwards to DeepSeek with
 * the Authorization header attached server-side.
 */
function deepseekProxy(apiKey: string, baseUrl: string, defaultModel: string): PluginOption {
  return {
    name: 'deepseek-proxy',
    configureServer(server) {
      server.middlewares.use('/api/chat', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', async () => {
          const json = (status: number, payload: unknown) => {
            res.statusCode = status;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(payload));
          };
          if (!apiKey) {
            json(500, {
              error: 'DEEPSEEK_API_KEY is not set. Copy examples/demo/.env.example to .env and add your key.',
            });
            return;
          }
          try {
            const payload = JSON.parse(body || '{}');
            const upstream = await fetch(`${baseUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: payload.model ?? defaultModel,
                messages: payload.messages,
                tools: payload.tools,
                tool_choice: payload.tool_choice ?? 'auto',
                temperature: payload.temperature ?? 0.2,
              }),
            });
            const text = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader('content-type', 'application/json');
            res.end(text);
          } catch (e) {
            json(502, { error: e instanceof Error ? e.message : String(e) });
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Resolve .env from THIS config's directory (not process.cwd()) so the key loads
  // no matter where the dev server is launched from. '' = no prefix filter, so we
  // can read DEEPSEEK_* (not just VITE_*) server-side.
  const here = fileURLToPath(new URL('.', import.meta.url));
  const env = loadEnv(mode, here, '');
  return {
    plugins: [
      react(),
      deepseekProxy(
        env.DEEPSEEK_API_KEY ?? '',
        env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
        env.DEEPSEEK_MODEL ?? 'deepseek-chat',
      ),
    ],
    resolve: {
      // Order matters — Vite matches aliases by prefix, so the "/browser" subpath MUST
      // stay above the bare package name; reversed, "/browser" would resolve to
      // src/index.ts and break the demo. (Same longest-match-first rule as tsconfig paths.)
      alias: [
        { find: '@abycloud-co-uk/van-der-view/browser', replacement: fileURLToPath(new URL('../../src/browser.ts', import.meta.url)) },
        { find: '@abycloud-co-uk/van-der-view', replacement: fileURLToPath(new URL('../../src/index.ts', import.meta.url)) },
      ],
    },
  };
});

import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const frontend = new URL('../apps/frontend/', import.meta.url);
const standalone = new URL('.next/standalone/apps/frontend/', frontend);
const server = new URL('server.js', standalone);

if (!existsSync(server)) {
  throw new Error('Run npm run build before the sales E2E production server.');
}

// Next standalone output needs public assets copied alongside its server.
for (const directory of ['public', '.next/static']) {
  const source = new URL(`${directory}/`, frontend);
  if (existsSync(source)) {
    cpSync(
      fileURLToPath(source),
      fileURLToPath(new URL(`${directory}/`, standalone)),
      {
        recursive: true,
      },
    );
  }
}

await import(server.href);

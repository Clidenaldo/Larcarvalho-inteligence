import { fileURLToPath } from 'node:url';

import { config as loadEnvironment } from 'dotenv';

loadEnvironment({
  path: fileURLToPath(new URL('../../../../.env', import.meta.url)),
  quiet: true,
});

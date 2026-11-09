import { config } from './config.js';
import { openDb } from './db.js';
import { createCrypto } from './crypto.js';
import { createApp } from './app.js';

const db = openDb(config.dbPath);
const app = createApp({ db, crypto: createCrypto(config.secret), config });

const server = app.listen(config.port, () => {
  console.log(`🎄 Gwiazdka działa na porcie ${config.port} (${config.isProd ? 'prod' : 'dev'})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}

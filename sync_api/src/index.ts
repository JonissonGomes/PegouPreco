import express from 'express';
import cors from 'cors';
import {config} from './config.js';
import {DataStore} from './store.js';
import {createRouter} from './app.js';

async function main() {
  const store = await DataStore.open({
    mongoUri: config.mongoUri || undefined,
    dbName: config.mongoDb,
  });

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      console.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`,
      );
    });
    next();
  });
  app.use(createRouter(store));

  const purge = () => {
    void store.purgeStale().catch(err => {
      console.error('Falha ao limpar dados expirados', err);
    });
  };
  purge();
  const purgeTimer = setInterval(purge, 6 * 60 * 60 * 1000);
  purgeTimer.unref?.();

  app.listen(config.port, '0.0.0.0', () => {
    console.log(
      `PegouPreço sync_api em http://0.0.0.0:${config.port} · store=${store.mode}`,
    );
    const jev = config.jevApiKey;
    if (!jev) {
      console.log('JEV desligado: JEV_API_KEY vazia.');
    } else if (!jev.startsWith('jv_live_') && !jev.startsWith('jv_test_')) {
      console.log(
        'JEV: a chave carregada não começa com jv_live_. O formato antigo apikey_ recebe HTTP 401.',
      );
    } else {
      console.log('JEV: chave jv_live_ carregada.');
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

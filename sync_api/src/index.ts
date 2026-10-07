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
  app.use(createRouter(store));

  app.listen(config.port, '0.0.0.0', () => {
    console.log(
      `PegouPreço sync_api em http://0.0.0.0:${config.port} · store=${store.mode}`,
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

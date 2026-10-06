import {prefs} from './repositories';
import {syncApi} from './remote/syncApi';

export async function runFullSync(): Promise<{ok: boolean; message: string}> {
  const raw = prefs.getAuthJson();
  if (!raw) {
    return {ok: false, message: 'Faça login para sincronizar'};
  }
  try {
    const session = JSON.parse(raw) as {token: string};
    const since = new Date(0).toISOString();
    await syncApi.pullSince(session.token, since);
    await syncApi.pushBatch(session.token, {
      products: [],
      markets: [],
      priceLogs: [],
      shoppingLists: [],
    });
    return {ok: true, message: 'Sincronização concluída'};
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Falha na sync',
    };
  }
}

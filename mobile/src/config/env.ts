import Config from 'react-native-config';

const cfg = (Config ?? {}) as Record<string, string | undefined>;

/** Mesma chave do ResenhaFC: REACT_APP_MAPBOX_ACCESS_TOKEN */
export const MAPBOX_ACCESS_TOKEN =
  cfg.MAPBOX_ACCESS_TOKEN || cfg.REACT_APP_MAPBOX_ACCESS_TOKEN || '';

export const SYNC_API_BASE = cfg.SYNC_API_BASE || 'http://10.0.2.2:8080';

export const SEED_DEMO = String(cfg.SEED_DEMO || '').toLowerCase() === 'true';

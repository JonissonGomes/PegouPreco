import axios from 'axios';
import {SYNC_API_BASE} from '@/config/env';
import type {PasskeyCreateResult, PasskeyGetResult} from 'react-native-passkey';
import {notifySessionRejected} from './sessionGate';

const client = axios.create({
  baseURL: SYNC_API_BASE,
  // Render (plano free) dorme e a 1ª chamada pode levar ~50s.
  timeout: 60000,
  headers: {'Content-Type': 'application/json'},
});

client.interceptors.response.use(undefined, async error => {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    const msg = (error.response.data as {error?: string} | undefined)?.error;
    if (msg === 'sessão expirada' || msg === 'unauthorized') {
      notifySessionRejected();
    }
    return Promise.reject(error);
  }
  const cfg = error.config as (typeof error.config & {__retried?: boolean}) | undefined;
  if (
    !cfg ||
    cfg.__retried ||
    (axios.isAxiosError(error) && error.response)
  ) {
    return Promise.reject(error);
  }
  cfg.__retried = true;
  await new Promise(resolve => setTimeout(resolve, 2000));
  return client.request(cfg);
});

function auth(token: string) {
  return {Authorization: `Bearer ${token}`};
}

export type AuthResponse = {
  token?: string;
  userId?: string;
  id?: string;
  email?: string;
  phone?: string;
  displayName?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  needsVerification?: boolean;
  otpChannel?: 'email' | 'phone';
  role?: 'user' | 'admin';
  hasPasskey?: boolean;
  tokenExpiresAt?: string | null;
  devCode?: string;
  hint?: string;
  ok?: boolean;
};

export type AdminMarketBody = {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  cnpj?: string | null;
  city?: string | null;
};

export type AdminMarketRemote = AdminMarketBody & {
  id: string;
  updatedAt?: string;
};

export type UserPrefsRemote = {
  city?: string;
  neighborhood?: string;
  favoriteMarketIds?: string[];
};

export type ReputationRemote = {
  userId: string;
  points: number;
  level: string;
  validationsCount: number;
  badges: string[];
  updatedAt?: string;
};

export const syncApi = {
  health: () => client.get('/health').then(r => r.data),
  register: (body: {
    email: string;
    password: string;
    displayName: string;
    phone: string;
    uf?: string;
    city?: string;
  }) => client.post<AuthResponse>('/auth/register', body).then(r => r.data),
  verify: (body: {email?: string; phone?: string; code: string}) =>
    client.post<AuthResponse>('/auth/verify', body).then(r => r.data),
  resendCode: (body: {
    email?: string;
    phone?: string;
    channel?: 'email' | 'phone';
  }) => client.post<AuthResponse>('/auth/resend-code', body).then(r => r.data),
  requestOtp: (body: {phone?: string; email?: string}) =>
    client.post<AuthResponse>('/auth/otp/request', body).then(r => r.data),
  verifyOtp: (body: {phone?: string; email?: string; code: string}) =>
    client.post<AuthResponse>('/auth/otp/verify', body).then(r => r.data),
  login: (email: string, password: string) =>
    client
      .post<AuthResponse>('/auth/login', {email, password})
      .then(r => r.data),
  passkeyRegisterOptions: (token: string) =>
    client
      .post('/auth/passkey/register/options', {}, {headers: auth(token)})
      .then(r => r.data),
  passkeyRegisterVerify: (token: string, body: PasskeyCreateResult) =>
    client
      .post('/auth/passkey/register/verify', body, {headers: auth(token)})
      .then(r => r.data as {ok?: boolean}),
  passkeyLoginOptions: () =>
    client.post('/auth/passkey/login/options', {}).then(r => r.data),
  disablePasskey: (token: string) =>
    client
      .post('/auth/passkey/disable', {}, {headers: auth(token)})
      .then(r => r.data as {ok?: boolean; hasPasskey?: boolean}),
  passkeyLoginVerify: (body: PasskeyGetResult) =>
    client
      .post<AuthResponse>('/auth/passkey/login/verify', body)
      .then(r => r.data),
  me: (token: string) =>
    client.get('/auth/me', {headers: auth(token)}).then(r => r.data),
  getPrefs: (token: string) =>
    client
      .get<UserPrefsRemote>('/me/prefs', {headers: auth(token)})
      .then(r => r.data),
  putPrefs: (token: string, body: UserPrefsRemote) =>
    client
      .put('/me/prefs', body, {headers: auth(token)})
      .then(r => r.data as UserPrefsRemote),
  reputation: (token: string) =>
    client
      .get<ReputationRemote>('/me/reputation', {headers: auth(token)})
      .then(r => r.data),
  compareBasket: (
    token: string,
    body: {
      city?: string;
      neighborhood?: string;
      favoriteMarketIds?: string[];
      items: Array<{productName: string; quantity: number; productRemoteId?: string}>;
    },
  ) =>
    client
      .post('/compare/basket', body, {headers: auth(token)})
      .then(
        r =>
          r.data as {
            markets: Array<Record<string, unknown>>;
            coldStart?: boolean;
          },
      ),
  communityPrices: (
    token: string,
    params?: {city?: string; productName?: string},
  ) =>
    client
      .get('/prices/community', {headers: auth(token), params})
      .then(r => r.data),
  pushBatch: (token: string, payload: Record<string, unknown>) =>
    client
      .post('/sync/push', payload, {headers: auth(token)})
      .then(r => r.data),
  pullSince: (token: string, since: string) =>
    client
      .get('/sync/pull', {params: {since}, headers: auth(token)})
      .then(r => r.data),
  marketsMap: (
    token?: string | null,
    params?: {lat?: number; lng?: number; radiusKm?: number},
  ) =>
    client
      .get('/markets/map', {
        ...(token ? {headers: auth(token)} : {}),
        params,
      })
      .then(r => {
        const data = r.data as
          | Array<Record<string, unknown>>
          | {markets?: Array<Record<string, unknown>>};
        if (Array.isArray(data)) return data;
        return data.markets ?? [];
      }),
  marketReviews: (marketId: string) =>
    client
      .get(`/markets/${marketId}/reviews`)
      .then(r => r.data as Array<Record<string, unknown>>),
  submitMarketReview: (token: string, marketId: string, stars: number) =>
    client
      .post(
        `/markets/${marketId}/reviews`,
        {stars},
        {headers: auth(token)},
      )
      .then(r => r.data),
  castVote: (
    token: string,
    body: {
      priceLogId: string;
      vote: string;
      withPhoto?: boolean;
      weight?: number;
    },
  ) =>
    client.post('/votes/check', body, {headers: auth(token)}).then(r => r.data),
  adminListMarkets: (token: string) =>
    client
      .get<AdminMarketRemote[]>('/admin/markets', {headers: auth(token)})
      .then(r => r.data),
  adminUpsertMarket: (token: string, body: AdminMarketBody) =>
    client
      .post<AdminMarketRemote>('/admin/markets', body, {headers: auth(token)})
      .then(r => r.data),
  adminDeleteMarket: (token: string, id: string) =>
    client
      .delete(`/admin/markets/${encodeURIComponent(id)}`, {headers: auth(token)})
      .then(r => r.data),
  adminResolveSuggestionGroup: (
    token: string,
    body: {
      approve: boolean;
      targetMarketId?: string | null;
      reportType: string;
      name: string;
      lat?: number | null;
      lng?: number | null;
    },
  ) =>
    client
      .post<{ok?: boolean; resolved?: number}>(
        '/admin/market-suggestions/resolve-group',
        body,
        {headers: auth(token)},
      )
      .then(r => r.data),
  submitMarketSuggestion: (
    token: string,
    body: {
      name: string;
      lat: number;
      lng: number;
      address?: string | null;
      cnpj?: string | null;
      kind: 'add' | 'fix' | 'confirm';
      reportType?: string | null;
      targetMarketId?: string | null;
      note?: string | null;
    },
  ) =>
    client
      .post('/markets/suggestions', body, {headers: auth(token)})
      .then(r => r.data),
  adminListMarketSuggestions: (
    token: string,
    status: string = 'pending',
  ) =>
    client
      .get<{suggestions: Array<Record<string, unknown>>}>(
        '/admin/market-suggestions',
        {headers: auth(token), params: {status}},
      )
      .then(r => r.data.suggestions ?? []),
  adminResolveMarketSuggestion: (
    token: string,
    id: string,
    approve: boolean,
  ) =>
    client
      .post(
        `/admin/market-suggestions/${id}/resolve`,
        {approve},
        {headers: auth(token)},
      )
      .then(r => r.data),
};

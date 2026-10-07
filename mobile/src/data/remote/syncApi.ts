import axios from 'axios';
import {SYNC_API_BASE} from '@/config/env';

const client = axios.create({
  baseURL: SYNC_API_BASE,
  timeout: 20000,
  headers: {'Content-Type': 'application/json'},
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
  marketsMap: (token?: string | null) =>
    client
      .get('/markets/map', token ? {headers: auth(token)} : undefined)
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
      .delete(`/admin/markets/${id}`, {headers: auth(token)})
      .then(r => r.data),
};

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
  devCode?: string;
  hint?: string;
  ok?: boolean;
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
  submitMarketReview: (
    token: string,
    marketId: string,
    stars: number,
  ) =>
    client
      .post(
        `/markets/${marketId}/reviews`,
        {stars},
        {headers: auth(token)},
      )
      .then(r => r.data),
  castVote: (
    token: string,
    body: {priceLogId: string; vote: string; withPhoto?: boolean},
  ) =>
    client.post('/votes/check', body, {headers: auth(token)}).then(r => r.data),
};

import crypto from 'node:crypto';
import type {Response} from 'express';
import {config} from './config.js';

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function haversineKm(
  a: {lat: number; lng: number},
  b: {lat: number; lng: number},
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function sixDigitCode(): string {
  const n = (Date.now() % 900000) + 100000;
  return String(n);
}

/** Normaliza telefone BR para dígitos com país 55. */
export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d.length >= 10 ? d : null;
}

export function sendError(res: Response, status: number, message: string) {
  return res.status(status).json({error: message});
}

/** Sessão opaca: 4 dias a partir do login. */
export const SESSION_MS = 4 * 24 * 60 * 60 * 1000;

export function nextTokenExpiry(from = Date.now()): string {
  return new Date(from + SESSION_MS).toISOString();
}

export function tokenStillValid(expiresAt: unknown): boolean {
  const exp = Date.parse(String(expiresAt ?? ''));
  return !Number.isNaN(exp) && Date.now() <= exp;
}

export function resolveRole(
  user: Record<string, unknown>,
): 'admin' | 'user' {
  if (user.role === 'admin') return 'admin';
  const email = String(user.email ?? '')
    .trim()
    .toLowerCase();
  if (email && config.adminEmails.includes(email)) return 'admin';
  return 'user';
}

export function publicUser(
  user: Record<string, unknown>,
  token?: string,
): Record<string, unknown> {
  return {
    ...(token ? {token} : {}),
    userId: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName ?? 'Fiscal',
    emailVerified: user.emailVerified === true,
    phoneVerified: user.phoneVerified === true,
    uf: user.uf,
    city: user.city,
    role: resolveRole(user),
    tokenExpiresAt: user.tokenExpiresAt ?? null,
    hasPasskey: Array.isArray(user.passkeys) && user.passkeys.length > 0,
  };
}

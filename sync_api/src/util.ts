import crypto from 'node:crypto';
import type {Response} from 'express';
import {config} from './config.js';

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
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
  };
}

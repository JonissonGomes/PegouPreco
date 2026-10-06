import axios from 'axios';
import {SYNC_API_BASE} from '@/config/env';

export function apiErrorMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as {error?: string} | undefined;
    if (data?.error) return data.error;
    if (!e.response) {
      return `Sem conexão com a API (${SYNC_API_BASE}). Verifique se o sync_api está rodando.`;
    }
    if (e.response.status === 403) return data?.error ?? 'Conta não confirmada';
    return e.message || 'Falha na requisição';
  }
  if (e instanceof Error) return e.message;
  return 'Falha';
}

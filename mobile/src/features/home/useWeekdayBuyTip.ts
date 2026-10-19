import {useEffect, useMemo, useState} from 'react';
import {weekdayBuyCandidates} from '@/domain/homeDashboard';
import {syncApi} from '@/data/remote/syncApi';
import type {Product, ShoppingList} from '@/data/types';

/** Categoria mais vantajosa hoje. O histórico local aparece na hora; o Jev confirma se a conta estiver conectada. */
export function useWeekdayBuyTip(
  lists: ShoppingList[],
  products: Product[],
  token?: string | null,
): string | null {
  const candidates = useMemo(
    () => weekdayBuyCandidates(lists, products),
    [lists, products],
  );
  const [tip, setTip] = useState<string | null>(null);

  useEffect(() => {
    const local = candidates[0]?.category ?? null;
    setTip(local);
    if (!token || candidates.length === 0) return;
    let cancelled = false;
    const weekday = new Date().toLocaleDateString('pt-BR', {weekday: 'long'});
    void syncApi
      .weekdayBuy(token, {
        weekday,
        categories: candidates.map(item => ({
          name: item.category,
          todayAvg: item.todayAvg,
          usualAvg: item.usualAvg,
        })),
      })
      .then(data => {
        if (cancelled) return;
        const picked = data.category;
        if (picked && candidates.some(item => item.category === picked)) {
          setTip(picked);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [candidates, token]);

  return tip;
}

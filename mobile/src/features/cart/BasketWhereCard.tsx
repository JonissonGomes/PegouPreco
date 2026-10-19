import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  rankMarketsForBasket,
  type MarketBasketRank,
} from '@/domain/compare';
import {formatBrl} from '@/domain/money';
import {getState} from '@/data/db';
import {syncApi} from '@/data/remote/syncApi';
import type {CartItem, Market} from '@/data/types';
import {MarketRankRow} from '@/ui/components';
import {SoftCard} from '@/ui/screenChrome';
import {colors} from '@/ui/theme';

export function BasketWhereCard({
  cart,
  markets,
  token,
  city,
  neighborhood,
  favoriteMarketIds,
}: {
  cart: CartItem[];
  markets: Market[];
  token?: string;
  city?: string;
  neighborhood?: string;
  favoriteMarketIds?: number[];
}) {
  const [remote, setRemote] = useState<MarketBasketRank[] | null>(null);
  const local = useMemo(() => {
    if (!cart.length) return [];
    return rankMarketsForBasket(
      cart.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
      })),
      markets,
      getState().price_logs,
      {favoriteIds: favoriteMarketIds, minCoverage: 0.2},
    );
  }, [cart, markets, favoriteMarketIds]);

  useEffect(() => {
    if (!token || !cart.length) {
      setRemote(null);
      return;
    }
    let alive = true;
    syncApi
      .compareBasket(token, {
        city,
        neighborhood,
        favoriteMarketIds: (favoriteMarketIds ?? [])
          .map(id => markets.find(market => market.id === id)?.remoteId)
          .filter((id): id is string => !!id),
        items: cart.map(item => ({
          productName: item.productName,
          quantity: item.quantity,
          productRemoteId: undefined,
        })),
      })
      .then(data => {
        if (!alive) return;
        const mapped = (data.markets ?? []).map(row => {
          const remoteId = String(row.marketId ?? '');
          const found = markets.find(
            market =>
              (remoteId && market.remoteId === remoteId) ||
              market.name.toLowerCase() ===
                String(row.marketName ?? '').toLowerCase(),
          );
          return {
            marketId: found?.id ?? -1,
            marketName: String(row.marketName ?? found?.name ?? 'Mercado'),
            total: Number(row.total ?? 0),
            coveredItems: Number(row.coveredItems ?? 0),
            totalItems: Number(row.totalItems ?? cart.length),
            coverage: Number(row.coverage ?? 0),
            missingNames: (row.missingNames as string[]) ?? [],
          };
        });
        setRemote(mapped.length ? mapped : null);
      })
      .catch(() => {
        if (alive) setRemote(null);
      });
    return () => {
      alive = false;
    };
  }, [
    token,
    cart,
    markets,
    city,
    neighborhood,
    (favoriteMarketIds ?? []).join(','),
  ]);

  const ranks = (remote ?? local).slice(0, 4);
  if (!cart.length) return null;
  const best = ranks[0];
  return (
    <SoftCard style={styles.card}>
      <Text style={styles.title}>Onde esta lista sai mais barata</Text>
      {best ? (
        <>
          <Text style={styles.lead} numberOfLines={2}>
            {best.marketName} · {formatBrl(best.total)}
          </Text>
          <Text style={styles.hint}>
            {best.coveredItems} de {best.totalItems} itens com nota dos últimos 7 dias
          </Text>
          <View style={styles.list}>
            {ranks.map((rank, index) => (
              <MarketRankRow
                key={`${rank.marketId}-${rank.marketName}`}
                rank={rank}
                place={index + 1}
                highlight={index === 0}
                bestTotal={best.total}
              />
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.hint}>
          Ainda não há notas recentes suficientes para comparar esta lista.
        </Text>
      )}
    </SoftCard>
  );
}

const styles = StyleSheet.create({
  card: {marginBottom: 12},
  title: {fontSize: 15, fontWeight: '800', color: colors.navy},
  lead: {marginTop: 6, fontSize: 16, fontWeight: '800', color: colors.ink},
  hint: {marginTop: 4, fontSize: 12, fontWeight: '600', color: colors.muted},
  list: {marginTop: 8},
});

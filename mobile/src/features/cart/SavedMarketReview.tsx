import React, {useState} from 'react';
import {MarketReviewSheet} from '@/ui/MarketReviewSheet';
import {appAlert} from '@/ui/appDialog';
import {apiErrorMessage} from '@/data/remote/apiError';
import {syncApi} from '@/data/remote/syncApi';
import {runFullSync} from '@/data/syncWorker';
import {canContribute, marketRepo, useAppStore} from '@/store/appStore';

export function SavedMarketReview({
  marketId,
  marketName,
  visible,
  onClose,
}: {
  marketId: number | null;
  marketName: string;
  visible: boolean;
  onClose: () => void;
}) {
  const auth = useAppStore(s => s.auth);
  const refresh = useAppStore(s => s.refresh);
  const [busy, setBusy] = useState(false);

  const submit = async (stars: number, tags: string[]) => {
    if (!canContribute(auth)) {
      appAlert(
        'Conta necessária',
        'Verifique o e-mail no Perfil para avaliar o mercado.',
      );
      return;
    }
    setBusy(true);
    try {
      await runFullSync();
      refresh();
      const market =
        marketId != null ? marketRepo.getById(marketId) : null;
      const remoteId = market?.remoteId;
      if (!remoteId) {
        appAlert(
          'Avaliação',
          'A nota foi salva. Sincronize de novo no Perfil para enviar a avaliação deste mercado.',
        );
        onClose();
        return;
      }
      const data = (await syncApi.submitMarketReview(
        auth!.token,
        remoteId,
        stars,
        tags,
      )) as {avgRating?: number; ratingsCount?: number};
      if (market && data?.avgRating != null) {
        marketRepo.upsertGeo(market.id, {
          avgRating: Number(data.avgRating),
          ratingsCount: Number(data.ratingsCount ?? market.ratingsCount),
          synced: 1,
        });
        refresh();
      }
      onClose();
    } catch (e) {
      appAlert('Avaliação', apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <MarketReviewSheet
      visible={visible}
      marketName={marketName}
      busy={busy}
      onClose={onClose}
      onSubmit={submit}
    />
  );
}

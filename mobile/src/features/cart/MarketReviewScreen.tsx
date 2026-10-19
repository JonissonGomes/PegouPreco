import React, {useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {ArrowLeft} from 'lucide-react-native';
import {MarketReviewForm} from '@/ui/MarketReviewSheet';
import {appAlert} from '@/ui/appDialog';
import {apiErrorMessage} from '@/data/remote/apiError';
import {syncApi} from '@/data/remote/syncApi';
import {syncNow} from '@/data/syncWorker';
import {BackCircleButton, SoftHeader} from '@/ui/screenChrome';
import {colors, space} from '@/ui/theme';
import {canContribute, marketRepo, useAppStore} from '@/store/appStore';

export function MarketReviewScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const marketId = Number(route.params?.marketId);
  const marketName = String(route.params?.marketName ?? 'Mercado');
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
      const synced = await syncNow();
      refresh();
      if (!synced.ok) {
        appAlert('Avaliação', synced.message);
        return;
      }
      const market = Number.isFinite(marketId) ? marketRepo.getById(marketId) : null;
      const remoteId = market?.remoteId;
      if (!remoteId) {
        appAlert(
          'Avaliação',
          'A nota foi salva. Sincronize de novo no Perfil para enviar a avaliação deste mercado.',
        );
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
      nav.goBack();
    } catch (e) {
      appAlert('Avaliação', apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <SoftHeader
        title="Avaliar mercado"
        subtitle={marketName}
        leading={
          <BackCircleButton onPress={() => nav.goBack()}>
            <ArrowLeft color={colors.navy} size={22} />
          </BackCircleButton>
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <MarketReviewForm
          marketName={marketName}
          busy={busy}
          onClose={() => nav.goBack()}
          onSubmit={submit}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  content: {padding: space.md, gap: 12, paddingBottom: 40},
});

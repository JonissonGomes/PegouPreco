import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {
  ClipboardList,
  ScanLine,
  Store,
  CheckCircle2,
} from 'lucide-react-native';
import {FeatureEmptyGuide} from '@/ui/FeatureEmptyGuide';
import {space, spacing} from '@/ui/theme';

type Props = {
  hasActiveList: boolean;
  onStartScan: () => void;
  onOpenSavedLists?: () => void;
};

/** Empty da aba Listas — passos ligados a criar lista / escanear itens. */
export function CartEmptyGuide({
  hasActiveList,
  onStartScan,
  onOpenSavedLists,
}: Props) {
  return (
    <ScrollView
      contentContainerStyle={styles.pad}
      showsVerticalScrollIndicator={false}>
      <FeatureEmptyGuide
        HeroIcon={hasActiveList ? ScanLine : ClipboardList}
        title={hasActiveList ? 'Compra sem itens' : 'Inicie uma compra'}
        subtitle={
          hasActiveList
            ? 'Escaneie etiquetas para colocar os itens desta compra.'
            : 'Confirme o mercado e registre os produtos que você está comprando.'
        }
        stepsLabel="Passo a passo nesta lista"
        steps={
          hasActiveList
            ? [
                {
                  n: '1',
                  title: 'Aponte para a etiqueta',
                  text: 'Enquadre o preço na câmera — o app lê produto e valor.',
                  Icon: ScanLine,
                },
                {
                  n: '2',
                  title: 'Confirme o item',
                  text: 'Ajuste nome ou preço se precisar e salve no carrinho.',
                  Icon: CheckCircle2,
                },
                {
                  n: '3',
                  title: 'Finalize a compra',
                  text: 'Ao sair do mercado, finalize a lista para guardar o histórico.',
                  Icon: Store,
                },
              ]
            : [
                {
                  n: '1',
                  title: 'Inicie a compra',
                  text: 'Dê um nome e confirme o mercado onde você está.',
                  Icon: ClipboardList,
                },
                {
                  n: '2',
                  title: 'Confirme o mercado',
                  text: 'Usamos o GPS para sugerir o supermercado mais próximo.',
                  Icon: Store,
                },
                {
                  n: '3',
                  title: 'Comece a escanear',
                  text: 'Aponte a câmera para a etiqueta e os itens entram na compra.',
                  Icon: ScanLine,
                },
              ]
        }
        PrimaryIcon={ScanLine}
        primaryLabel={
          hasActiveList
            ? 'Começar a escanear'
            : 'Iniciar compra'
        }
        onPrimary={onStartScan}
        secondaryLabel={
          !hasActiveList && onOpenSavedLists ? 'Ver compras salvas' : undefined
        }
        onSecondary={onOpenSavedLists}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: {
    paddingTop: space.sm,
    paddingBottom: spacing.bottomNavClearance,
  },
});

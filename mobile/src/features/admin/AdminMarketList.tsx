import React from 'react';
import {Text, View} from 'react-native';
import {Trash2} from 'lucide-react-native';
import {AppButton} from '@/ui/chrome';
import {colors} from '@/ui/theme';
import type {AdminMarketRemote} from '@/data/remote/syncApi';
import {adminStyles as styles} from './adminStyles';

export function AdminMarketList({
  markets,
  onEdit,
  onRemove,
  onMap,
}: {
  markets: AdminMarketRemote[];
  onEdit: (market: AdminMarketRemote) => void;
  onRemove: (market: AdminMarketRemote) => void;
  onMap: (market: AdminMarketRemote) => void;
}) {
  if (markets.length === 0) {
    return <Text style={styles.empty}>Nenhum mercado na nuvem ainda.</Text>;
  }
  return (
    <>
      {markets.map(item => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowMeta}>
            {item.address || 'Endereço não informado'}
            {item.city ? ` · ${item.city}` : ''}
          </Text>
          <Text style={styles.rowMeta}>
            {Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng))
              ? `${Number(item.lat).toFixed(5)}, ${Number(item.lng).toFixed(5)}`
              : 'Sem coordenadas'}
          </Text>
          <View style={styles.actions}>
            <View style={styles.action}>
              <AppButton
                outlined
                label="No mapa"
                disabled={!Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lng))}
                onPress={() => onMap(item)}
              />
            </View>
            <View style={styles.action}>
              <AppButton outlined label="Editar" onPress={() => onEdit(item)} />
            </View>
            <View style={styles.action}>
              <AppButton
                outlined
                label="Remover"
                icon={<Trash2 size={16} color={colors.danger} />}
                onPress={() => onRemove(item)}
              />
            </View>
          </View>
        </View>
      ))}
    </>
  );
}

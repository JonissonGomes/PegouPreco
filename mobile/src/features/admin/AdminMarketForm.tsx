import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {MapPin} from 'lucide-react-native';
import {AppButton, AppField} from '@/ui/chrome';
import {colors} from '@/ui/theme';
import {adminStyles as styles} from './adminStyles';

export function AdminMarketForm({
  name,
  address,
  lat,
  lng,
  cnpj,
  busy,
  editing,
  onName,
  onAddress,
  onLat,
  onLng,
  onCnpj,
  onGps,
  onSave,
  onClear,
}: {
  name: string;
  address: string;
  lat: string;
  lng: string;
  cnpj: string;
  busy: boolean;
  editing: boolean;
  onName: (value: string) => void;
  onAddress: (value: string) => void;
  onLat: (value: string) => void;
  onLng: (value: string) => void;
  onCnpj: (value: string) => void;
  onGps: () => void;
  onSave: () => void;
  onClear: () => void;
}) {
  return (
    <>
      <AppField label="Nome" value={name} onChangeText={onName} compact />
      <AppField
        label="Endereço"
        value={address}
        onChangeText={onAddress}
        compact
      />
      <View style={styles.coordRow}>
        <View style={{flex: 1}}>
          <AppField label="Lat" value={lat} onChangeText={onLat} compact />
        </View>
        <View style={{flex: 1}}>
          <AppField label="Lng" value={lng} onChangeText={onLng} compact />
        </View>
      </View>
      <AppButton
        label="Usar GPS"
        outlined
        icon={<MapPin size={18} color={colors.navy} />}
        onPress={onGps}
      />
      <AppField
        label="CNPJ (opcional)"
        value={cnpj}
        onChangeText={onCnpj}
        compact
      />
      <AppButton
        disabled={busy}
        label={busy ? 'Salvando…' : editing ? 'Salvar edição' : 'Publicar mercado'}
        onPress={onSave}
      />
      {editing ? (
        <Pressable onPress={onClear}>
          <Text style={styles.clearForm}>Limpar formulário</Text>
        </Pressable>
      ) : null}
    </>
  );
}

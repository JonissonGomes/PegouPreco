import React from 'react';
import {View} from 'react-native';
import {
  Apple,
  Beef,
  Cookie,
  Milk,
  Package,
  ShoppingBasket,
  SprayCan,
  Sparkles,
  Wine,
} from 'lucide-react-native';
import {categoryTone} from './categoryTone';

const ICONS: Record<string, typeof Wine> = {
  Bebidas: Wine,
  Mercearia: ShoppingBasket,
  Laticínios: Milk,
  Açougue: Beef,
  Hortifruti: Apple,
  Limpeza: SprayCan,
  Higiene: Sparkles,
  'Biscoitos e doces': Cookie,
  Outros: Package,
};

export function CategoryIcon({
  name,
  size = 14,
}: {
  name: string;
  size?: number;
}) {
  const Icon = ICONS[name] ?? Package;
  const tone = categoryTone(name);
  const box = size + 10;
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: box,
        height: box,
        borderRadius: box / 2,
        backgroundColor: tone.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Icon size={size} color={tone.fg} />
    </View>
  );
}

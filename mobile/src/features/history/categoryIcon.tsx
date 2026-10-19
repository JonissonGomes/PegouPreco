import React from 'react';
import {View} from 'react-native';
import {
  Apple,
  Baby,
  Beef,
  Coffee,
  Cookie,
  Croissant,
  Cylinder,
  Dog,
  Fish,
  Layers,
  LeafyGreen,
  Milk,
  Package,
  Popcorn,
  Sandwich,
  ShoppingBasket,
  Snowflake,
  Soup,
  SprayCan,
  Toilet,
  Wheat,
  Beer,
  Droplets,
  GlassWater,
  Martini,
  Wine,
} from 'lucide-react-native';
import {categoryTone} from './categoryTone';

const ICONS: Record<string, typeof Beer> = {
  Bebidas: Wine,
  Mercearia: ShoppingBasket,
  Grãos: Wheat,
  'Farinhas e açúcar': Wheat,
  Massas: Soup,
  'Óleos e azeites': Droplets,
  Refrigerantes: GlassWater,
  'Águas e sucos': GlassWater,
  Cervejas: Beer,
  Destilados: Martini,
  Laticínios: Milk,
  Açougue: Beef,
  Frutas: Apple,
  Verduras: LeafyGreen,
  Peixaria: Fish,
  Frios: Sandwich,
  Padaria: Croissant,
  Congelados: Snowflake,
  'Café e matinais': Coffee,
  'Molhos e temperos': Soup,
  Enlatados: Cylinder,
  Limpeza: SprayCan,
  Higiene: Toilet,
  'Biscoitos e doces': Cookie,
  Salgadinhos: Popcorn,
  Bebê: Baby,
  Pet: Dog,
  Descartáveis: Layers,
  Outros: Package,
};

export function CategoryIcon({
  name,
  size = 14,
  pad = 10,
}: {
  name: string;
  size?: number;
  pad?: number;
}) {
  const Icon = ICONS[name] ?? Package;
  const tone = categoryTone(name);
  const box = size + pad;
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

import React from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {AppButton, AppField} from '@/ui/chrome';
import {PIN_REPORTS, pinReportLabel} from '@/domain/pinReports';
import {adminStyles as styles} from './adminStyles';

const FILTERS = [
  {id: 'all', label: 'Todos'},
  ...PIN_REPORTS.map(item => ({id: item.id, label: item.label})),
  {id: 'confirm', label: 'Confirmação'},
];

export type SuggestionDraft = {
  id?: string;
  name?: string;
  address?: string | null;
  lat?: number;
  lng?: number;
  cnpj?: string | null;
};

export function AdminSupportPanel({
  query,
  filter,
  busy,
  items,
  onQuery,
  onFilter,
  onEdit,
  onResolve,
}: {
  query: string;
  filter: string;
  busy: boolean;
  items: Array<Record<string, unknown>>;
  onQuery: (value: string) => void;
  onFilter: (id: string) => void;
  onEdit: (draft: SuggestionDraft) => void;
  onResolve: (id: string, approve: boolean) => void;
}) {
  return (
    <>
      <AppField
        label="Filtrar por mercado"
        value={query}
        onChangeText={onQuery}
        compact
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chips}>
          {FILTERS.map(item => (
            <Pressable
              key={item.id}
              style={[styles.chip, filter === item.id && styles.chipOn]}
              onPress={() => onFilter(item.id)}>
              <Text
                style={[
                  styles.chipText,
                  filter === item.id && styles.chipTextOn,
                ]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {items.length === 0 ? (
        <Text style={styles.empty}>Nada pendente nesse filtro.</Text>
      ) : (
        items.map(item => (
          <View key={String(item.id)} style={styles.card}>
            <Text style={styles.rowName}>{String(item.name ?? '')}</Text>
            <Text style={styles.rowMeta}>
              {item.reportType
                ? pinReportLabel(String(item.reportType))
                : item.kind === 'confirm'
                  ? 'Confirmação'
                  : String(item.kind ?? 'sugestão')}
              {item.note ? ` · ${String(item.note)}` : ''}
            </Text>
            <View style={styles.actions}>
              <View style={styles.action}>
                <AppButton
                  outlined
                  label="Editar"
                  disabled={busy}
                  onPress={() =>
                    onEdit({
                      id: item.targetMarketId
                        ? String(item.targetMarketId)
                        : undefined,
                      name: String(item.name ?? ''),
                      address: (item.address as string) ?? null,
                      lat: Number(item.lat),
                      lng: Number(item.lng),
                      cnpj: (item.cnpj as string) ?? null,
                    })
                  }
                />
              </View>
              <View style={styles.action}>
                <AppButton
                  label="Aprovar"
                  disabled={busy}
                  onPress={() => onResolve(String(item.id), true)}
                />
              </View>
              <View style={styles.action}>
                <AppButton
                  outlined
                  label="Rejeitar"
                  disabled={busy}
                  onPress={() => onResolve(String(item.id), false)}
                />
              </View>
            </View>
          </View>
        ))
      )}
    </>
  );
}

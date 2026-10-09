import React from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {AppButton, AppField} from '@/ui/chrome';
import {PIN_REPORTS, pinReportLabel} from '@/domain/pinReports';
import type {ReportGroup} from './reportGroups';
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
  groups,
  onQuery,
  onFilter,
  onEdit,
  onResolve,
}: {
  query: string;
  filter: string;
  busy: boolean;
  groups: ReportGroup[];
  onQuery: (value: string) => void;
  onFilter: (id: string) => void;
  onEdit: (draft: SuggestionDraft) => void;
  onResolve: (group: ReportGroup, approve: boolean) => void;
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
      {groups.length === 0 ? (
        <Text style={styles.empty}>Nada pendente nesse filtro.</Text>
      ) : (
        groups.map(group => (
          <View key={group.key} style={styles.card}>
            <Text style={styles.rowName}>{group.name}</Text>
            <Text style={styles.rowMeta}>
              {group.reason === 'confirm'
                ? 'Confirmação'
                : pinReportLabel(group.reason)}
              {' · '}
              {group.count === 1
                ? '1 reporte'
                : `${group.count} reportes`}
            </Text>
            <View style={styles.actions}>
              <View style={styles.action}>
                <AppButton
                  outlined
                  label="Editar"
                  disabled={busy}
                  onPress={() =>
                    onEdit({
                      id: group.targetMarketId,
                      name: group.name,
                      address: group.address,
                      lat: group.lat,
                      lng: group.lng,
                      cnpj: group.cnpj,
                    })
                  }
                />
              </View>
              <View style={styles.action}>
                <AppButton
                  label="Aprovar"
                  disabled={busy}
                  onPress={() => onResolve(group, true)}
                />
              </View>
              <View style={styles.action}>
                <AppButton
                  outlined
                  label="Rejeitar"
                  disabled={busy}
                  onPress={() => onResolve(group, false)}
                />
              </View>
            </View>
          </View>
        ))
      )}
    </>
  );
}

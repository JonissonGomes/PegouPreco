export const PIN_REPORTS = [
  {id: 'wrong_name', label: 'Nome incorreto'},
  {id: 'missing', label: 'Não existe'},
  {id: 'wrong_location', label: 'Localização incorreta'},
] as const;

export type PinReportId = (typeof PIN_REPORTS)[number]['id'];

export function pinReportLabel(id: string | null | undefined): string {
  return PIN_REPORTS.find(item => item.id === id)?.label ?? 'Outro';
}

/** Texto usado para achar uma compra pelo dia, mês ou ano. */
export function dateSearchText(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const short = d
    .toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .replace('.', '');
  return `${d.toLocaleDateString('pt-BR')} ${short} ${d.getFullYear()}`.toLowerCase();
}

/** Tons pastéis do dashboard, com tinta um pouco mais escura para o texto. */
export const pastel = {
  rose: '#F8C9CE',
  roseInk: '#9F1239',
  butter: '#FDE7A0',
  butterInk: '#92400E',
  sky: '#C7D9FB',
  skyInk: '#1E3A8A',
  mint: '#C7EBD4',
  mintInk: '#166534',
  lilac: '#DDD6FE',
  lilacInk: '#5B21B6',
};

export const pastelCycle = [
  pastel.rose,
  pastel.sky,
  pastel.butter,
  pastel.mint,
  pastel.lilac,
];

export function pastelAt(index: number): string {
  return pastelCycle[index % pastelCycle.length];
}

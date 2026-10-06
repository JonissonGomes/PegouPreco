/** Pontos de mercado com geo — usados no seed demo e no fallback do mapa. */
export type SeedMarketPoint = {
  name: string;
  lat: number;
  lng: number;
  address: string;
  uf: string;
  cnpj: string | null;
  avgRating: number;
  ratingsCount: number;
  priceLevel: string;
};

export const SEED_MARKET_POINTS: SeedMarketPoint[] = [
  {
    name: 'Atacadão Cruz de Rebouças',
    cnpj: '75315333000109',
    uf: 'PE',
    lat: -8.0284,
    lng: -34.9352,
    address: 'Av. Dr. José Rufino, Recife - PE',
    avgRating: 4.3,
    ratingsCount: 128,
    priceLevel: 'low',
  },
  {
    name: 'Novo Atacarejo Imbiribeira',
    cnpj: null,
    uf: 'PE',
    lat: -8.1145,
    lng: -34.9188,
    address: 'Imbiribeira, Recife - PE',
    avgRating: 4.2,
    ratingsCount: 97,
    priceLevel: 'low',
  },
  {
    name: 'Novo Atacarejo Boa Viagem',
    cnpj: null,
    uf: 'PE',
    lat: -8.1312,
    lng: -34.9065,
    address: 'Boa Viagem, Recife - PE',
    avgRating: 4.1,
    ratingsCount: 72,
    priceLevel: 'low',
  },
  {
    name: 'Carrefour Dourados',
    cnpj: '45543915045218',
    uf: 'PE',
    lat: -8.0476,
    lng: -34.877,
    address: 'Av. Mal. Mascarenhas de Morais, Recife - PE',
    avgRating: 4.0,
    ratingsCount: 86,
    priceLevel: 'fair',
  },
  {
    name: "Sam's Club Recife",
    cnpj: '00776574006711',
    uf: 'PE',
    lat: -8.1121,
    lng: -34.9148,
    address: 'Av. Eng. Domingos Ferreira, Recife - PE',
    avgRating: 4.5,
    ratingsCount: 210,
    priceLevel: 'fair',
  },
  {
    name: 'Assaí Atacadista Imbiribeira',
    cnpj: '06057223014855',
    uf: 'PE',
    lat: -8.1015,
    lng: -34.9255,
    address: 'Av. Marechal Mascarenhas, Recife - PE',
    avgRating: 3.9,
    ratingsCount: 64,
    priceLevel: 'low',
  },
  {
    name: 'Extra Bompreço Boa Viagem',
    cnpj: '47508411030266',
    uf: 'PE',
    lat: -8.1198,
    lng: -34.9012,
    address: 'Av. Conselheiro Aguiar, Recife - PE',
    avgRating: 3.7,
    ratingsCount: 41,
    priceLevel: 'high',
  },
  {
    name: 'Mercado da Esquina',
    cnpj: null,
    uf: 'PE',
    lat: -8.055,
    lng: -34.885,
    address: 'Rua da Aurora, Recife - PE',
    avgRating: 4.1,
    ratingsCount: 19,
    priceLevel: 'fair',
  },
];

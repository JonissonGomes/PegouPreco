export const PRODUCT_CATEGORIES = [
  'Grãos',
  'Farinhas e açúcar',
  'Massas',
  'Óleos e azeites',
  'Molhos e temperos',
  'Enlatados',
  'Café e matinais',
  'Biscoitos e doces',
  'Salgadinhos',
  'Laticínios',
  'Frios',
  'Congelados',
  'Açougue',
  'Peixaria',
  'Frutas',
  'Verduras',
  'Refrigerantes',
  'Águas e sucos',
  'Cervejas',
  'Destilados',
  'Bebidas',
  'Padaria',
  'Mercearia',
  'Limpeza',
  'Higiene',
  'Bebê',
  'Pet',
  'Descartáveis',
  'Outros',
] as const;

function foldCategory(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

/** Aceita só uma categoria da lista. “Outros” e texto fora da lista viram null. */
export function canonicalCategory(raw: string): string | null {
  const folded = foldCategory(raw);
  const hit = PRODUCT_CATEGORIES.find(name => foldCategory(name) === folded);
  if (!hit || hit === 'Outros') return null;
  return hit;
}

export type JevResult = {
  action: string;
  plausible: number;
  risk: number;
  confidence?: number | boolean;
  fallback?: boolean;
};

export class JevClient {
  constructor(
    private readonly apiKey: string,
    private readonly model = 'jev-1.13.0',
  ) {}

  get enabled() {
    return this.apiKey.length > 0;
  }

  /**
   * Destaca no mapa só mercados confiáveis e usados.
   * Sem chave, ou se a chamada falhar, usa a regra local.
   */
  async shouldHighlight(args: {
    marketName: string;
    weeklyVisitors: number;
    avgRating: number;
    ratingsCount: number;
  }): Promise<boolean> {
    const local =
      args.weeklyVisitors >= 5 ||
      (args.weeklyVisitors >= 2 && args.avgRating >= 4) ||
      (args.ratingsCount >= 8 && args.avgRating >= 4.2);
    if (!this.enabled) return local;
    const decided = await this.decide({
      marketName: args.marketName,
      weeklyVisitors: args.weeklyVisitors,
      avgRating: args.avgRating,
      ratingsCount: args.ratingsCount,
      currency: 'BRL',
    }, {
      action: {
        type: 'choice',
        instructions:
          'Should this Brazilian supermarket stay highlighted on the map? Highlight only when it is both reliable and frequently used.',
        criteria: {
          highlight: 'Reliable and used enough to feature the pin',
          normal: 'Keep as a regular pin',
        },
      },
    });
    if (decided.fallback) return local;
    return decided.action === 'highlight';
  }

  private endpoint(): string {
    // Chave do console TypeSafe (apikey_…) e chave hospedada (jv_live_…) não são o mesmo host.
    if (this.apiKey.startsWith('apikey_')) {
      return 'https://api.typesafe.ai/v1/systemone';
    }
    return 'https://jevtypesafeai.com/api/v1/decide';
  }

  private async decide(
    state: Record<string, unknown>,
    questions: Record<string, unknown>,
  ): Promise<JevResult> {
    try {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({model: this.model, state, questions}),
        signal: AbortSignal.timeout(4000),
      });
      const raw = await res.text();
      if (!res.ok) {
        console.log(`Jev HTTP ${res.status}: ${raw}`);
        return {action: 'normal', plausible: 0.5, risk: 1, fallback: true};
      }
      const data = JSON.parse(raw) as {
        answers?: Record<string, Record<string, unknown>>;
      };
      const answers = data.answers ?? {};
      return {
        action: String(answers.action?.choice ?? 'normal'),
        plausible: Number(answers.plausible?.noul ?? 0.5),
        risk: Number(answers.risk?.score ?? 1),
        confidence: Number(answers.action?.confidence ?? 0),
        fallback: false,
      };
    } catch (e) {
      console.log(`Jev error: ${e}`);
      return {action: 'normal', plausible: 0.5, risk: 1, fallback: true};
    }
  }

  /**
   * Dois títulos perto no mapa são o mesmo mercado?
   * Sem chave, a regra local (nome parecido) decide.
   */
  async samePlace(args: {
    nameA: string;
    nameB: string;
    distanceM: number;
    localSame: boolean;
  }): Promise<boolean> {
    if (!this.enabled) return args.localSame;
    const decided = await this.decide(
      {
        nameA: args.nameA,
        nameB: args.nameB,
        distanceM: Math.round(args.distanceM),
      },
      {
        action: {
          type: 'choice',
          instructions:
            'Are these two nearby Brazilian supermarket labels the same physical store? Merge duplicates and small title differences. Keep them apart when they are different chains or different branches.',
          criteria: {
            merge: 'Same store, keep a single pin',
            distinct: 'Different stores, keep both pins',
          },
        },
      },
    );
    if (decided.fallback) return args.localSame;
    return decided.action === 'merge';
  }

  /**
   * Categoria de prateleira quando a regra local devolveu “Outros”.
   * Sem chave, ou se a chamada falhar, devolve null e a categoria local fica.
   */
  async classifyCategory(productName: string): Promise<string | null> {
    const name = productName.trim();
    if (!this.enabled || name.length < 2) return null;
    const criteria: Record<string, string> = {};
    for (const category of PRODUCT_CATEGORIES) {
      criteria[category] =
        category === 'Outros'
          ? 'None of the other shelf categories fit'
          : `Belongs on the Brazilian supermarket shelf “${category}”`;
    }
    const decided = await this.decide(
      {productName: name, currency: 'BRL'},
      {
        action: {
          type: 'choice',
          instructions:
            'Classify this Brazilian supermarket item into one shelf category. Read abbreviations on the label, such as CERV, BEB, ENERG and H2O. Pick Outros only when nothing else fits.',
          criteria,
        },
      },
    );
    if (decided.fallback) return null;
    return canonicalCategory(decided.action);
  }

  async classifyPrice(args: {
    productName: string;
    marketName: string;
    retailPrice: number;
    source: string;
    regionalMedian?: number | null;
    city?: string | null;
  }): Promise<JevResult> {
    if (!this.enabled) {
      return {
        action: 'quarantine',
        plausible: 0.5,
        risk: 1.0,
        confidence: false,
      };
    }

    const body = {
      model: this.model,
      state: {
        productName: args.productName,
        marketName: args.marketName,
        retailPrice: args.retailPrice,
        source: args.source,
        regionalMedian: args.regionalMedian,
        city: args.city,
        currency: 'BRL',
      },
      questions: {
        plausible: {
          type: 'noul',
          instructions:
            'Is this shelf price plausible for this Brazilian supermarket product and region?',
        },
        risk: {
          type: 'score',
          instructions:
            'How risky is this price contribution for data quality / fraud?',
          criteria: [
            'routine, normal price',
            'slightly suspicious',
            'anomalous outlier',
            'likely fraud or manipulation',
          ],
        },
        action: {
          type: 'choice',
          instructions:
            'How should the PegouPreco trust pipeline treat this contribution?',
          criteria: {
            accept: 'Accept into community pipeline (likely genuine)',
            quarantine: 'Keep suspect for community validation',
            reject: 'Hide as fraud or severe anomaly',
          },
        },
      },
    };

    return this.decide(body.state, body.questions).then(result => {
      if (
        result.action === 'accept' ||
        result.action === 'reject' ||
        result.action === 'quarantine'
      ) {
        return result;
      }
      return {...result, action: 'quarantine', fallback: true};
    });
  }

  /**
   * Qual prateleira vale mais a pena neste dia da semana.
   * Sem chave, fica a categoria já mais barata no histórico local.
   */
  async suggestWeekdayBuy(args: {
    weekday: string;
    categories: {name: string; todayAvg: number; usualAvg: number}[];
  }): Promise<string | null> {
    const local = args.categories[0]?.name ?? null;
    if (!this.enabled || args.categories.length === 0) return local;
    const criteria: Record<string, string> = {};
    for (const item of args.categories) {
      criteria[item.name] =
        `Shelf “${item.name}” averages R$ ${item.todayAvg.toFixed(2)} on this weekday versus R$ ${item.usualAvg.toFixed(2)} overall. Prefer the relatively cheaper one today.`;
    }
    const decided = await this.decide(
      {weekday: args.weekday, currency: 'BRL'},
      {
        action: {
          type: 'choice',
          instructions:
            'Pick the one Brazilian supermarket shelf that is the best buy on this weekday, using the price comparison. Do not invent a category outside the list.',
          criteria,
        },
      },
    );
    if (decided.fallback) return local;
    const picked = args.categories.find(
      item => foldCategory(item.name) === foldCategory(decided.action),
    );
    return picked?.name ?? local;
  }
}

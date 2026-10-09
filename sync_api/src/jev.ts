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

  private async decide(
    state: Record<string, unknown>,
    questions: Record<string, unknown>,
  ): Promise<JevResult> {
    try {
      const res = await fetch('https://jevtypesafeai.com/api/v1/decide', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({model: this.model, state, questions}),
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
}

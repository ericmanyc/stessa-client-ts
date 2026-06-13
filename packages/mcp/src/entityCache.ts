import {
  propertyLabel,
  type StessaClient,
  type StessaPortfolio,
  type StessaProperty,
} from "stessa-client";

const CACHE_TTL_MS = 5 * 60_000;

/** Caches properties and portfolios for fast ID-to-name resolution. */
export class EntityCache {
  private properties: Map<number, StessaProperty> | null = null;
  private portfolios: Map<number, StessaPortfolio> | null = null;
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(private readonly client: StessaClient) {}

  async getPropertyName(id: number): Promise<string | null> {
    await this.ensureCache();
    const property = this.properties!.get(id);
    return property ? propertyLabel(property) : null;
  }

  async getPortfolioName(id: number): Promise<string | null> {
    await this.ensureCache();
    return this.portfolios!.get(id)?.name ?? null;
  }

  async getProperty(id: number): Promise<StessaProperty | null> {
    await this.ensureCache();
    return this.properties!.get(id) ?? null;
  }

  async getPortfolio(id: number): Promise<StessaPortfolio | null> {
    await this.ensureCache();
    return this.portfolios!.get(id) ?? null;
  }

  private async ensureCache(): Promise<void> {
    if (this.properties && Date.now() - this.loadedAt < CACHE_TTL_MS) {
      return;
    }
    this.loading ??= this.loadCache().finally(() => {
      this.loading = null;
    });
    await this.loading;
  }

  private async loadCache(): Promise<void> {
    const [properties, portfolios] = await Promise.all([
      this.client.properties.list().catch(() => [] as StessaProperty[]),
      this.client.portfolios.list().catch(() => [] as StessaPortfolio[]),
    ]);

    this.properties = new Map(properties.map((p) => [p.id, p]));
    this.portfolios = new Map(portfolios.map((p) => [p.id, p]));
    this.loadedAt = Date.now();
  }
}

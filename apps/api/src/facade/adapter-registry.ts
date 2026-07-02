import { TTSError, type TTSAdapter, type TTSCapabilities } from "@tts-platform/core";

export interface ProviderSummary {
  providerId: string;
  providerName: string;
  adapterVersion: string;
}

export class AdapterRegistry {
  private readonly adapters = new Map<string, TTSAdapter>();

  constructor(adapters: TTSAdapter[] = []) {
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  register(adapter: TTSAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
  }

  get(providerId: string): TTSAdapter | undefined {
    return this.adapters.get(providerId);
  }

  getOrThrow(providerId: string): TTSAdapter {
    const adapter = this.get(providerId);
    if (adapter === undefined) {
      throw new TTSError(`Provider '${providerId}' was not found.`, "provider_not_found", 404);
    }
    return adapter;
  }

  list(): TTSAdapter[] {
    return [...this.adapters.values()];
  }

  listProviders(): ProviderSummary[] {
    return this.list().map((adapter) => {
      const capabilities = adapter.capabilities();
      return {
        providerId: capabilities.providerId,
        providerName: capabilities.providerName,
        adapterVersion: capabilities.adapterVersion
      };
    });
  }

  capabilities(providerId: string): TTSCapabilities {
    return this.getOrThrow(providerId).capabilities();
  }
}

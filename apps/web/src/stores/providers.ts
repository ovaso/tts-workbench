import { defineStore } from "pinia";
import {
  getCapabilities,
  listProviders,
  type ProviderSummary
} from "../api/providers";
import type { TTSCapabilities } from "@tts-platform/core";

export const useProvidersStore = defineStore("providers", {
  state: () => ({
    providers: [] as ProviderSummary[],
    capabilities: {} as Record<string, TTSCapabilities>,
    loading: false,
    error: ""
  }),
  actions: {
    async loadProviders() {
      this.loading = true;
      this.error = "";
      try {
        this.providers = await listProviders();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "加载厂商列表失败。";
      } finally {
        this.loading = false;
      }
    },
    async loadCapabilities(providerId: string, options: { force?: boolean } = {}) {
      if (options.force !== true && this.capabilities[providerId] !== undefined) {
        return this.capabilities[providerId];
      }
      const capabilities = await getCapabilities(providerId);
      this.capabilities[providerId] = capabilities;
      return capabilities;
    }
  }
});

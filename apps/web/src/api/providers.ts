import type { TTSCapabilities } from "@tts-platform/core";
import { requestJson } from "./client";

export interface ProviderSummary {
  providerId: string;
  providerName: string;
  adapterVersion: string;
}

export async function listProviders(): Promise<ProviderSummary[]> {
  const response = await requestJson<{ providers: ProviderSummary[] }>("/v1/providers");
  return response.providers;
}

export async function getCapabilities(providerId: string): Promise<TTSCapabilities> {
  return requestJson<TTSCapabilities>(`/v1/providers/${providerId}/capabilities`);
}

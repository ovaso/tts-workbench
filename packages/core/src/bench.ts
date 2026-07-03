import type { TTSCanonicalControls, TTSOutputPreferences, TTSVoiceSelection } from "./requests";
import type { VendorDirective } from "./vendor-extension";

export interface BenchConfigTuple {
  providerId: string;
  modelId: string;
  voice: TTSVoiceSelection;
  output?: TTSOutputPreferences;
  controls?: TTSCanonicalControls;
  vendor?: VendorDirective;
}

export interface BenchConfig extends BenchConfigTuple {
  configId: string;
  digest: string;
  displayName: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BenchConfigCreateRequest extends BenchConfigTuple {
  displayName: string;
  description?: string;
}

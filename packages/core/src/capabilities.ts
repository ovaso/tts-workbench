import type { TTSOperation } from "./operations";
import type { VendorExtensionSchema } from "./vendor-extension";

export type TTSOutputFormat = "wav" | "mp3" | "ogg" | "pcm";

export type TTSStreamProtocol = "websocket" | "sse" | "http_chunk";

export type CapabilitySupport = "supported" | "approximated" | "ignored" | "unsupported";

export type CanonicalControlName =
  | "speed"
  | "pitch"
  | "volume"
  | "emotion"
  | "style"
  | "language";

export interface CanonicalControlCapability {
  support: CapabilitySupport;
  min?: number;
  max?: number;
  values?: string[];
  defaultValue?: string | number | boolean;
  notes?: string[];
}

export interface VoiceCloneCapability {
  persistent: boolean;
  instant: boolean;
  requiresTranscript: boolean;
  supportedAudioFormats: TTSOutputFormat[];
  maxReferenceAudioSeconds?: number;
}

export interface TTSOperationCapability {
  operation: TTSOperation;
  supported: boolean;
  transportProtocols?: TTSStreamProtocol[];
  outputFormats?: TTSOutputFormat[];
  sampleRatesHz?: number[];
  voiceClone?: VoiceCloneCapability;
  canonicalControls: Partial<Record<CanonicalControlName, CanonicalControlCapability>>;
  vendorExtensionSchema?: VendorExtensionSchema;
  notes?: string[];
}

export interface TTSCapabilities {
  providerId: string;
  providerName: string;
  adapterVersion: string;
  operations: Partial<Record<TTSOperation, TTSOperationCapability>>;
}

import type { TTSOperation } from "./operations";
import type { VendorExtensionSchema } from "./vendor-extension";

export type TTSAudioOutputFormat = "wav" | "mp3" | "ogg" | "pcm" | "flac" | "opus";

export type ReferenceAudioFormat = TTSAudioOutputFormat | "m4a";

export type TTSOutputFormat = TTSAudioOutputFormat;

export type TTSStreamProtocol = "websocket" | "sse" | "http_chunk";

export type TTSTransportProtocol = "https" | TTSStreamProtocol;

export type TTSStreamInputMode = "text_once" | "text_incremental";

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
  supportedAudioFormats: ReferenceAudioFormat[];
  minReferenceAudioSeconds?: number;
  maxReferenceAudioSeconds?: number;
  maxReferenceAudioFiles?: number;
}

export interface TTSOperationCapability {
  operation: TTSOperation;
  supported: boolean;
  transportProtocols?: TTSTransportProtocol[];
  inputModes?: TTSStreamInputMode[];
  outputFormats?: TTSOutputFormat[];
  outputChunkFormats?: TTSOutputFormat[];
  sampleRatesHz?: number[];
  maxTextChars?: number;
  supportsTimestamps?: boolean;
  supportsInterruption?: boolean;
  voiceClone?: VoiceCloneCapability;
  canonicalControls: Partial<Record<CanonicalControlName, CanonicalControlCapability>>;
  vendorExtensionSchema?: VendorExtensionSchema;
  notes?: string[];
}

export interface TTSVendorModelCanonicalCapabilities {
  supportsText: boolean;
  supportsSSML: boolean;
  supportedOperations: TTSOperation[];
  outputFormats?: TTSOutputFormat[];
  outputChunkFormats?: TTSOutputFormat[];
  sampleRatesHz?: number[];
  maxTextChars?: number;
  canonicalControls: Partial<Record<CanonicalControlName, CanonicalControlCapability>>;
  voiceClone?: VoiceCloneCapability;
}

export interface TTSVendorModelDefaultConfiguration {
  voice?: {
    providerVoiceId?: string;
  };
  output?: {
    format?: TTSOutputFormat;
    sampleRateHz?: number;
    bitrate?: number;
    channels?: 1 | 2;
  };
  controls?: Partial<Record<CanonicalControlName, string | number | boolean>>;
}

export interface TTSVendorModel {
  modelId: string;
  displayName?: string;
  description?: string;
  defaultForOperations?: TTSOperation[];
  canonicalCapabilities: TTSVendorModelCanonicalCapabilities;
  defaultConfiguration?: TTSVendorModelDefaultConfiguration;
  vendorModelFeatureSchema?: VendorExtensionSchema;
  notes?: string[];
}

export interface TTSVendorFeatureFlags {
  supportsHttpTTS: boolean;
  supportsStreamingTTS: boolean;
  supportsPersistentVoiceClone: boolean;
  supportsInstantVoiceClone: boolean;
  supportsVoiceCloneDelete: boolean;
}

export interface TTSCapabilities {
  providerId: string;
  providerName: string;
  adapterVersion: string;
  vendorFeatures: TTSVendorFeatureFlags;
  vendorModels: TTSVendorModel[];
  operations: Partial<Record<TTSOperation, TTSOperationCapability>>;
}

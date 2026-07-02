import type { TTSOutputFormat } from "./capabilities";
import type { TTSOperation } from "./operations";
import type { VendorDirective } from "./vendor-extension";

export interface TTSVoiceSelection {
  voiceId?: string;
  providerVoiceId?: string;
  language?: string;
}

export interface TTSOutputPreferences {
  format?: TTSOutputFormat;
  sampleRateHz?: number;
}

export interface TTSCanonicalControls {
  speed?: number;
  pitch?: number;
  volume?: number;
  emotion?: string;
  style?: string;
}

export interface TTSSyncRequest {
  operation: "tts.sync";
  providerId: string;
  text: string;
  model?: string;
  voice: TTSVoiceSelection;
  output?: TTSOutputPreferences;
  controls?: TTSCanonicalControls;
  vendor?: VendorDirective;
  clientRequestId?: string;
}

export interface TTSStreamRequest {
  operation: "tts.stream";
  providerId: string;
  text: string;
  model?: string;
  voice: TTSVoiceSelection;
  output?: TTSOutputPreferences;
  controls?: TTSCanonicalControls;
  vendor?: VendorDirective;
  clientRequestId?: string;
}

export interface ReferenceAudio {
  uri: string;
  format?: TTSOutputFormat;
  transcript?: string;
}

export interface VoiceCloneRequest {
  operation: "voice.clone.create";
  providerId: string;
  displayName: string;
  referenceAudio: ReferenceAudio[];
  vendor?: VendorDirective;
  clientRequestId?: string;
}

export interface VoiceCloneInstantRequest {
  operation: "voice.clone.instant";
  providerId: string;
  text: string;
  referenceAudio: ReferenceAudio[];
  output?: TTSOutputPreferences;
  controls?: TTSCanonicalControls;
  vendor?: VendorDirective;
  clientRequestId?: string;
}

export interface VoiceCloneDeleteRequest {
  operation: "voice.clone.delete";
  providerId: string;
  voiceId: string;
  clientRequestId?: string;
}

export type TTSOperationRequest =
  | TTSSyncRequest
  | TTSStreamRequest
  | VoiceCloneRequest
  | VoiceCloneInstantRequest
  | VoiceCloneDeleteRequest;

export function requestOperation(request: TTSOperationRequest): TTSOperation {
  return request.operation;
}

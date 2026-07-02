import type { TTSOutputFormat } from "./capabilities";
import type { TTSOperation } from "./operations";
import type { VendorPayload } from "./vendor-extension";

export type RunStatus = "planned" | "succeeded" | "failed";

export interface AudioArtifact {
  fileName: string;
  format: TTSOutputFormat;
  sampleRateHz: number;
  byteLength: number;
  url?: string;
}

export interface TTSSyncProviderResult {
  audio: {
    data: Uint8Array;
    format: TTSOutputFormat;
    sampleRateHz: number;
  };
  vendorResponse: VendorPayload;
}

export interface TTSSyncResult {
  runId: string;
  providerId: string;
  operation: "tts.sync";
  status: RunStatus;
  createdAt: string;
  audio: AudioArtifact;
  archive: {
    runPath: string;
    files: string[];
  };
}

export interface TTSStreamSession {
  sessionId: string;
  providerId: string;
  operation: "tts.stream";
  protocol: "websocket" | "sse" | "http_chunk";
  url?: string;
}

export type TTSStreamEvent =
  | {
      type: "audio";
      sequence: number;
      data: Uint8Array;
    }
  | {
      type: "metadata";
      sequence: number;
      payload: VendorPayload;
    }
  | {
      type: "done";
      sequence: number;
    }
  | {
      type: "error";
      sequence: number;
      message: string;
    };

export interface VoiceRecord {
  voiceId: string;
  providerId: string;
  displayName: string;
  createdAt: string;
  sourceOperation: Extract<TTSOperation, "voice.clone.create" | "voice.clone.instant">;
}

export interface VoiceQuery {
  providerId?: string;
}

export interface VoiceCloneResult {
  voice: VoiceRecord;
  vendorResponse: VendorPayload;
}

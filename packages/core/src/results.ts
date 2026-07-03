import type { TTSOutputFormat, TTSStreamProtocol } from "./capabilities";
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

export interface ArchivedRunSummary {
  runId: string;
  providerId: string;
  operation: TTSOperation;
  status: RunStatus;
  createdAt: string;
  audio?: AudioArtifact;
  archive: {
    runPath: string;
    files: string[];
  };
}

export interface TTSStreamSession {
  sessionId: string;
  providerId: string;
  operation: "tts.stream";
  protocol: TTSStreamProtocol;
  url?: string;
}

export type TTSStreamEvent =
  | {
      type: "session.started";
      sessionId: string;
      planId: string;
      sequence: number;
    }
  | {
      type: "audio.chunk";
      sequence: number;
      data: Uint8Array;
      format: TTSOutputFormat;
      timestampMs?: number;
    }
  | {
      type: "metadata";
      sequence: number;
      payload: VendorPayload;
    }
  | {
      type: "warning";
      sequence: number;
      warning: VendorPayload;
    }
  | {
      type: "session.completed";
      sequence: number;
      durationMs?: number;
      audioPath?: string;
    }
  | {
      type: "error";
      sequence: number;
      message: string;
    };

export interface VoiceRecord {
  voiceId: string;
  providerId: string;
  providerVoiceId: string;
  displayName: string;
  source: "vendor_builtin" | "cloned";
  language?: string;
  createdAt: string;
  sourceOperation: Extract<TTSOperation, "voice.clone.create" | "voice.clone.instant">;
  clone?: {
    referenceAudioIds?: string[];
    createdAt: string;
    consentScope?: string;
    expiresAt?: string;
  };
  vendorMetadata?: VendorPayload;
}

export interface VoiceQuery {
  providerId?: string;
}

export interface VoiceCloneResult {
  voice: VoiceRecord;
  vendorResponse: VendorPayload;
}

export interface VoiceCloneDeleteResult {
  voiceId: string;
  providerId: string;
  deletedAt: string;
  vendorResponse: VendorPayload;
}

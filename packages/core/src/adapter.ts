import type { TTSCapabilities, VoiceCompatibility } from "./capabilities";
import type { MappingReport } from "./mapping-report";
import type { TTSOperation } from "./operations";
import type {
  TTSOperationRequest,
  TTSSyncRequest,
  TTSStreamRequest,
  VoiceCloneDeleteRequest,
  VoiceCloneInstantRequest,
  VoiceCloneRequest
} from "./requests";
import type {
  TTSSyncProviderResult,
  TTSStreamEvent,
  VoiceCloneDeleteResult,
  VoiceCloneInstantProviderResult,
  VoiceCloneResult,
  VoiceRecord
} from "./results";
import type { VendorExtensionSchema, VendorPayload } from "./vendor-extension";

export interface TTSPlanBase {
  planId: string;
  providerId: string;
  adapterVersion: string;
  operation: TTSOperation;
  createdAt: string;
  capabilitySnapshot: TTSCapabilities;
  vendorRequest: VendorPayload;
  mappingReport: MappingReport;
}

export interface TTSSyncPlan extends TTSPlanBase {
  operation: "tts.sync";
  canonicalRequest: TTSSyncRequest;
}

export interface TTSStreamPlan extends TTSPlanBase {
  operation: "tts.stream";
  canonicalRequest: TTSStreamRequest;
}

export interface VoiceClonePlan extends TTSPlanBase {
  operation: "voice.clone.create";
  canonicalRequest: VoiceCloneRequest;
}

export interface VoiceCloneInstantPlan extends TTSPlanBase {
  operation: "voice.clone.instant";
  canonicalRequest: VoiceCloneInstantRequest;
}

export interface VoiceCloneDeletePlan extends TTSPlanBase {
  operation: "voice.clone.delete";
  canonicalRequest: VoiceCloneDeleteRequest;
}

export type TTSPlan =
  | TTSSyncPlan
  | TTSStreamPlan
  | VoiceClonePlan
  | VoiceCloneInstantPlan
  | VoiceCloneDeletePlan;

export interface TTSAdapter {
  providerId: string;
  adapterVersion: string;

  capabilities(): TTSCapabilities;
  extensionSchema(operation: TTSOperation): VendorExtensionSchema;
  voiceCompatibility?(voice: VoiceRecord): VoiceCompatibility | undefined;
  plan(request: TTSOperationRequest): Promise<TTSPlan>;

  synthesizeSync?(plan: TTSSyncPlan): Promise<TTSSyncProviderResult>;
  synthesizeStream?(plan: TTSStreamPlan): AsyncIterable<TTSStreamEvent>;
  createVoiceClone?(plan: VoiceClonePlan): Promise<VoiceCloneResult>;
  createInstantVoiceClone?(plan: VoiceCloneInstantPlan): Promise<VoiceCloneInstantProviderResult>;
  deleteVoiceClone?(plan: VoiceCloneDeletePlan): Promise<VoiceCloneDeleteResult>;
}

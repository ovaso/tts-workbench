import {
  TTSError,
  type TTSCapabilities,
  type TTSSyncRequest,
  type TTSSyncResult,
  type TTSStreamRequest,
  type TTSStreamSession,
  type VoiceCloneRequest,
  type VoiceCloneResult,
  type VoiceQuery,
  type VoiceRecord
} from "@tts-platform/core";
import type { FileRunArchive } from "../storage/run-archive";
import type { InMemoryVoiceRegistry } from "../storage/voice-registry";
import type { AdapterRegistry, ProviderSummary } from "./adapter-registry";

export class TTSFacade {
  constructor(
    private readonly registry: AdapterRegistry,
    private readonly archive: FileRunArchive,
    private readonly voices: InMemoryVoiceRegistry
  ) {}

  listProviders(): ProviderSummary[] {
    return this.registry.listProviders();
  }

  getCapabilities(providerId: string): TTSCapabilities {
    return this.registry.capabilities(providerId);
  }

  async synthesizeSync(request: TTSSyncRequest): Promise<TTSSyncResult> {
    const adapter = this.registry.getOrThrow(request.providerId);
    const plan = await adapter.plan(request);

    if (plan.operation !== "tts.sync" || adapter.synthesizeSync === undefined) {
      throw new TTSError(
        `Provider '${request.providerId}' does not support tts.sync.`,
        "operation_not_supported",
        400
      );
    }

    const providerResult = await adapter.synthesizeSync(plan);
    return this.archive.writeRun({
      request,
      plan,
      providerResult
    });
  }

  async synthesizeStream(_request: TTSStreamRequest): Promise<TTSStreamSession> {
    throw new TTSError("Streaming synthesis is not implemented yet.", "operation_not_supported", 501);
  }

  async createVoiceClone(_request: VoiceCloneRequest): Promise<VoiceCloneResult> {
    throw new TTSError("Voice clone creation is not implemented yet.", "operation_not_supported", 501);
  }

  listVoices(query?: VoiceQuery): VoiceRecord[] {
    return this.voices.list(query);
  }
}

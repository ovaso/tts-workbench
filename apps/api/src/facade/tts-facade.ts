import {
  TTSError,
  type TTSAdapter,
  type TTSCapabilities,
  type TTSStreamEvent,
  type TTSStreamPlan,
  type TTSSyncRequest,
  type TTSSyncResult,
  type TTSStreamRequest,
  type TTSStreamSession,
  type VoiceCloneRequest,
  type VoiceCloneResult,
  type VoiceCreateRequest,
  type VoiceDeleteResult,
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
    const resolvedRequest = this.resolveVoiceSelection(request);
    const adapter = this.registry.getOrThrow(resolvedRequest.providerId);
    const plan = await adapter.plan(resolvedRequest);

    if (plan.operation !== "tts.sync" || adapter.synthesizeSync === undefined) {
      throw new TTSError(
        `Provider '${resolvedRequest.providerId}' does not support tts.sync.`,
        "operation_not_supported",
        400
      );
    }

    const providerResult = await adapter.synthesizeSync(plan);
    return this.archive.writeRun({
      request: resolvedRequest,
      plan,
      providerResult
    });
  }

  // prepareStream: 入参为流式合成请求；输出已 plan 的 stream session 执行上下文。
  async prepareStream(request: TTSStreamRequest): Promise<TTSPreparedStreamSession> {
    const resolvedRequest = this.resolveVoiceSelection(request);
    const adapter = this.registry.getOrThrow(resolvedRequest.providerId);
    const plan = await adapter.plan(resolvedRequest);

    if (plan.operation !== "tts.stream" || adapter.synthesizeStream === undefined) {
      throw new TTSError(
        `Provider '${resolvedRequest.providerId}' does not support tts.stream.`,
        "operation_not_supported",
        400
      );
    }

    const streamAdapter: TTSStreamAdapter = adapter as TTSStreamAdapter;
    return {
      request: resolvedRequest,
      plan,
      adapter: streamAdapter,
      session: {
        sessionId: plan.planId,
        providerId: resolvedRequest.providerId,
        operation: "tts.stream",
        protocol: resolvedRequest.stream?.protocol ?? "websocket"
      }
    };
  }

  async synthesizeStream(request: TTSStreamRequest): Promise<TTSStreamSession> {
    const prepared = await this.prepareStream(request);
    return prepared.session;
  }

  async createVoiceClone(request: VoiceCloneRequest): Promise<VoiceCloneResult> {
    const adapter = this.registry.getOrThrow(request.providerId);
    const plan = await adapter.plan(request);

    if (plan.operation !== "voice.clone.create" || adapter.createVoiceClone === undefined) {
      throw new TTSError(
        `Provider '${request.providerId}' does not support voice.clone.create.`,
        "operation_not_supported",
        400
      );
    }

    const providerResult = await adapter.createVoiceClone(plan);
    this.voices.save(providerResult.voice);
    await this.archive.writeVoiceClone({
      request,
      plan,
      providerResult
    });
    return providerResult;
  }

  listVoices(query?: VoiceQuery): VoiceRecord[] {
    return this.voices.list(query);
  }

  // createVoice: 入参为手动登记音色请求；输出写入本地 registry 后的受控音色记录。
  createVoice(request: VoiceCreateRequest): VoiceRecord {
    return this.voices.save({
      voiceId: `${request.providerId}:${request.providerVoiceId}`,
      providerId: request.providerId,
      providerVoiceId: request.providerVoiceId,
      displayName: request.displayName,
      source: request.source,
      createdAt: new Date().toISOString(),
      ...(request.modelId === undefined ? {} : { modelId: request.modelId }),
      ...(request.language === undefined ? {} : { language: request.language }),
      ...(request.vendorMetadata === undefined ? {} : { vendorMetadata: request.vendorMetadata })
    });
  }

  // deleteVoice: 入参为平台 voiceId；输出本地受控音色删除结果，不调用厂商删除接口。
  deleteVoice(voiceId: string): VoiceDeleteResult {
    const voice = this.voices.delete(voiceId);
    if (voice === undefined) {
      throw new TTSError(`Voice '${voiceId}' was not found.`, "invalid_request", 404);
    }
    return {
      voiceId: voice.voiceId,
      providerId: voice.providerId,
      providerVoiceId: voice.providerVoiceId,
      deletedAt: new Date().toISOString()
    };
  }

  // resolveVoiceSelection: 入参为同步合成请求；功能是把平台 voiceId 解析为厂商 providerVoiceId。
  private resolveVoiceSelection<TRequest extends TTSSyncRequest | TTSStreamRequest>(request: TRequest): TRequest {
    const localVoiceId = request.voice.voiceId;
    if (localVoiceId === undefined) {
      return request;
    }

    const voice = this.voices.get(localVoiceId);
    if (voice === undefined) {
      return request;
    }
    if (voice.providerId !== request.providerId) {
      throw new TTSError(
        `Voice '${localVoiceId}' belongs to provider '${voice.providerId}', not '${request.providerId}'.`,
        "invalid_request",
        400
      );
    }

    return {
      ...request,
      voice: {
        ...request.voice,
        providerVoiceId: voice.providerVoiceId
      }
    } as TRequest;
  }
}

export interface TTSStreamAdapter extends TTSAdapter {
  synthesizeStream(plan: TTSStreamPlan): AsyncIterable<TTSStreamEvent>;
}

export interface TTSPreparedStreamSession {
  session: TTSStreamSession;
  request: TTSStreamRequest;
  plan: TTSStreamPlan;
  adapter: TTSStreamAdapter;
}

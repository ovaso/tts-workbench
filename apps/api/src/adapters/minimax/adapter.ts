import WebSocket, { type RawData } from "ws";
import {
  TTSError,
  type AppliedCanonicalField,
  type AppliedVendorExtension,
  type IgnoredField,
  type JsonValue,
  type MappingReport,
  type TTSAdapter,
  type TTSOperation,
  type TTSOperationRequest,
  type TTSStreamEvent,
  type TTSStreamPlan,
  type TTSVendorModel,
  type VoiceClonePlan,
  type VoiceCloneResult,
  type TTSSyncPlan,
  type TTSSyncProviderResult,
  type TTSOutputFormat,
  type VendorExtensionSchema,
  type VendorPayload
} from "@tts-platform/core";
import { createPlanId } from "../../utils/ids";
import { MINIMAX_ADAPTER_VERSION, minimaxCapabilities } from "./capabilities";
import { minimaxExtensionSchema } from "./extension-schema";

const DEFAULT_BASE_URL = "https://api.minimaxi.com";

// MiniMaxAdapterOptions: 入参为可选 API Key、Base URL 和 fetch 实现；用于实例化可测试的 MiniMax Adapter。
export interface MiniMaxAdapterOptions {
  apiKey?: string | undefined;
  baseUrl?: string;
  fetch?: typeof fetch;
  webSocketFactory?: MiniMaxWebSocketFactory;
}

export interface MiniMaxWebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: "open", listener: () => void): void;
  on(event: "message", listener: (data: RawData, isBinary: boolean) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: (code: number, reason: Buffer) => void): void;
}

export type MiniMaxWebSocketFactory = (
  url: string,
  init: {
    headers: Record<string, string>;
  }
) => MiniMaxWebSocketLike;

// MiniMaxTTSAdapter: 厂商 Adapter 实现；负责 MiniMax capability 暴露、plan-first 映射和 HTTP TTS 执行。
export class MiniMaxTTSAdapter implements TTSAdapter {
  private readonly providerDefinition;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly webSocketFactory: MiniMaxWebSocketFactory;

  readonly providerId;
  readonly adapterVersion;

  // constructor: 入参为 MiniMaxAdapterOptions；功能是固化厂商定义和运行时依赖。
  constructor(options: MiniMaxAdapterOptions = {}) {
    this.providerDefinition = minimaxCapabilities(MINIMAX_ADAPTER_VERSION);
    this.providerId = this.providerDefinition.providerId;
    this.adapterVersion = this.providerDefinition.adapterVersion;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetch ?? fetch;
    this.webSocketFactory = options.webSocketFactory ?? ((url, init) => new WebSocket(url, init));
  }

  // capabilities: 无入参；返回 MiniMax 当前 adapter 实例固化的厂商能力定义。
  capabilities() {
    return this.providerDefinition;
  }

  // extensionSchema: 入参为 operation；返回该 operation 对应的 MiniMax vendor extension schema。
  extensionSchema(operation: TTSOperation): VendorExtensionSchema {
    return minimaxExtensionSchema(operation);
  }

  // plan: 入参为平台 operation request；输出 MiniMax plan，包含 vendor request 和 mapping report。
  async plan(request: TTSOperationRequest): Promise<TTSSyncPlan | TTSStreamPlan | VoiceClonePlan> {
    if (request.operation === "tts.stream") {
      return this.planStream(request);
    }
    if (request.operation === "voice.clone.create") {
      return this.planVoiceClone(request);
    }
    if (request.operation !== "tts.sync") {
      throw new TTSError(`MiniMax adapter does not support '${request.operation}'.`, "operation_not_supported", 400);
    }

    // capability snapshot 必须在调用厂商前固定，后续 archive 和 benchmark 都依赖这份快照。
    const capabilitySnapshot = this.capabilities();
    const operationCapability = capabilitySnapshot.operations[request.operation];
    if (operationCapability?.supported !== true) {
      throw new TTSError("MiniMax does not support this operation.", "operation_not_supported", 400);
    }

    // 模型属于 vendor；未显式指定时使用当前 operation 的默认模型。
    const modelId = request.model ?? defaultModelId(capabilitySnapshot.vendorModels, request.operation);
    const model = capabilitySnapshot.vendorModels.find((candidate) => candidate.modelId === modelId);
    if (model === undefined) {
      throw new TTSError(`MiniMax model '${modelId}' was not found.`, "invalid_request", 400);
    }

    // vendor directive 决定是否允许应用 MiniMax 专有参数。
    const directiveMode = request.vendor?.mode ?? "prefer_vendor";
    const extension = request.vendor?.extensions?.[this.providerId];
    if (directiveMode === "vendor_required" && extension === undefined) {
      throw new TTSError(
        "MiniMax vendor extension is required by the request but was not provided.",
        "vendor_extension_required",
        400
      );
    }

    // 下面开始将 canonical request 映射为 MiniMax /v1/t2a_v2 请求体。
    const ignoredFields: IgnoredField[] = [];
    const appliedCanonicalFields: AppliedCanonicalField[] = [];
    const appliedVendorExtensions: AppliedVendorExtension[] = [];
    const defaultOutput = model.defaultConfiguration?.output ?? {};
    const defaultControls = model.defaultConfiguration?.controls ?? {};
    const defaultVoice = model.defaultConfiguration?.voice ?? {};
    const supportedFormats = model.canonicalCapabilities.outputFormats ?? [];
    const supportedSampleRates = model.canonicalCapabilities.sampleRatesHz ?? [];
    const requestedFormat = request.output?.format;
    const requestedSampleRate = request.output?.sampleRateHz;
    const requestedBitrate = request.output?.bitrate;
    const requestedChannels = request.output?.channels;
    // 支持不等于开启：只有 request 显式传入且模型支持时才应用，否则使用模型默认值。
    const actualFormat =
      requestedFormat !== undefined && supportedFormats.includes(requestedFormat)
        ? requestedFormat
        : defaultOutput.format ?? "mp3";
    const actualSampleRate =
      requestedSampleRate !== undefined && supportedSampleRates.includes(requestedSampleRate)
        ? requestedSampleRate
        : defaultOutput.sampleRateHz ?? 32000;
    const actualBitrate = requestedBitrate ?? defaultOutput.bitrate ?? 128000;
    const actualChannels = requestedChannels ?? defaultOutput.channels ?? 1;
    const requestedVoice = normalizeSynthesisVoiceId(
      request.voice.providerVoiceId ?? request.voice.voiceId,
      this.providerId
    );
    const voiceId = requestedVoice ?? defaultVoice.providerVoiceId;
    if (voiceId === undefined) {
      throw new TTSError(
        "MiniMax requires voice.voiceId/providerVoiceId or a model default voice.",
        "invalid_request",
        400
      );
    }

    // appliedCanonicalFields 只记录本次请求显式启用并成功映射的 canonical 字段。
    appliedCanonicalFields.push(applied("text", request.text, "text"));
    if (requestedVoice !== undefined) {
      appliedCanonicalFields.push(applied("voice", requestedVoice, "voice_setting.voice_id"));
    }
    if (request.model !== undefined) {
      appliedCanonicalFields.push(applied("model", modelId, "model"));
    }
    if (request.controls?.speed !== undefined) {
      appliedCanonicalFields.push(applied("controls.speed", request.controls.speed, "voice_setting.speed"));
    }
    if (request.controls?.pitch !== undefined) {
      appliedCanonicalFields.push(applied("controls.pitch", request.controls.pitch, "voice_setting.pitch"));
    }
    if (request.controls?.volume !== undefined) {
      appliedCanonicalFields.push(applied("controls.volume", request.controls.volume, "voice_setting.vol"));
    }
    if (request.controls?.emotion !== undefined) {
      appliedCanonicalFields.push(applied("controls.emotion", request.controls.emotion, "voice_setting.emotion"));
    }
    if (requestedFormat !== undefined && supportedFormats.includes(requestedFormat)) {
      appliedCanonicalFields.push(applied("output.format", requestedFormat, "audio_setting.format"));
    }
    if (requestedSampleRate !== undefined && supportedSampleRates.includes(requestedSampleRate)) {
      appliedCanonicalFields.push(
        applied("output.sampleRateHz", requestedSampleRate, "audio_setting.sample_rate")
      );
    }
    if (requestedBitrate !== undefined) {
      appliedCanonicalFields.push(applied("output.bitrate", requestedBitrate, "audio_setting.bitrate"));
    }
    if (requestedChannels !== undefined) {
      appliedCanonicalFields.push(applied("output.channels", requestedChannels, "audio_setting.channel"));
    }

    // 不支持或当前 adapter 不处理的字段必须进入 ignoredFields，而不是静默丢弃。
    if (request.ssml !== undefined) {
      ignoredFields.push({
        field: "ssml",
        reason: `MiniMax model '${modelId}' does not declare SSML support.`
      });
    }
    if (request.controls?.style !== undefined) {
      ignoredFields.push({
        field: "controls.style",
        reason: `MiniMax model '${modelId}' does not expose canonical style control.`
      });
    }
    if (requestedFormat !== undefined && !supportedFormats.includes(requestedFormat)) {
      ignoredFields.push({
        field: "output.format",
        reason: `MiniMax model '${modelId}' does not support output format '${requestedFormat}'. The vendor default is used.`
      });
    }
    if (requestedSampleRate !== undefined && !supportedSampleRates.includes(requestedSampleRate)) {
      ignoredFields.push({
        field: "output.sampleRateHz",
        reason: `MiniMax model '${modelId}' does not support sample rate '${requestedSampleRate}'. The vendor default is used.`
      });
    }

    // vendorRequest 是后续真实厂商请求和 archive 的事实依据。
    const vendorRequest: VendorPayload = {
      model: modelId,
      text: request.text,
      stream: false,
      voice_setting: {
        voice_id: voiceId,
        speed: request.controls?.speed ?? defaultControls.speed ?? 1,
        vol: request.controls?.volume ?? defaultControls.volume ?? 1,
        pitch: request.controls?.pitch ?? defaultControls.pitch ?? 0,
        ...(request.controls?.emotion === undefined ? {} : { emotion: request.controls.emotion })
      },
      audio_setting: {
        sample_rate: actualSampleRate,
        bitrate: actualBitrate,
        format: actualFormat,
        channel: actualChannels
      },
      ...(request.voice.language === undefined ? {} : { language_boost: request.voice.language })
    };

    if (request.voice.language !== undefined) {
      appliedCanonicalFields.push(applied("voice.language", request.voice.language, "language_boost"));
    }

    // canonical_only 下必须忽略所有 vendor extension，以保证 benchmark 公平性。
    if (extension !== undefined && directiveMode === "canonical_only") {
      ignoredFields.push({
        field: `vendor.extensions.${this.providerId}`,
        reason: "Request mode canonical_only forbids vendor extension application."
      });
    }
    if (extension !== undefined && directiveMode !== "canonical_only") {
      applyVendorExtension({
        providerId: this.providerId,
        schemaVersion: extension.schemaVersion,
        params: extension.params,
        vendorRequest,
        appliedVendorExtensions,
        ignoredFields
      });
    }

    // mappingReport 是审计核心，必须完整记录应用、忽略、近似和 warning。
    const mappingReport: MappingReport = {
      providerId: this.providerId,
      operation: request.operation,
      directiveMode,
      appliedCanonicalFields,
      appliedVendorExtensions,
      ignoredFields,
      approximations: [],
      warnings: []
    };

    if (request.text.length > 3000) {
      mappingReport.warnings.push("MiniMax recommends streaming output for text longer than 3000 characters.");
    }

    return {
      planId: createPlanId(),
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      operation: "tts.sync",
      createdAt: new Date().toISOString(),
      canonicalRequest: request,
      capabilitySnapshot,
      vendorRequest,
      mappingReport
    };
  }

  // planStream: 入参为流式 TTS 请求；输出 MiniMax WebSocket TTS plan。
  private async planStream(request: Extract<TTSOperationRequest, { operation: "tts.stream" }>): Promise<TTSStreamPlan> {
    const syncLikePlan = await this.plan({
      ...request,
      operation: "tts.sync",
      output: {
        ...request.output,
        format: request.stream?.chunkFormat ?? request.output?.format ?? "mp3"
      }
    });
    if (syncLikePlan.operation !== "tts.sync") {
      throw new TTSError(
        "MiniMax stream planning failed to build a sync-compatible plan.",
        "operation_not_supported",
        500
      );
    }
    const vendorRequest = {
      ...syncLikePlan.vendorRequest,
      stream: true
    };
    return {
      ...syncLikePlan,
      operation: "tts.stream",
      canonicalRequest: request,
      vendorRequest,
      mappingReport: {
        ...syncLikePlan.mappingReport,
        operation: "tts.stream"
      }
    };
  }

  // planVoiceClone: 入参为音色克隆请求；输出 MiniMax /v1/voice_clone 多步骤执行计划。
  private async planVoiceClone(
    request: Extract<TTSOperationRequest, { operation: "voice.clone.create" }>
  ): Promise<VoiceClonePlan> {
    const capabilitySnapshot = this.capabilities();
    const operationCapability = capabilitySnapshot.operations[request.operation];
    if (operationCapability?.supported !== true) {
      throw new TTSError("MiniMax does not support voice clone creation.", "operation_not_supported", 400);
    }

    const modelId = request.model ?? defaultModelId(capabilitySnapshot.vendorModels, request.operation);
    const model = capabilitySnapshot.vendorModels.find((candidate) => candidate.modelId === modelId);
    if (model === undefined) {
      throw new TTSError(`MiniMax model '${modelId}' was not found.`, "invalid_request", 400);
    }
    if (request.referenceAudio.length === 0) {
      throw new TTSError("MiniMax voice clone requires one reference audio file.", "invalid_request", 400);
    }

    const directiveMode = request.vendor?.mode ?? "prefer_vendor";
    const extension = request.vendor?.extensions?.[this.providerId];
    if (directiveMode === "vendor_required" && extension === undefined) {
      throw new TTSError(
        "MiniMax vendor extension is required by the request but was not provided.",
        "vendor_extension_required",
        400
      );
    }

    const appliedCanonicalFields: AppliedCanonicalField[] = [
      applied("displayName", request.displayName, "voice_id"),
      applied("referenceAudio[0]", request.referenceAudio[0]?.fileId ?? request.referenceAudio[0]?.uri ?? "", "file_id")
    ];
    const appliedVendorExtensions: AppliedVendorExtension[] = [];
    const ignoredFields: IgnoredField[] = [];
    if (request.model !== undefined) {
      appliedCanonicalFields.push(applied("model", modelId, "model"));
    }

    const vendorRequest: VendorPayload = {
      upload: {
        purpose: "voice_clone",
        referenceAudio: request.referenceAudio[0]
      },
      clone: {
        file_id: request.referenceAudio[0]?.fileId ?? "__uploaded_reference_audio_file_id__",
        voice_id: normalizeVoiceId(request.displayName),
        model: modelId
      }
    };

    if (extension !== undefined && directiveMode === "canonical_only") {
      ignoredFields.push({
        field: `vendor.extensions.${this.providerId}`,
        reason: "Request mode canonical_only forbids vendor extension application."
      });
    }
    if (extension !== undefined && directiveMode !== "canonical_only") {
      applyVendorExtension({
        providerId: this.providerId,
        schemaVersion: extension.schemaVersion,
        params: extension.params,
        vendorRequest: objectAt(vendorRequest, "clone"),
        appliedVendorExtensions,
        ignoredFields,
        allowedKeys: ["clone_prompt", "text"]
      });
    }

    const mappingReport: MappingReport = {
      providerId: this.providerId,
      operation: request.operation,
      directiveMode,
      appliedCanonicalFields,
      appliedVendorExtensions,
      ignoredFields,
      approximations: [],
      warnings: []
    };

    return {
      planId: createPlanId(),
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      operation: "voice.clone.create",
      createdAt: new Date().toISOString(),
      canonicalRequest: request,
      capabilitySnapshot,
      vendorRequest,
      mappingReport
    };
  }

  // synthesizeSync: 入参为 TTSSyncPlan；调用 MiniMax HTTP TTS 并返回解码后的音频和 vendor response。
  async synthesizeSync(plan: TTSSyncPlan): Promise<TTSSyncProviderResult> {
    if (this.apiKey === undefined || this.apiKey.length === 0) {
      throw new TTSError("MINIMAX_API_KEY is required for MiniMax synthesis.", "vendor_execution_failed", 400);
    }

    // 所有真实执行必须使用 plan 中已经审计过的 vendorRequest，不重新拼接业务字段。
    const response = await this.fetchImpl(`${this.baseUrl}/v1/t2a_v2`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(plan.vendorRequest)
    });

    // MiniMax 返回 hex audio；成功后转换为 Uint8Array 进入统一 archive。
    const vendorResponse = (await response.json()) as VendorPayload;
    if (!response.ok) {
      throw new TTSError("MiniMax synthesis request failed.", "vendor_execution_failed", 502, {
        status: response.status,
        vendorResponse: toJsonValue(vendorResponse)
      });
    }

    const baseResp = objectAt(vendorResponse, "base_resp");
    if (typeof baseResp.status_code === "number" && baseResp.status_code !== 0) {
      throw new TTSError("MiniMax synthesis returned an error.", "vendor_execution_failed", 502, {
        vendorResponse: toJsonValue(vendorResponse)
      });
    }

    const data = objectAt(vendorResponse, "data");
    const audioValue = data.audio;
    if (typeof audioValue !== "string" || audioValue.length === 0) {
      throw new TTSError("MiniMax response did not include audio data.", "vendor_execution_failed", 502, {
        vendorResponse: toJsonValue(vendorResponse)
      });
    }

    const format = outputFormatFromVendor(plan.vendorRequest, vendorResponse);
    const sampleRateHz = sampleRateFromVendor(plan.vendorRequest, vendorResponse);

    return {
      audio: {
        data: Uint8Array.from(Buffer.from(audioValue, "hex")),
        format,
        sampleRateHz
      },
      vendorResponse
    };
  }

  // synthesizeStream: 入参为流式 plan；输出 MiniMax WebSocket 事件流。
  async *synthesizeStream(plan: TTSStreamPlan): AsyncIterable<TTSStreamEvent> {
    if (this.apiKey === undefined || this.apiKey.length === 0) {
      throw new TTSError("MINIMAX_API_KEY is required for MiniMax stream synthesis.", "vendor_execution_failed", 400);
    }

    const endpoint = `${this.baseUrl.replace(/^http/, "ws")}/ws/v1/t2a_v2`;
    const startTask = streamStartTask(plan.vendorRequest);
    const continueTask = streamContinueTask(plan.vendorRequest);
    const finishTask = streamFinishTask();
    const format = outputFormatFromVendor(plan.vendorRequest, {});
    const events = new AsyncEventQueue<MiniMaxUpstreamEvent>();
    let sequence = 0;
    let socket: MiniMaxWebSocketLike | undefined;
    let sentStart = false;
    let sentText = false;
    let completed = false;

    yield {
      type: "session.started",
      sessionId: plan.planId,
      planId: plan.planId,
      sequence
    };
    sequence += 1;

    socket = this.webSocketFactory(endpoint, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      }
    });
    socket.on("open", () => {
      events.push({ type: "open" });
    });
    socket.on("message", (data, isBinary) => {
      events.push({ type: "message", data, isBinary });
    });
    socket.on("error", (error) => {
      events.push({ type: "error", error });
    });
    socket.on("close", (code, reason) => {
      events.push({ type: "close", code, reason: reason.toString("utf8") });
      events.end();
    });

    yield {
      type: "metadata",
      sequence,
      payload: {
        protocol: "websocket",
        endpoint,
        startTask,
        continueTask
      }
    };
    sequence += 1;

    try {
      for await (const event of events) {
        if (event.type === "open") {
          continue;
        }

        if (event.type === "error") {
          yield {
            type: "error",
            sequence,
            message: event.error.message
          };
          sequence += 1;
          socket.close(1011, "upstream error");
          return;
        }

        if (event.type === "close") {
          if (!completed) {
            yield {
              type: "error",
              sequence,
              message: `MiniMax upstream WebSocket closed before completion: ${event.code} ${event.reason}`.trim()
            };
          }
          return;
        }

        const upstreamPayload = parseJsonFrame(event.data);
        const upstreamEvent = typeof upstreamPayload.event === "string" ? upstreamPayload.event : "unknown";
        yield {
          type: "metadata",
          sequence,
          payload: {
            upstreamEvent,
            upstreamPayload
          }
        };
        sequence += 1;

        if (upstreamEvent === "connected_success" && !sentStart) {
          socket.send(JSON.stringify(startTask));
          sentStart = true;
          yield {
            type: "metadata",
            sequence,
            payload: {
              upstreamEvent: "task_start.sent"
            }
          };
          sequence += 1;
          continue;
        }

        if (upstreamEvent === "task_started" && !sentText) {
          socket.send(JSON.stringify(continueTask));
          sentText = true;
          yield {
            type: "metadata",
            sequence,
            payload: {
              upstreamEvent: "task_continue.sent"
            }
          };
          sequence += 1;
        }

        const audio = audioHexFromStreamPayload(upstreamPayload);
        if (audio !== undefined) {
          yield {
            type: "audio.chunk",
            sequence,
            data: Uint8Array.from(Buffer.from(audio, "hex")),
            format
          };
          sequence += 1;
        }

        if (isMiniMaxStreamFailure(upstreamPayload)) {
          yield {
            type: "error",
            sequence,
            message: miniMaxStreamErrorMessage(upstreamPayload)
          };
          socket.close(1011, "task failed");
          return;
        }

        if (upstreamPayload.is_final === true || upstreamEvent === "task_finished") {
          socket.send(JSON.stringify(finishTask));
          completed = true;
          yield {
            type: "session.completed",
            sequence
          };
          socket.close(1000, "completed");
          return;
        }
      }
    } finally {
      if (!completed) {
        socket?.close(1000, "stream generator closed");
      }
      events.end();
    }
  }

  // createVoiceClone: 入参为音色克隆 plan；执行上传/复刻 workflow 并返回 voice registry 记录。
  async createVoiceClone(plan: VoiceClonePlan): Promise<VoiceCloneResult> {
    if (this.apiKey === undefined || this.apiKey.length === 0) {
      throw new TTSError("MINIMAX_API_KEY is required for MiniMax voice clone.", "vendor_execution_failed", 400);
    }

    const uploadPlan = objectAt(plan.vendorRequest, "upload");
    const cloneRequest = { ...objectAt(plan.vendorRequest, "clone") };
    const referenceAudio = objectAt(uploadPlan, "referenceAudio");
    let referenceAudioId = vendorIdToString(cloneRequest.file_id) ?? "";
    cloneRequest.file_id = vendorIdForRequest(cloneRequest.file_id);
    const workflow: VendorPayload[] = [];

    if (referenceAudioId.length === 0 || referenceAudioId === "__uploaded_reference_audio_file_id__") {
      const uploadResponse = await this.uploadReferenceAudio(referenceAudio);
      workflow.push({
        step: "upload_reference_audio",
        response: uploadResponse
      });
      assertMiniMaxBaseResponse("MiniMax reference audio upload returned an error.", uploadResponse, {
        workflow
      });
      const file = objectAt(uploadResponse, "file");
      const uploadedFileId = vendorIdToString(file.file_id);
      if (uploadedFileId === undefined) {
        throw new TTSError("MiniMax upload response did not include file.file_id.", "vendor_execution_failed", 502, {
          vendorResponse: toJsonValue(uploadResponse)
        });
      }
      referenceAudioId = uploadedFileId;
      cloneRequest.file_id = vendorIdForRequest(file.file_id);
    }

    const cloneResponse = await this.postJson("/v1/voice_clone", cloneRequest);
    workflow.push({
      step: "voice_clone",
      request: cloneRequest,
      response: cloneResponse
    });
    assertMiniMaxBaseResponse("MiniMax voice clone returned an error.", cloneResponse, {
      workflow,
      cloneResponse
    });

    const providerVoiceId = providerVoiceIdFromCloneResponse(cloneResponse, String(cloneRequest.voice_id));
    const voice = {
      voiceId: `${this.providerId}:${providerVoiceId}`,
      providerId: this.providerId,
      providerVoiceId,
      displayName: plan.canonicalRequest.displayName,
      source: "cloned" as const,
      ...(plan.canonicalRequest.model === undefined ? {} : { modelId: plan.canonicalRequest.model }),
      ...(plan.canonicalRequest.language === undefined ? {} : { language: plan.canonicalRequest.language }),
      createdAt: new Date().toISOString(),
      sourceOperation: "voice.clone.create" as const,
      clone: cloneMetadata(referenceAudioId, plan.canonicalRequest.consent?.usageScope),
      vendorMetadata: {
        workflow
      }
    };
    return {
      voice,
      vendorResponse: {
        workflow,
        cloneResponse
      }
    };
  }

  // uploadReferenceAudio: 入参为 reference audio 描述；上传到 MiniMax files API 并返回响应。
  private async uploadReferenceAudio(referenceAudio: VendorPayload): Promise<VendorPayload> {
    const uri = referenceAudio.uri;
    if (typeof uri !== "string" || uri.length === 0) {
      throw new TTSError("referenceAudio.uri is required when fileId is not provided.", "invalid_request", 400);
    }
    const audioResponse = await this.fetchImpl(uri);
    if (!audioResponse.ok) {
      throw new TTSError("Failed to read reference audio uri.", "vendor_execution_failed", 502, {
        status: audioResponse.status
      });
    }
    const bytes = await audioResponse.arrayBuffer();
    const format = typeof referenceAudio.format === "string" ? referenceAudio.format : "mp3";
    const form = new FormData();
    form.set("purpose", "voice_clone");
    form.set("file", new Blob([bytes], { type: mimeTypeForReferenceAudio(format) }), `voice-clone-audio.${format}`);
    const response = await this.fetchImpl(`${this.baseUrl}/v1/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey ?? ""}`
      },
      body: form
    });
    const vendorResponse = (await response.json()) as VendorPayload;
    if (!response.ok) {
      throw new TTSError("MiniMax reference audio upload failed.", "vendor_execution_failed", 502, {
        status: response.status,
        vendorResponse: toJsonValue(vendorResponse)
      });
    }
    return vendorResponse;
  }

  // postJson: 入参为 MiniMax path 和 JSON body；输出解析后的 vendor response。
  private async postJson(pathname: string, body: VendorPayload): Promise<VendorPayload> {
    const response = await this.fetchImpl(`${this.baseUrl}${pathname}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey ?? ""}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const vendorResponse = (await response.json()) as VendorPayload;
    if (!response.ok) {
      throw new TTSError("MiniMax JSON request failed.", "vendor_execution_failed", 502, {
        status: response.status,
        vendorResponse: toJsonValue(vendorResponse)
      });
    }
    return vendorResponse;
  }
}

// applyVendorExtension: 入参为 MiniMax extension 应用上下文；功能是把允许的 vendor 参数写入 vendorRequest 并记录 mapping。
function applyVendorExtension(input: {
  providerId: string;
  schemaVersion: string;
  params: VendorPayload;
  vendorRequest: VendorPayload;
  appliedVendorExtensions: AppliedVendorExtension[];
  ignoredFields: IgnoredField[];
  allowedKeys?: string[];
}): void {
  // 仅允许文档确认过的 MiniMax 字段进入 vendorRequest。
  const supportedKeys = input.allowedKeys ?? [
    "pronunciation_dict",
    "timbre_weights",
    "language_boost",
    "voice_modify",
    "subtitle_enable",
    "subtitle_type",
    "output_format",
    "aigc_watermark"
  ];

  for (const [key, value] of Object.entries(input.params)) {
    if (!supportedKeys.includes(key)) {
      input.ignoredFields.push({
        field: `vendor.extensions.${input.providerId}.${key}`,
        reason: "MiniMax adapter does not support this vendor extension key."
      });
      continue;
    }
    const sanitizedValue = sanitizeVendorExtensionValue({
      providerId: input.providerId,
      key,
      value,
      ignoredFields: input.ignoredFields
    });
    if (!isValidMiniMaxExtensionValue(key, sanitizedValue)) {
      input.ignoredFields.push({
        field: `vendor.extensions.${input.providerId}.${key}`,
        reason: "MiniMax vendor extension value does not match the declared schema."
      });
      continue;
    }
    if (sanitizedValue === undefined) {
      continue;
    }
    input.vendorRequest[key] = sanitizedValue;
    input.appliedVendorExtensions.push({
      providerId: input.providerId,
      schemaVersion: input.schemaVersion,
      path: key,
      value: toJsonValue(sanitizedValue)
    });
  }
}

// isValidMiniMaxExtensionValue: 入参为扩展字段和值；输出是否满足当前 MiniMax schema 的基础类型约束。
function isValidMiniMaxExtensionValue(key: string, value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (key === "pronunciation_dict" || key === "voice_modify" || key === "clone_prompt") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  if (key === "timbre_weights") {
    return Array.isArray(value);
  }
  if (key === "language_boost") {
    return value === null || typeof value === "string";
  }
  if (key === "subtitle_enable" || key === "aigc_watermark") {
    return typeof value === "boolean";
  }
  if (key === "subtitle_type") {
    return value === "sentence" || value === "word" || value === "word_streaming";
  }
  if (key === "output_format") {
    return value === "hex" || value === "url";
  }
  if (key === "text") {
    return typeof value === "string";
  }
  return false;
}

// sanitizeVendorExtensionValue: 入参为厂商扩展字段和值；输出可写入 vendorRequest 的安全值。
function sanitizeVendorExtensionValue(input: {
  providerId: string;
  key: string;
  value: unknown;
  ignoredFields: IgnoredField[];
}): unknown {
  if (input.key !== "clone_prompt") {
    return input.value;
  }
  if (input.value === null || typeof input.value !== "object" || Array.isArray(input.value)) {
    input.ignoredFields.push({
      field: `vendor.extensions.${input.providerId}.clone_prompt`,
      reason: "MiniMax clone_prompt must be an object."
    });
    return undefined;
  }
  const rawPrompt = input.value as Record<string, unknown>;
  const prompt: Record<string, unknown> = {};
  if (typeof rawPrompt.prompt_text === "string" && rawPrompt.prompt_text.length > 0) {
    prompt.prompt_text = rawPrompt.prompt_text;
  }
  for (const key of Object.keys(rawPrompt)) {
    if (key !== "prompt_text") {
      input.ignoredFields.push({
        field: `vendor.extensions.${input.providerId}.clone_prompt.${key}`,
        reason: "MiniMax adapter fills this clone_prompt field from uploaded files or does not support it."
      });
    }
  }
  return Object.keys(prompt).length > 0 ? prompt : undefined;
}

// applied: 入参为 canonical 字段、值和 vendor 字段路径；输出 mapping report 中的 applied canonical 记录。
function applied(field: string, value: JsonValue, vendorField: string): AppliedCanonicalField {
  return {
    field,
    value,
    vendorField
  };
}

// defaultModelId: 入参为 vendor models 和 operation；输出该 operation 的默认模型 id。
function defaultModelId(models: TTSVendorModel[], operation: TTSOperation): string {
  return models.find((model) => model.defaultForOperations?.includes(operation))?.modelId ?? models[0]?.modelId ?? "";
}

// normalizeVoiceId: 入参为用户可读音色名称；输出适合 MiniMax voice_id 的稳定标识。
function normalizeVoiceId(displayName: string): string {
  const normalized = displayName
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/^[^a-zA-Z]+/, "")
    .replace(/[-_]+$/, "");
  const withPrefix = /^[a-zA-Z]/.test(normalized) ? normalized : `voice_${normalized}`;
  const minLength = withPrefix.length >= 8 ? withPrefix : `${withPrefix}_clone01`;
  return minLength.slice(0, 256).replace(/[-_]+$/, "1");
}

// normalizeSynthesisVoiceId: 入参为用户请求中的音色 id 和 providerId；输出 MiniMax 可接收的厂商音色 id。
function normalizeSynthesisVoiceId(voiceId: string | undefined, providerId: string): string | undefined {
  if (voiceId === undefined) {
    return undefined;
  }
  const localPrefix = `${providerId}:`;
  return voiceId.startsWith(localPrefix) ? voiceId.slice(localPrefix.length) : voiceId;
}

// providerVoiceIdFromCloneResponse: 入参为厂商响应和兜底 voice id；输出 MiniMax provider voice id。
function providerVoiceIdFromCloneResponse(response: VendorPayload, fallback: string): string {
  for (const key of ["voice_id", "voiceId"]) {
    const value = vendorIdToString(response[key]);
    if (value !== undefined) {
      return value;
    }
  }
  const data = objectAt(response, "data");
  for (const key of ["voice_id", "voiceId"]) {
    const value = vendorIdToString(data[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return fallback;
}

// vendorIdToString: 入参为厂商返回的 id；输出适合 archive/registry 的字符串 id。
function vendorIdToString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

// vendorIdForRequest: 入参为厂商 id；输出符合 MiniMax JSON schema 的请求 id，数字字符串会还原为 integer。
function vendorIdForRequest(value: unknown): string | number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return Number(value);
  }
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return undefined;
}

// assertMiniMaxBaseResponse: 入参为错误消息、厂商响应和细节；MiniMax 业务状态码非 0 时抛出执行错误。
function assertMiniMaxBaseResponse(
  message: string,
  response: VendorPayload,
  details: VendorPayload = {}
): void {
  const baseResp = objectAt(response, "base_resp");
  if (typeof baseResp.status_code === "number" && baseResp.status_code !== 0) {
    throw new TTSError(message, "vendor_execution_failed", 502, {
      vendorResponse: toJsonValue(response),
      ...details
    });
  }
}

// cloneMetadata: 入参为参考音频 id 和可选授权范围；输出 VoiceRecord clone 元数据。
function cloneMetadata(fileId: string, consentScope: string | undefined) {
  return {
    referenceAudioIds: [fileId],
    createdAt: new Date().toISOString(),
    ...(consentScope === undefined ? {} : { consentScope })
  };
}

// mimeTypeForReferenceAudio: 入参为参考音频格式；输出上传到 MiniMax files API 时使用的 MIME。
function mimeTypeForReferenceAudio(format: string): string {
  if (format === "wav") {
    return "audio/wav";
  }
  if (format === "m4a") {
    return "audio/mp4";
  }
  return "audio/mpeg";
}

// objectAt: 入参为 vendor payload 和 key；输出该 key 下的对象值，不是对象时返回空对象。
function objectAt(payload: VendorPayload, key: string): Record<string, unknown> {
  const value = payload[key];
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// outputFormatFromVendor: 入参为 vendor request/response；输出平台可识别的音频格式。
function outputFormatFromVendor(vendorRequest: VendorPayload, vendorResponse: VendorPayload): TTSOutputFormat {
  const extraInfo = objectAt(vendorResponse, "extra_info");
  const responseFormat = extraInfo.audio_format;
  if (responseFormat === "mp3" || responseFormat === "wav" || responseFormat === "flac") {
    return responseFormat;
  }
  const audioSetting = objectAt(vendorRequest, "audio_setting");
  const requestFormat = audioSetting.format;
  if (requestFormat === "mp3" || requestFormat === "wav" || requestFormat === "flac") {
    return requestFormat;
  }
  return "mp3";
}

// sampleRateFromVendor: 入参为 vendor request/response；输出响应优先、请求兜底的采样率。
function sampleRateFromVendor(vendorRequest: VendorPayload, vendorResponse: VendorPayload): number {
  const extraInfo = objectAt(vendorResponse, "extra_info");
  if (typeof extraInfo.audio_sample_rate === "number") {
    return extraInfo.audio_sample_rate;
  }
  const audioSetting = objectAt(vendorRequest, "audio_setting");
  return typeof audioSetting.sample_rate === "number" ? audioSetting.sample_rate : 32000;
}

// streamStartTask: 入参为已审计 vendor request；输出 MiniMax WebSocket task_start 帧。
function streamStartTask(vendorRequest: VendorPayload): VendorPayload {
  const { text: _text, stream: _stream, ...rest } = vendorRequest;
  return {
    ...rest,
    event: "task_start"
  };
}

// streamContinueTask: 入参为已审计 vendor request；输出 MiniMax WebSocket task_continue 文本帧。
function streamContinueTask(vendorRequest: VendorPayload): VendorPayload {
  return {
    event: "task_continue",
    text: typeof vendorRequest.text === "string" ? vendorRequest.text : ""
  };
}

// streamFinishTask: 无入参；输出 MiniMax WebSocket task_finish 收尾帧。
function streamFinishTask(): VendorPayload {
  return {
    event: "task_finish"
  };
}

// audioHexFromStreamPayload: 入参为 MiniMax 上游帧；输出 data.audio 中的 hex 音频片段。
function audioHexFromStreamPayload(payload: VendorPayload): string | undefined {
  const data = objectAt(payload, "data");
  return typeof data.audio === "string" && data.audio.length > 0 ? data.audio : undefined;
}

// isMiniMaxStreamFailure: 入参为 MiniMax 上游帧；输出该帧是否表示业务失败。
function isMiniMaxStreamFailure(payload: VendorPayload): boolean {
  if (payload.event === "task_failed" || payload.event === "error") {
    return true;
  }
  const baseResp = objectAt(payload, "base_resp");
  return typeof baseResp.status_code === "number" && baseResp.status_code !== 0;
}

// miniMaxStreamErrorMessage: 入参为 MiniMax 上游失败帧；输出可读错误消息。
function miniMaxStreamErrorMessage(payload: VendorPayload): string {
  if (typeof payload.message === "string" && payload.message.length > 0) {
    return payload.message;
  }
  if (typeof payload.error === "string" && payload.error.length > 0) {
    return payload.error;
  }
  const baseResp = objectAt(payload, "base_resp");
  if (typeof baseResp.status_msg === "string" && baseResp.status_msg.length > 0) {
    return baseResp.status_msg;
  }
  return "MiniMax upstream task failed.";
}

// rawDataToBytes: 入参为 WebSocket 原始数据；输出统一的字节数组。
function rawDataToBytes(data: RawData): Uint8Array {
  if (Buffer.isBuffer(data)) {
    return new Uint8Array(data);
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (Array.isArray(data)) {
    return new Uint8Array(Buffer.concat(data));
  }
  return new Uint8Array(Buffer.from(String(data)));
}

// parseJsonFrame: 入参为 WebSocket 原始帧；输出对象化的 MiniMax 上游 payload。
function parseJsonFrame(data: RawData): VendorPayload {
  const text = Buffer.from(rawDataToBytes(data)).toString("utf8");
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as VendorPayload)
      : { value: parsed };
  } catch {
    return {
      raw: text
    };
  }
}

type MiniMaxUpstreamEvent =
  | {
      type: "open";
    }
  | {
      type: "message";
      data: RawData;
      isBinary: boolean;
    }
  | {
      type: "error";
      error: Error;
    }
  | {
      type: "close";
      code: number;
      reason: string;
    };

// AsyncEventQueue: 用于把 WebSocket 回调事件转换为 async iterator，便于 adapter 产出 TTSStreamEvent。
class AsyncEventQueue<TEvent> implements AsyncIterable<TEvent> {
  private readonly pending: TEvent[] = [];
  private readonly waiters: Array<(result: IteratorResult<TEvent>) => void> = [];
  private closed = false;

  // push: 入参为回调事件；功能是推入队列或唤醒等待中的 async iterator。
  push(event: TEvent): void {
    const waiter = this.waiters.shift();
    if (waiter !== undefined) {
      waiter({
        done: false,
        value: event
      });
      return;
    }
    this.pending.push(event);
  }

  // end: 无入参；功能是关闭队列并结束所有等待中的 async iterator。
  end(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({
        done: true,
        value: undefined
      });
    }
  }

  // next: 无入参；输出 async iterator 的下一个事件。
  private next(): Promise<IteratorResult<TEvent>> {
    const event = this.pending.shift();
    if (event !== undefined) {
      return Promise.resolve({
        done: false,
        value: event
      });
    }
    if (this.closed) {
      return Promise.resolve({
        done: true,
        value: undefined
      });
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  // Symbol.asyncIterator: 无入参；输出当前队列的 async iterator。
  [Symbol.asyncIterator](): AsyncIterator<TEvent> {
    return {
      next: () => this.next()
    };
  }
}

// toJsonValue: 入参为 unknown；输出可安全写入 TTSError details 和 JSON archive 的 JsonValue。
function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }
  if (typeof value === "object") {
    const result: { [key: string]: JsonValue } = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = toJsonValue(child);
    }
    return result;
  }
  return String(value);
}

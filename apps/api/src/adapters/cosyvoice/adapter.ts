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
  type TTSOutputFormat,
  type TTSStreamEvent,
  type TTSStreamPlan,
  type TTSVendorModel,
  type TTSSyncPlan,
  type TTSSyncProviderResult,
  type VendorExtensionSchema,
  type VendorPayload,
  type VoiceCompatibility,
  type VoiceClonePlan,
  type VoiceCloneResult,
  type VoiceRecord
} from "@tts-platform/core";
import { createPlanId } from "../../utils/ids";
import {
  COSYVOICE_ADAPTER_VERSION,
  COSYVOICE_DEFAULT_MODEL,
  COSYVOICE_PROVIDER_ID,
  cosyVoiceCapabilities
} from "./capabilities";
import { cosyVoiceExtensionSchema } from "./extension-schema";

const DEFAULT_REGION = "cn-beijing";
const DEFAULT_WORKSPACE_BASE_DOMAIN = "maas.aliyuncs.com";
const DEFAULT_GLOBAL_INFERENCE_ENDPOINT = "wss://dashscope.aliyuncs.com/api-ws/v1/inference";
const VOICE_ENROLLMENT_MODEL = "voice-enrollment";

export interface CosyVoiceAdapterOptions {
  apiKey?: string | undefined;
  workspaceId?: string | undefined;
  region?: string | undefined;
  streamEndpoint?: string | undefined;
  fetch?: typeof fetch;
  webSocketFactory?: CosyVoiceWebSocketFactory;
}

export interface CosyVoiceWebSocketLike {
  on(event: "open", listener: () => void): void;
  on(event: "message", listener: (data: RawData, isBinary: boolean) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: (code: number, reason: Buffer) => void): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type CosyVoiceWebSocketFactory = (
  url: string,
  options: {
    headers: Record<string, string>;
  }
) => CosyVoiceWebSocketLike;

// CosyVoiceTTSAdapter: 厂商 Adapter 实现；负责 CosyVoice capability、plan-first 映射和 HTTP 执行。
export class CosyVoiceTTSAdapter implements TTSAdapter {
  private readonly providerDefinition;
  private readonly apiKey: string | undefined;
  private readonly workspaceId: string | undefined;
  private readonly region: string;
  private readonly streamEndpoint: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly webSocketFactory: CosyVoiceWebSocketFactory;

  readonly providerId;
  readonly adapterVersion;

  // constructor: 入参为 CosyVoiceAdapterOptions；功能是固化厂商定义和运行时依赖。
  constructor(options: CosyVoiceAdapterOptions = {}) {
    this.providerDefinition = cosyVoiceCapabilities(COSYVOICE_ADAPTER_VERSION);
    this.providerId = this.providerDefinition.providerId;
    this.adapterVersion = this.providerDefinition.adapterVersion;
    this.apiKey = options.apiKey;
    this.workspaceId = options.workspaceId;
    this.region = options.region ?? DEFAULT_REGION;
    this.streamEndpoint = options.streamEndpoint;
    this.fetchImpl = options.fetch ?? fetch;
    this.webSocketFactory = options.webSocketFactory ?? ((url, init) => new WebSocket(url, init));
  }

  // capabilities: 无入参；返回 CosyVoice 当前 adapter 实例固化的厂商能力定义。
  capabilities() {
    return this.providerDefinition;
  }

  // extensionSchema: 入参为 operation；返回该 operation 对应的 CosyVoice vendor extension schema。
  extensionSchema(operation: TTSOperation): VendorExtensionSchema {
    return cosyVoiceExtensionSchema(operation);
  }

  // voiceCompatibility: 入参为本地 voice 记录；输出 CosyVoice voice_id 与 target_model 的强绑定关系。
  voiceCompatibility(voice: VoiceRecord): VoiceCompatibility | undefined {
    if (voice.compatibility !== undefined) {
      return voice.compatibility;
    }
    const modelId = voice.modelId ?? stringValue(voice.vendorMetadata?.targetModel);
    return modelId === undefined ? undefined : cosyVoiceModelCompatibility(modelId);
  }

  // plan: 入参为平台 operation request；输出 CosyVoice plan，包含 vendor request 和 mapping report。
  async plan(request: TTSOperationRequest): Promise<TTSSyncPlan | TTSStreamPlan | VoiceClonePlan> {
    if (request.operation === "voice.clone.create") {
      return this.planVoiceClone(request);
    }
    if (request.operation !== "tts.sync" && request.operation !== "tts.stream") {
      throw new TTSError(`CosyVoice adapter does not support '${request.operation}'.`, "operation_not_supported", 400);
    }

    const capabilitySnapshot = this.capabilities();
    const operationCapability = capabilitySnapshot.operations[request.operation];
    if (operationCapability?.supported !== true) {
      throw new TTSError("CosyVoice does not support this operation.", "operation_not_supported", 400);
    }

    const modelId = request.model ?? defaultModelId(capabilitySnapshot.vendorModels, request.operation);
    const model = capabilitySnapshot.vendorModels.find((candidate) => candidate.modelId === modelId);
    if (model === undefined) {
      throw new TTSError(`CosyVoice model '${modelId}' was not found.`, "invalid_request", 400);
    }
    assertCosyVoiceCompatibility(request.voice.compatibility, modelId);

    const directiveMode = request.vendor?.mode ?? "prefer_vendor";
    const extension = request.vendor?.extensions?.[this.providerId];
    if (directiveMode === "vendor_required" && extension === undefined) {
      throw new TTSError(
        "CosyVoice vendor extension is required by the request but was not provided.",
        "vendor_extension_required",
        400
      );
    }

    const appliedCanonicalFields: AppliedCanonicalField[] = [];
    const appliedVendorExtensions: AppliedVendorExtension[] = [];
    const ignoredFields: IgnoredField[] = [];
    const supportedFormats = model.canonicalCapabilities.outputFormats ?? [];
    const supportedSampleRates = model.canonicalCapabilities.sampleRatesHz ?? [];
    const defaultOutput = model.defaultConfiguration?.output ?? {};
    const defaultControls = model.defaultConfiguration?.controls ?? {};
    const requestedVoice = normalizeProviderVoiceId(request.voice.providerVoiceId ?? request.voice.voiceId);
    if (requestedVoice === undefined) {
      throw new TTSError(
        "CosyVoice requires voice.voiceId/providerVoiceId. v3.5 models do not provide a default system voice.",
        "invalid_request",
        400
      );
    }

    const requestedFormat =
      request.operation === "tts.stream" ? request.stream?.chunkFormat ?? request.output?.format : request.output?.format;
    const requestedSampleRate = request.output?.sampleRateHz;
    const actualFormat =
      requestedFormat !== undefined && supportedFormats.includes(requestedFormat)
        ? requestedFormat
        : defaultOutput.format ?? "mp3";
    const actualSampleRate =
      requestedSampleRate !== undefined && supportedSampleRates.includes(requestedSampleRate)
        ? requestedSampleRate
        : defaultOutput.sampleRateHz ?? 24000;

    appliedCanonicalFields.push(applied("text", request.text, "input.text"));
    appliedCanonicalFields.push(applied("voice", requestedVoice, "input.voice"));
    if (request.model !== undefined) {
      appliedCanonicalFields.push(applied("model", modelId, "model"));
    }
    if (requestedFormat !== undefined && supportedFormats.includes(requestedFormat)) {
      appliedCanonicalFields.push(applied("output.format", requestedFormat, "input.format"));
    }
    if (requestedSampleRate !== undefined && supportedSampleRates.includes(requestedSampleRate)) {
      appliedCanonicalFields.push(applied("output.sampleRateHz", requestedSampleRate, "input.sample_rate"));
    }
    if (request.controls?.volume !== undefined) {
      appliedCanonicalFields.push(applied("controls.volume", request.controls.volume, "input.volume"));
    }
    if (request.controls?.speed !== undefined) {
      appliedCanonicalFields.push(applied("controls.speed", request.controls.speed, "input.rate"));
    }
    if (request.controls?.pitch !== undefined) {
      appliedCanonicalFields.push(applied("controls.pitch", request.controls.pitch, "input.pitch"));
    }

    if (requestedFormat !== undefined && !supportedFormats.includes(requestedFormat)) {
      ignoredFields.push({
        field:
          request.operation === "tts.stream" && request.stream?.chunkFormat === requestedFormat
            ? "stream.chunkFormat"
            : "output.format",
        reason: `CosyVoice model '${modelId}' does not support output format '${requestedFormat}'. The vendor default is used.`
      });
    }
    if (requestedSampleRate !== undefined && !supportedSampleRates.includes(requestedSampleRate)) {
      ignoredFields.push({
        field: "output.sampleRateHz",
        reason: `CosyVoice model '${modelId}' does not support sample rate '${requestedSampleRate}'. The vendor default is used.`
      });
    }
    if (request.output?.bitrate !== undefined) {
      ignoredFields.push({
        field: "output.bitrate",
        reason: "CosyVoice HTTP SpeechSynthesizer does not expose bitrate control."
      });
    }
    if (request.output?.channels !== undefined) {
      ignoredFields.push({
        field: "output.channels",
        reason: "CosyVoice HTTP SpeechSynthesizer does not expose channel control."
      });
    }
    if (request.controls?.emotion !== undefined) {
      ignoredFields.push({
        field: "controls.emotion",
        reason: "CosyVoice emotion/style control should be expressed through vendor.extensions.cosyvoice.params.instruction."
      });
    }
    if (request.controls?.style !== undefined) {
      ignoredFields.push({
        field: "controls.style",
        reason: "CosyVoice style control should be expressed through vendor.extensions.cosyvoice.params.instruction."
      });
    }

    const input: VendorPayload = {
      text: request.text,
      voice: requestedVoice,
      format: actualFormat,
      sample_rate: actualSampleRate,
      volume: request.controls?.volume ?? numberDefault(defaultControls.volume, 50),
      rate: request.controls?.speed ?? numberDefault(defaultControls.speed, 1),
      pitch: request.controls?.pitch ?? numberDefault(defaultControls.pitch, 1)
    };
    if (request.ssml !== undefined) {
      input.text = request.ssml;
      input.text_type = "SSML";
      input.enable_ssml = true;
      appliedCanonicalFields.push(applied("ssml", request.ssml, "input.text"));
    }

    const vendorRequest: VendorPayload = {
      method: "POST",
      endpoint: speechSynthesizerEndpoint(this.region, "__workspace_id__"),
      model: modelId,
      input,
      stream: request.operation === "tts.stream"
    };

    if (request.operation === "tts.stream") {
      vendorRequest.wsEndpoint = this.planStreamEndpoint();
    }

    applyVendorExtension({
      providerId: this.providerId,
      extension,
      directiveMode,
      vendorRequest: input,
      appliedVendorExtensions,
      ignoredFields,
      allowedKeys: ["instruction", "text_type", "enable_ssml"]
    });

    if (request.operation === "tts.stream") {
      vendorRequest.wsTask = {
        header: {
          action: "run-task",
          task_id: "__plan_id__",
          streaming: "duplex"
        },
        payload: {
          task_group: "audio",
          task: "tts",
          function: "SpeechSynthesizer",
          model: modelId,
          parameters: {
            text_type: input.text_type ?? "PlainText",
            voice: requestedVoice,
            format: actualFormat,
            sample_rate: actualSampleRate,
            volume: input.volume,
            rate: input.rate,
            pitch: input.pitch,
            enable_ssml: input.enable_ssml ?? false,
            ...(typeof input.instruction === "string" ? { instruction: input.instruction } : {})
          },
          input: {}
        }
      };
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
    if (request.operation === "tts.sync" && this.region !== DEFAULT_REGION) {
      mappingReport.warnings.push("CosyVoice non-realtime HTTP synthesis is documented for cn-beijing only.");
    }
    if (request.operation === "tts.stream" && this.streamEndpoint !== undefined && isRealtimeEndpoint(this.streamEndpoint)) {
      mappingReport.warnings.push(
        "DashScope /api-ws/v1/realtime uses a different realtime protocol. The adapter normalized this endpoint to /api-ws/v1/inference for CosyVoice task frames."
      );
    }

    const basePlan = {
      planId: createPlanId(),
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      createdAt: new Date().toISOString(),
      capabilitySnapshot,
      vendorRequest,
      mappingReport
    };
    if (request.operation === "tts.sync") {
      return {
        ...basePlan,
        operation: "tts.sync",
        canonicalRequest: request
      };
    }
    return {
      ...basePlan,
      operation: "tts.stream",
      canonicalRequest: request
    };
  }

  // synthesizeSync: 入参为 TTSSyncPlan；调用 CosyVoice HTTP TTS 并下载返回音频。
  async synthesizeSync(plan: TTSSyncPlan): Promise<TTSSyncProviderResult> {
    this.assertHttpConfig("CosyVoice synthesis");
    const vendorResponse = await this.postWorkspaceJson("/api/v1/services/audio/tts/SpeechSynthesizer", {
      model: plan.vendorRequest.model,
      input: plan.vendorRequest.input
    });
    const audioUrl = findAudioUrl(vendorResponse);
    if (audioUrl === undefined) {
      throw new TTSError("CosyVoice response did not include an audio URL.", "vendor_execution_failed", 502, {
        vendorResponse: toJsonValue(vendorResponse)
      });
    }

    const audioResponse = await this.fetchImpl(audioUrl);
    if (!audioResponse.ok) {
      throw new TTSError("Failed to download CosyVoice audio URL.", "vendor_execution_failed", 502, {
        status: audioResponse.status
      });
    }
    const bytes = new Uint8Array(await audioResponse.arrayBuffer());
    return {
      audio: {
        data: bytes,
        format: outputFormatFromVendor(plan.vendorRequest),
        sampleRateHz: sampleRateFromVendor(plan.vendorRequest)
      },
      vendorResponse: {
        ...vendorResponse,
        downloadedAudioUrl: audioUrl,
        downloadedAudioBytes: bytes.byteLength
      }
    };
  }

  // synthesizeStream: 入参为流式 plan；连接 CosyVoice 上游 WebSocket 并输出统一 stream lifecycle 事件。
  async *synthesizeStream(plan: TTSStreamPlan): AsyncIterable<TTSStreamEvent> {
    this.assertStreamConfig("CosyVoice stream synthesis");
    const endpoint = this.resolveStreamEndpoint();
    const taskId = taskIdFromPlanId(plan.planId);
    const runTask = streamRunTask(plan, taskId);
    const continueTask = streamContinueTask(plan, taskId);
    const finishTask = streamFinishTask(taskId);
    let socket: CosyVoiceWebSocketLike | undefined;
    let sequence = 0;
    let sentInput = false;
    let completed = false;

    yield {
      type: "session.started",
      sessionId: plan.planId,
      planId: plan.planId,
      sequence: sequence
    };
    sequence += 1;

    const events = new AsyncEventQueue<CosyVoiceUpstreamEvent>();
    socket = this.webSocketFactory(endpoint, {
      headers: {
        Authorization: `bearer ${this.apiKey ?? ""}`,
        "X-DashScope-DataInspection": "enable"
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
        upstreamTransport: "connected",
        runTask
      }
    };
    sequence += 1;

    try {
      for await (const event of events) {
        if (event.type === "open") {
          socket.send(JSON.stringify(runTask));
          yield {
            type: "metadata",
            sequence,
            payload: {
              upstreamEvent: "connection.open",
              sent: "run-task"
            }
          };
          sequence += 1;
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
              message: `CosyVoice upstream WebSocket closed before completion: ${event.code} ${event.reason}`.trim()
            };
          }
          return;
        }

        if (event.isBinary) {
          const data = rawDataToBytes(event.data);
          yield {
            type: "audio.chunk",
            sequence,
            data,
            format: outputFormatFromVendor(plan.vendorRequest)
          };
          sequence += 1;
          continue;
        }

        const upstreamPayload = parseJsonFrame(event.data);
        const upstreamHeader = objectAt(upstreamPayload, "header");
        const upstreamEvent = typeof upstreamHeader.event === "string" ? upstreamHeader.event : "unknown";
        yield {
          type: "metadata",
          sequence,
          payload: {
            upstreamEvent,
            upstreamPayload
          }
        };
        sequence += 1;

        if (upstreamEvent === "task-started" && !sentInput) {
          socket.send(JSON.stringify(continueTask));
          socket.send(JSON.stringify(finishTask));
          sentInput = true;
          yield {
            type: "metadata",
            sequence,
            payload: {
              upstreamEvent: "input.sent",
              sent: ["continue-task", "finish-task"]
            }
          };
          sequence += 1;
        }

        if (upstreamEvent === "task-failed") {
          const message =
            typeof upstreamHeader.error_message === "string"
              ? upstreamHeader.error_message
              : "CosyVoice upstream task failed.";
          yield {
            type: "error",
            sequence,
            message
          };
          socket.close(1011, "task failed");
          return;
        }

        if (upstreamEvent === "task-finished") {
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

  // createVoiceClone: 入参为音色复刻 plan；调用 CosyVoice voice-enrollment 并返回 voice registry 记录。
  async createVoiceClone(plan: VoiceClonePlan): Promise<VoiceCloneResult> {
    this.assertHttpConfig("CosyVoice voice clone");
    const vendorResponse = await this.postWorkspaceJson("/api/v1/services/audio/tts/customization", plan.vendorRequest);
    const providerVoiceId = findVoiceId(vendorResponse);
    if (providerVoiceId === undefined) {
      throw new TTSError("CosyVoice voice clone response did not include voice_id.", "vendor_execution_failed", 502, {
        vendorResponse: toJsonValue(vendorResponse)
      });
    }

    const referenceAudio = plan.canonicalRequest.referenceAudio[0];
    const voice = {
      voiceId: `${this.providerId}:${providerVoiceId}`,
      providerId: this.providerId,
      providerVoiceId,
      displayName: plan.canonicalRequest.displayName,
      source: "cloned" as const,
      modelId: String(objectAt(plan.vendorRequest, "input").target_model ?? COSYVOICE_DEFAULT_MODEL),
      createdWithModelId: String(objectAt(plan.vendorRequest, "input").target_model ?? COSYVOICE_DEFAULT_MODEL),
      preferredModelId: String(objectAt(plan.vendorRequest, "input").target_model ?? COSYVOICE_DEFAULT_MODEL),
      compatibility: cosyVoiceModelCompatibility(String(objectAt(plan.vendorRequest, "input").target_model ?? COSYVOICE_DEFAULT_MODEL)),
      ...(plan.canonicalRequest.language === undefined ? {} : { language: plan.canonicalRequest.language }),
      createdAt: new Date().toISOString(),
      sourceOperation: "voice.clone.create" as const,
      clone: {
        referenceAudioIds: [referenceAudio?.fileId ?? referenceAudio?.uri ?? ""].filter((value) => value.length > 0),
        createdAt: new Date().toISOString(),
        ...(plan.canonicalRequest.consent?.usageScope === undefined
          ? {}
          : { consentScope: plan.canonicalRequest.consent.usageScope })
      },
      vendorMetadata: {
        targetModel: objectAt(plan.vendorRequest, "input").target_model,
        region: this.region
      }
    };
    return {
      voice,
      vendorResponse
    };
  }

  // planVoiceClone: 入参为音色复刻请求；输出 CosyVoice voice-enrollment plan。
  private async planVoiceClone(
    request: Extract<TTSOperationRequest, { operation: "voice.clone.create" }>
  ): Promise<VoiceClonePlan> {
    const capabilitySnapshot = this.capabilities();
    const operationCapability = capabilitySnapshot.operations[request.operation];
    if (operationCapability?.supported !== true) {
      throw new TTSError("CosyVoice does not support voice clone creation.", "operation_not_supported", 400);
    }
    if (request.referenceAudio.length === 0) {
      throw new TTSError("CosyVoice voice clone requires one reference audio URL.", "invalid_request", 400);
    }

    const referenceAudio = request.referenceAudio[0];
    const audioUrl = referenceAudio?.uri ?? "";
    if (!isHttpUrl(audioUrl)) {
      throw new TTSError("CosyVoice voice clone requires referenceAudio[0].uri to be an HTTP URL.", "invalid_request", 400);
    }

    const modelId = request.model ?? defaultModelId(capabilitySnapshot.vendorModels, request.operation);
    const model = capabilitySnapshot.vendorModels.find((candidate) => candidate.modelId === modelId);
    if (model === undefined) {
      throw new TTSError(`CosyVoice model '${modelId}' was not found.`, "invalid_request", 400);
    }

    const directiveMode = request.vendor?.mode ?? "prefer_vendor";
    const extension = request.vendor?.extensions?.[this.providerId];
    if (directiveMode === "vendor_required" && extension === undefined) {
      throw new TTSError(
        "CosyVoice vendor extension is required by the request but was not provided.",
        "vendor_extension_required",
        400
      );
    }

    const appliedCanonicalFields: AppliedCanonicalField[] = [
      applied("displayName", request.displayName, "input.prefix"),
      applied("referenceAudio[0].uri", audioUrl, "input.url")
    ];
    if (request.model !== undefined) {
      appliedCanonicalFields.push(applied("model", modelId, "input.target_model"));
    }
    const appliedVendorExtensions: AppliedVendorExtension[] = [];
    const ignoredFields: IgnoredField[] = [];
    const input: VendorPayload = {
      action: "create_voice",
      target_model: modelId,
      prefix: normalizeClonePrefix(request.displayName),
      url: audioUrl
    };

    applyVendorExtension({
      providerId: this.providerId,
      extension,
      directiveMode,
      vendorRequest: input,
      appliedVendorExtensions,
      ignoredFields,
      allowedKeys: ["prefix"]
    });

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
      vendorRequest: {
        model: VOICE_ENROLLMENT_MODEL,
        input
      },
      mappingReport
    };
  }

  // postWorkspaceJson: 入参为 Workspace path 和 JSON body；输出 CosyVoice JSON 响应。
  private async postWorkspaceJson(pathname: string, body: VendorPayload): Promise<VendorPayload> {
    this.assertHttpConfig("CosyVoice request");
    const response = await this.fetchImpl(`${workspaceBaseUrl(this.region, this.workspaceId ?? "")}${pathname}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey ?? ""}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const vendorResponse = (await response.json()) as VendorPayload;
    if (!response.ok) {
      throw new TTSError("CosyVoice request failed.", "vendor_execution_failed", 502, {
        status: response.status,
        vendorResponse: toJsonValue(vendorResponse)
      });
    }
    return vendorResponse;
  }

  // assertHttpConfig: 入参为动作名；功能是执行前校验必需的 API Key 和 WorkspaceId。
  private assertHttpConfig(action: string): void {
    if (this.apiKey === undefined || this.apiKey.length === 0) {
      throw new TTSError(`${action} requires COSYVOICE_API_KEY or DASHSCOPE_API_KEY.`, "vendor_execution_failed", 400);
    }
    if (this.workspaceId === undefined || this.workspaceId.length === 0) {
      throw new TTSError(
        `${action} requires COSYVOICE_WORKSPACE_ID because HTTP synthesis and voice clone use the Model Studio Workspace endpoint. If you only need WebSocket synthesis without WorkspaceId, use tts.stream with wss://dashscope.aliyuncs.com/api-ws/v1/inference.`,
        "vendor_execution_failed",
        400
      );
    }
  }

  // assertStreamConfig: 入参为动作名；功能是校验 WebSocket stream 所需 API Key，允许不配置 WorkspaceId。
  private assertStreamConfig(action: string): void {
    if (this.apiKey === undefined || this.apiKey.length === 0) {
      throw new TTSError(`${action} requires COSYVOICE_API_KEY or DASHSCOPE_API_KEY.`, "vendor_execution_failed", 400);
    }
  }

  // resolveStreamEndpoint: 无入参；输出真实上游 WebSocket endpoint，优先使用显式配置。
  private resolveStreamEndpoint(): string {
    if (this.streamEndpoint !== undefined && this.streamEndpoint.length > 0) {
      return normalizeStreamEndpoint(this.streamEndpoint);
    }
    if (this.workspaceId !== undefined && this.workspaceId.length > 0) {
      return inferenceEndpoint(this.region, this.workspaceId);
    }
    return DEFAULT_GLOBAL_INFERENCE_ENDPOINT;
  }

  // planStreamEndpoint: 无入参；输出可归档的 WebSocket endpoint，不泄漏 WorkspaceId 占位之外的信息。
  private planStreamEndpoint(): string {
    if (this.streamEndpoint !== undefined && this.streamEndpoint.length > 0) {
      return normalizeStreamEndpoint(this.streamEndpoint);
    }
    if (this.workspaceId !== undefined && this.workspaceId.length > 0) {
      return inferenceEndpoint(this.region, "__workspace_id__");
    }
    return DEFAULT_GLOBAL_INFERENCE_ENDPOINT;
  }
}

function applied(field: string, value: JsonValue, vendorField: string): AppliedCanonicalField {
  return {
    field,
    value,
    vendorField
  };
}

function defaultModelId(models: TTSVendorModel[], operation: TTSOperation): string {
  return models.find((model) => model.defaultForOperations?.includes(operation))?.modelId ?? models[0]?.modelId ?? "";
}

function workspaceBaseUrl(region: string, workspaceId: string): string {
  return `https://${workspaceId}.${region}.${DEFAULT_WORKSPACE_BASE_DOMAIN}`;
}

function speechSynthesizerEndpoint(region: string, workspaceId: string): string {
  return `${workspaceBaseUrl(region, workspaceId)}/api/v1/services/audio/tts/SpeechSynthesizer`;
}

function inferenceEndpoint(region: string, workspaceId: string): string {
  return `wss://${workspaceId}.${region}.${DEFAULT_WORKSPACE_BASE_DOMAIN}/api-ws/v1/inference/`;
}

// normalizeStreamEndpoint: 入参为配置中的 WebSocket endpoint；功能是把 legacy realtime 路径归一到 CosyVoice task-frame 使用的 inference 路径。
function normalizeStreamEndpoint(endpoint: string): string {
  return isRealtimeEndpoint(endpoint) ? endpoint.replace("/api-ws/v1/realtime", "/api-ws/v1/inference") : endpoint;
}

// isRealtimeEndpoint: 入参为 WebSocket endpoint；功能是识别 DashScope 新 realtime 协议入口。
function isRealtimeEndpoint(endpoint: string): boolean {
  return endpoint.includes("/api-ws/v1/realtime");
}

function taskIdFromPlanId(planId: string): string {
  return planId.replaceAll(/[^A-Za-z0-9]/g, "");
}

function streamRunTask(plan: TTSStreamPlan, taskId: string): VendorPayload {
  const task = cloneVendorPayload(objectAt(plan.vendorRequest, "wsTask"));
  const header = objectAt(task, "header");
  header.task_id = taskId;
  return task;
}

function streamContinueTask(plan: TTSStreamPlan, taskId: string): VendorPayload {
  return {
    header: {
      action: "continue-task",
      task_id: taskId,
      streaming: "duplex"
    },
    payload: {
      input: {
        text: String(objectAt(plan.vendorRequest, "input").text ?? plan.canonicalRequest.text)
      }
    }
  };
}

function streamFinishTask(taskId: string): VendorPayload {
  return {
    header: {
      action: "finish-task",
      task_id: taskId,
      streaming: "duplex"
    },
    payload: {
      input: {}
    }
  };
}

function normalizeProviderVoiceId(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.startsWith(`${COSYVOICE_PROVIDER_ID}:`)
    ? trimmed.slice(`${COSYVOICE_PROVIDER_ID}:`.length)
    : trimmed;
}

function normalizeClonePrefix(value: string): string {
  const normalized = value.trim().replaceAll(/[^A-Za-z0-9_-]+/g, "_").replaceAll(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : "cosyvoice_clone";
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function numberDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// stringValue: 入参为未知值；输出非空字符串，供历史 voice metadata 兼容读取。
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

// cosyVoiceModelCompatibility: 入参为 target_model；输出 CosyVoice voice_id 的同模型强绑定事实。
function cosyVoiceModelCompatibility(modelId: string): VoiceCompatibility {
  return {
    scope: "model",
    enforced: true,
    modelIds: [modelId],
    preferredModelIds: [modelId],
    notes: ["CosyVoice voice_id 与创建时 target_model 绑定，不能跨模型复用。"]
  };
}

// assertCosyVoiceCompatibility: 入参为请求音色兼容事实和目标模型；功能是在厂商调用前阻止跨模型 voice_id。
function assertCosyVoiceCompatibility(compatibility: VoiceCompatibility | undefined, modelId: string): void {
  if (compatibility?.scope === "model" && !compatibility.modelIds.includes(modelId)) {
    throw new TTSError(
      `CosyVoice voice is only compatible with model(s): ${compatibility.modelIds.join(", ")}.`,
      "invalid_request",
      400
    );
  }
}

function outputFormatFromVendor(vendorRequest: VendorPayload): TTSOutputFormat {
  const input = objectAt(vendorRequest, "input");
  return input.format === "wav" ? "wav" : "mp3";
}

function sampleRateFromVendor(vendorRequest: VendorPayload): number {
  const input = objectAt(vendorRequest, "input");
  return typeof input.sample_rate === "number" && Number.isFinite(input.sample_rate) ? input.sample_rate : 24000;
}

function findAudioUrl(payload: VendorPayload): string | undefined {
  const candidates = [
    objectAt(payload, "output").audio,
    objectAt(payload, "output").url,
    objectAt(payload, "data").audio,
    objectAt(payload, "data").url,
    objectAt(objectAt(payload, "output"), "audio").url,
    objectAt(objectAt(payload, "data"), "audio").url
  ];
  return candidates.find((value): value is string => typeof value === "string" && isHttpUrl(value));
}

function findVoiceId(payload: VendorPayload): string | undefined {
  const candidates = [
    objectAt(payload, "output").voice_id,
    objectAt(payload, "data").voice_id,
    objectAt(payload, "voice").voice_id,
    payload.voice_id
  ];
  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.length > 0);
  return typeof value === "string" ? value : undefined;
}

function objectAt(value: unknown, key: string): VendorPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const child = (value as VendorPayload)[key];
  return child !== null && typeof child === "object" && !Array.isArray(child) ? (child as VendorPayload) : {};
}

function cloneVendorPayload(value: VendorPayload): VendorPayload {
  return JSON.parse(JSON.stringify(value)) as VendorPayload;
}

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

function applyVendorExtension(input: {
  providerId: string;
  extension: { schemaVersion: string; params: VendorPayload } | undefined;
  directiveMode: string;
  vendorRequest: VendorPayload;
  appliedVendorExtensions: AppliedVendorExtension[];
  ignoredFields: IgnoredField[];
  allowedKeys: string[];
}): void {
  if (input.extension === undefined) {
    return;
  }
  if (input.directiveMode === "canonical_only") {
    input.ignoredFields.push({
      field: `vendor.extensions.${input.providerId}`,
      reason: "Request mode canonical_only forbids vendor extension application."
    });
    return;
  }
  for (const [key, value] of Object.entries(input.extension.params)) {
    if (!input.allowedKeys.includes(key)) {
      input.ignoredFields.push({
        field: `vendor.extensions.${input.providerId}.${key}`,
        reason: "CosyVoice adapter does not support this vendor extension key."
      });
      continue;
    }
    input.vendorRequest[key] = value;
    input.appliedVendorExtensions.push({
      providerId: input.providerId,
      schemaVersion: input.extension.schemaVersion,
      path: key,
      value: toJsonValue(value)
    });
  }
}

type CosyVoiceUpstreamEvent =
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

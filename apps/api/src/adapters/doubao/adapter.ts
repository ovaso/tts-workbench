import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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
  type VendorDirectiveMode,
  type VendorExtensionInput,
  type VendorExtensionSchema,
  type VendorPayload,
  type VoiceCompatibility,
  type VoiceClonePlan,
  type VoiceCloneResult,
  type VoiceRecord
} from "@tts-platform/core";
import { createPlanId } from "../../utils/ids";
import {
  DOUBAO_ADAPTER_VERSION,
  DOUBAO_DEFAULT_CLONE_RESOURCE_ID,
  DOUBAO_DEFAULT_RESOURCE_ID,
  DOUBAO_DEFAULT_TTS_RESOURCE_ID,
  DOUBAO_PROVIDER_ID,
  doubaoCapabilities
} from "./capabilities";
import { doubaoExtensionSchema } from "./extension-schema";

const DEFAULT_BASE_URL = "https://openspeech.bytedance.com";
const DEFAULT_NAMESPACE = "BidirectionalTTS";
const DEFAULT_UID = "tts_workbench";
const DEFAULT_TTS_MODEL = "seed-tts-2.0-standard";
const SUCCESS_CODES = new Set([0, 20000000]);
const DOUBAO_CLONE_RESOURCE_IDS = ["seed-icl-2.0", "seed-icl-1.0", "seed-icl-1.0-concurr"] as const;
const DOUBAO_SYNTHESIS_RESOURCE_IDS = [
  "seed-tts-2.0",
  "seed-tts-1.0",
  "seed-tts-1.0-concurr",
  ...DOUBAO_CLONE_RESOURCE_IDS
] as const;

export interface DoubaoAdapterOptions {
  apiKey?: string | undefined;
  appId?: string | undefined;
  accessToken?: string | undefined;
  baseUrl?: string;
  fetch?: typeof fetch;
}

// DoubaoTTSAdapter: 厂商 Adapter 实现；负责豆包 V3 capability、plan-first 映射、SSE 合成和声音复刻。
export class DoubaoTTSAdapter implements TTSAdapter {
  private readonly providerDefinition;
  private readonly apiKey: string | undefined;
  private readonly appId: string | undefined;
  private readonly accessToken: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  readonly providerId;
  readonly adapterVersion;

  // constructor: 入参为 DoubaoAdapterOptions；功能是固化厂商定义、鉴权配置和 fetch 依赖。
  constructor(options: DoubaoAdapterOptions = {}) {
    this.providerDefinition = doubaoCapabilities(DOUBAO_ADAPTER_VERSION);
    this.providerId = this.providerDefinition.providerId;
    this.adapterVersion = this.providerDefinition.adapterVersion;
    this.apiKey = options.apiKey;
    this.appId = options.appId;
    this.accessToken = options.accessToken;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetch ?? fetch;
  }

  // capabilities: 无入参；返回豆包当前 adapter 实例固化的厂商能力定义。
  capabilities() {
    return this.providerDefinition;
  }

  // extensionSchema: 入参为 operation；返回该 operation 对应的豆包 vendor extension schema。
  extensionSchema(operation: TTSOperation): VendorExtensionSchema {
    return doubaoExtensionSchema(operation);
  }

  // voiceCompatibility: 入参为本地 voice 记录；输出豆包 speaker 与 X-Api-Resource-Id 的强匹配关系。
  voiceCompatibility(voice: VoiceRecord): VoiceCompatibility | undefined {
    if (voice.compatibility !== undefined) {
      return voice.compatibility;
    }
    const resourceId = doubaoCloneResourceIdFromVoice(voice);
    if (resourceId === undefined) {
      return voice.modelId === undefined
        ? undefined
        : {
            scope: "provider",
            enforced: false,
            preferredModelIds: [voice.modelId],
            notes: ["豆包非复刻音色暂按厂商级音色处理，modelId 只作为推荐模型。"]
          };
    }
    return doubaoVoiceResourceCompatibility(resourceId);
  }

  // plan: 入参为平台 operation request；输出豆包 plan，包含 vendor request 和 mapping report。
  async plan(request: TTSOperationRequest): Promise<TTSSyncPlan | TTSStreamPlan | VoiceClonePlan> {
    if (request.operation === "voice.clone.create") {
      return this.planVoiceClone(request);
    }
    if (request.operation !== "tts.sync" && request.operation !== "tts.stream") {
      throw new TTSError(`Doubao adapter does not support '${request.operation}'.`, "operation_not_supported", 400);
    }

    const capabilitySnapshot = this.capabilities();
    const operationCapability = capabilitySnapshot.operations[request.operation];
    if (operationCapability?.supported !== true) {
      throw new TTSError("Doubao does not support this operation.", "operation_not_supported", 400);
    }

    const requestedModelId = request.model ?? defaultModelId(capabilitySnapshot.vendorModels, request.operation);
    const model = capabilitySnapshot.vendorModels.find((candidate) => candidate.modelId === requestedModelId);
    if (model === undefined) {
      throw new TTSError(`Doubao model '${requestedModelId}' was not found.`, "invalid_request", 400);
    }
    if (!model.canonicalCapabilities.supportedOperations.includes(request.operation)) {
      throw new TTSError(`Doubao model '${requestedModelId}' does not support '${request.operation}'.`, "invalid_request", 400);
    }
    const voiceResourceId = doubaoResourceIdFromCompatibility(request.voice.compatibility);
    const resourceId = voiceResourceId ?? requestedModelId;
    if (!isDoubaoSynthesisResourceId(resourceId)) {
      throw new TTSError(`Doubao resource id '${resourceId}' is not declared as a synthesis resource.`, "invalid_request", 400);
    }

    const directiveMode = request.vendor?.mode ?? "prefer_vendor";
    const extension = request.vendor?.extensions?.[this.providerId];
    if (directiveMode === "vendor_required" && extension === undefined) {
      throw new TTSError(
        "Doubao vendor extension is required by the request but was not provided.",
        "vendor_extension_required",
        400
      );
    }

    const appliedCanonicalFields: AppliedCanonicalField[] = [];
    const appliedVendorExtensions: AppliedVendorExtension[] = [];
    const ignoredFields: IgnoredField[] = [];
    const defaultOutput = model.defaultConfiguration?.output ?? {};
    const supportedFormats = model.canonicalCapabilities.outputFormats ?? [];
    const supportedSampleRates = model.canonicalCapabilities.sampleRatesHz ?? [];
    const requestedFormat =
      request.operation === "tts.stream" ? request.stream?.chunkFormat ?? request.output?.format : request.output?.format;
    const requestedSampleRate = request.output?.sampleRateHz;
    const requestedVoice = normalizeProviderVoiceId(request.voice.providerVoiceId ?? request.voice.voiceId);
    if (requestedVoice === undefined) {
      throw new TTSError("Doubao requires voice.voiceId/providerVoiceId as req_params.speaker.", "invalid_request", 400);
    }

    const actualFormat =
      requestedFormat !== undefined && supportedFormats.includes(requestedFormat)
        ? requestedFormat
        : defaultOutput.format ?? "mp3";
    const actualSampleRate =
      requestedSampleRate !== undefined && supportedSampleRates.includes(requestedSampleRate)
        ? requestedSampleRate
        : defaultOutput.sampleRateHz ?? 24000;

    appliedCanonicalFields.push(applied("text", request.text, "req_params.text"));
    appliedCanonicalFields.push(applied("voice", requestedVoice, "req_params.speaker"));
    if (voiceResourceId !== undefined) {
      appliedCanonicalFields.push(applied("voice.compatibility.resourceIds[0]", voiceResourceId, "headers.X-Api-Resource-Id"));
    } else if (request.model !== undefined) {
      appliedCanonicalFields.push(applied("model", requestedModelId, "headers.X-Api-Resource-Id"));
    }
    if (requestedFormat !== undefined && supportedFormats.includes(requestedFormat)) {
      appliedCanonicalFields.push(applied("output.format", requestedFormat, "req_params.audio_params.format"));
    }
    if (requestedSampleRate !== undefined && supportedSampleRates.includes(requestedSampleRate)) {
      appliedCanonicalFields.push(
        applied("output.sampleRateHz", requestedSampleRate, "req_params.audio_params.sample_rate")
      );
    }
    if (request.controls?.speed !== undefined) {
      appliedCanonicalFields.push(applied("controls.speed", request.controls.speed, "req_params.audio_params.speech_rate"));
    }
    if (request.controls?.volume !== undefined) {
      appliedCanonicalFields.push(
        applied("controls.volume", request.controls.volume, "req_params.audio_params.loudness_rate")
      );
    }
    if (request.controls?.emotion !== undefined) {
      appliedCanonicalFields.push(applied("controls.emotion", request.controls.emotion, "req_params.audio_params.emotion"));
    }
    if (request.ssml !== undefined) {
      appliedCanonicalFields.push(applied("ssml", request.ssml, "req_params.ssml"));
    }

    if (requestedFormat !== undefined && !supportedFormats.includes(requestedFormat)) {
      ignoredFields.push({
        field:
          request.operation === "tts.stream" && request.stream?.chunkFormat === requestedFormat
            ? "stream.chunkFormat"
            : "output.format",
        reason: `Doubao resource '${resourceId}' does not support output format '${requestedFormat}'. The vendor default is used.`
      });
    }
    if (requestedSampleRate !== undefined && !supportedSampleRates.includes(requestedSampleRate)) {
      ignoredFields.push({
        field: "output.sampleRateHz",
        reason: `Doubao resource '${resourceId}' does not support sample rate '${requestedSampleRate}'. The vendor default is used.`
      });
    }
    if (request.output?.channels !== undefined) {
      ignoredFields.push({
        field: "output.channels",
        reason: "Doubao TTS V3 audio_params does not expose channel control."
      });
    }
    if (request.output?.bitrate !== undefined && actualFormat !== "mp3") {
      ignoredFields.push({
        field: "output.bitrate",
        reason: "Doubao bit_rate is only meaningful for MP3 output."
      });
    }
    if (request.controls?.pitch !== undefined) {
      ignoredFields.push({
        field: "controls.pitch",
        reason: "Doubao TTS V3 audio_params does not expose pitch control."
      });
    }
    if (request.controls?.style !== undefined) {
      ignoredFields.push({
        field: "controls.style",
        reason: "Doubao style-like controls should be expressed through vendor.extensions.doubao.params.additions."
      });
    }

    const audioParams: VendorPayload = {
      format: toDoubaoAudioFormat(actualFormat),
      sample_rate: actualSampleRate
    };
    if (request.output?.bitrate !== undefined && actualFormat === "mp3") {
      audioParams.bit_rate = request.output.bitrate;
      appliedCanonicalFields.push(applied("output.bitrate", request.output.bitrate, "req_params.audio_params.bit_rate"));
    }
    if (request.controls?.speed !== undefined) {
      audioParams.speech_rate = request.controls.speed;
    }
    if (request.controls?.volume !== undefined) {
      audioParams.loudness_rate = request.controls.volume;
    }
    if (request.controls?.emotion !== undefined) {
      audioParams.emotion = request.controls.emotion;
    }

    const reqParams: VendorPayload = {
      ...(request.ssml === undefined ? { text: request.text } : { ssml: request.ssml }),
      speaker: requestedVoice,
      model: DEFAULT_TTS_MODEL,
      audio_params: audioParams
    };
    const vendorRequest: VendorPayload = {
      method: "POST",
      endpoint: "/api/v3/tts/unidirectional/sse",
      resourceId,
      headers: {
        "X-Api-Resource-Id": resourceId,
        "X-Api-Request-Id": "__plan_id__"
      },
      body: {
        user: {
          uid: DEFAULT_UID
        },
        namespace: DEFAULT_NAMESPACE,
        req_params: reqParams
      },
      stream: request.operation === "tts.stream"
    };

    applyTtsVendorExtension({
      providerId: this.providerId,
      extension,
      directiveMode,
      vendorRequest,
      reqParams,
      audioParams,
      appliedVendorExtensions,
      ignoredFields
    });
    if (voiceResourceId !== undefined && vendorRequest.resourceId !== voiceResourceId) {
      throw new TTSError(
        `Doubao voice '${requestedVoice}' requires X-Api-Resource-Id '${voiceResourceId}', but request resolved '${String(vendorRequest.resourceId ?? "")}'.`,
        "invalid_request",
        400
      );
    }

    const mappingReport: MappingReport = {
      providerId: this.providerId,
      operation: request.operation,
      directiveMode,
      appliedCanonicalFields,
      appliedVendorExtensions,
      ignoredFields,
      approximations: actualFormat === "opus" ? [{
        field: "output.format",
        requestedValue: "opus",
        actualValue: "ogg_opus",
        reason: "Doubao V3 uses vendor format ogg_opus for Opus audio."
      }] : [],
      warnings: request.operation === "tts.sync"
        ? ["Doubao sync synthesis is implemented by consuming the SSE endpoint and concatenating audio chunks."]
        : []
    };

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

  // synthesizeSync: 入参为 TTSSyncPlan；调用豆包 SSE 接口并拼接音频片段为同步合成结果。
  async synthesizeSync(plan: TTSSyncPlan): Promise<TTSSyncProviderResult> {
    const events: VendorPayload[] = [];
    const audioChunks: Uint8Array[] = [];
    for await (const event of this.consumeDoubaoSse(plan)) {
      events.push(event.raw);
      if (event.audio !== undefined) {
        audioChunks.push(event.audio);
      }
    }
    if (audioChunks.length === 0) {
      throw new TTSError("Doubao SSE response did not include audio data.", "vendor_execution_failed", 502, {
        vendorEvents: toJsonValue(events)
      });
    }
    return {
      audio: {
        data: concatBytes(audioChunks),
        format: outputFormatFromVendor(plan.vendorRequest),
        sampleRateHz: sampleRateFromVendor(plan.vendorRequest)
      },
      vendorResponse: {
        status: "succeeded",
        events
      }
    };
  }

  // synthesizeStream: 入参为流式 plan；调用豆包 SSE 接口并逐片输出统一 stream lifecycle 事件。
  async *synthesizeStream(plan: TTSStreamPlan): AsyncIterable<TTSStreamEvent> {
    let sequence = 0;
    yield {
      type: "session.started",
      sessionId: plan.planId,
      planId: plan.planId,
      sequence
    };
    sequence += 1;
    yield {
      type: "metadata",
      sequence,
      payload: {
        protocol: "sse",
        endpoint: endpointUrl(this.baseUrl, String(plan.vendorRequest.endpoint ?? "")),
        resourceId: plan.vendorRequest.resourceId
      }
    };
    sequence += 1;

    for await (const event of this.consumeDoubaoSse(plan)) {
      if (event.audio !== undefined) {
        yield {
          type: "audio.chunk",
          sequence,
          data: event.audio,
          format: outputFormatFromVendor(plan.vendorRequest)
        };
        sequence += 1;
        continue;
      }
      yield {
        type: "metadata",
        sequence,
        payload: event.raw
      };
      sequence += 1;
    }

    yield {
      type: "session.completed",
      sequence
    };
  }

  // createVoiceClone: 入参为音色复刻 plan；调用豆包 V3 voice_clone 并返回 voice registry 记录。
  async createVoiceClone(plan: VoiceClonePlan): Promise<VoiceCloneResult> {
    const vendorResponse = await this.postJson("/api/v3/tts/voice_clone", plan.vendorRequest, "clone");
    const providerVoiceId = findProviderVoiceId(vendorResponse, plan.vendorRequest);
    if (providerVoiceId === undefined) {
      throw new TTSError("Doubao voice clone response did not include speaker_id.", "vendor_execution_failed", 502, {
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
      createdWithModelId: plan.canonicalRequest.model ?? DOUBAO_DEFAULT_CLONE_RESOURCE_ID,
      preferredModelId: DOUBAO_DEFAULT_TTS_RESOURCE_ID,
      compatibility: doubaoVoiceResourceCompatibility(plan.canonicalRequest.model ?? DOUBAO_DEFAULT_CLONE_RESOURCE_ID),
      ...(plan.canonicalRequest.language === undefined ? {} : { language: plan.canonicalRequest.language }),
      createdAt: new Date().toISOString(),
      sourceOperation: "voice.clone.create" as const,
      clone: {
        referenceAudioIds: [referenceAudio?.fileId ?? referenceAudio?.path ?? referenceAudio?.uri ?? ""].filter(
          (value) => value.length > 0
        ),
        createdAt: new Date().toISOString(),
        ...(plan.canonicalRequest.consent?.usageScope === undefined
          ? {}
          : { consentScope: plan.canonicalRequest.consent.usageScope })
      },
      vendorMetadata: {
        cloneModelId: plan.canonicalRequest.model ?? DOUBAO_DEFAULT_CLONE_RESOURCE_ID,
        status: objectAt(vendorResponse, "status"),
        speakerStatus: objectAt(vendorResponse, "speaker_status")
      }
    };
    return {
      voice,
      vendorResponse
    };
  }

  // planVoiceClone: 入参为音色复刻请求；输出豆包 voice_clone V3 plan。
  private async planVoiceClone(
    request: Extract<TTSOperationRequest, { operation: "voice.clone.create" }>
  ): Promise<VoiceClonePlan> {
    const capabilitySnapshot = this.capabilities();
    const operationCapability = capabilitySnapshot.operations[request.operation];
    if (operationCapability?.supported !== true) {
      throw new TTSError("Doubao does not support voice clone creation.", "operation_not_supported", 400);
    }
    if (request.referenceAudio.length === 0) {
      throw new TTSError("Doubao voice clone requires one local reference audio.", "invalid_request", 400);
    }

    const modelId = request.model ?? defaultModelId(capabilitySnapshot.vendorModels, request.operation);
    const model = capabilitySnapshot.vendorModels.find((candidate) => candidate.modelId === modelId);
    if (model === undefined) {
      throw new TTSError(`Doubao resource id '${modelId}' was not found.`, "invalid_request", 400);
    }
    if (!model.canonicalCapabilities.supportedOperations.includes("voice.clone.create")) {
      throw new TTSError(`Doubao resource id '${modelId}' does not support voice.clone.create.`, "invalid_request", 400);
    }

    const directiveMode = request.vendor?.mode ?? "prefer_vendor";
    const extension = request.vendor?.extensions?.[this.providerId];
    if (directiveMode === "vendor_required" && extension === undefined) {
      throw new TTSError(
        "Doubao vendor extension is required by the request but was not provided.",
        "vendor_extension_required",
        400
      );
    }

    const referenceAudio = request.referenceAudio[0];
    const audioPath = localAudioPath(referenceAudio);
    if (audioPath === undefined) {
      throw new TTSError(
        "Doubao voice clone requires referenceAudio[0].path or a file:// referenceAudio[0].uri.",
        "invalid_request",
        400
      );
    }
    const audio = await readFile(audioPath);
    const audioFormat = referenceAudio?.format ?? inferAudioFormat(audioPath);
    if (audioFormat === undefined) {
      throw new TTSError("Doubao voice clone requires referenceAudio[0].format or a known file extension.", "invalid_request", 400);
    }

    const appliedCanonicalFields: AppliedCanonicalField[] = [
      applied("displayName", request.displayName, "custom_speaker_id"),
      applied("referenceAudio[0]", audioPath, "audio.data")
    ];
    if (request.model !== undefined) {
      appliedCanonicalFields.push(applied("model", modelId, "modelId"));
    }
    if (request.language !== undefined) {
      appliedCanonicalFields.push(applied("language", request.language, "language"));
    }

    const appliedVendorExtensions: AppliedVendorExtension[] = [];
    const ignoredFields: IgnoredField[] = [];
    const speakerId = normalizeCloneSpeakerId(request.displayName);
    const vendorRequest: VendorPayload = {
      speaker_id: "custom_speaker_id",
      custom_speaker_id: speakerId,
      audio: {
        data: audio.toString("base64"),
        format: audioFormat
      },
      language: languageCode(request.language),
      extra_params: {
        voice_clone_denoise_model_id: ""
      }
    };

    applyCloneVendorExtension({
      providerId: this.providerId,
      extension,
      directiveMode,
      vendorRequest,
      appliedVendorExtensions,
      ignoredFields
    });

    const mappingReport: MappingReport = {
      providerId: this.providerId,
      operation: request.operation,
      directiveMode,
      appliedCanonicalFields,
      appliedVendorExtensions,
      ignoredFields,
      approximations: [],
      warnings: ["Doubao voice clone archive stores base64 audio in vendor-request.json; avoid committing real private voice samples."]
    };

    return {
      planId: createPlanId(),
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      operation: "voice.clone.create",
      createdAt: new Date().toISOString(),
      capabilitySnapshot,
      canonicalRequest: request,
      vendorRequest,
      mappingReport
    };
  }

  // consumeDoubaoSse: 入参为 TTS plan；输出解析后的豆包 SSE 事件和可选音频片段。
  private async *consumeDoubaoSse(plan: TTSSyncPlan | TTSStreamPlan): AsyncIterable<DoubaoParsedSseEvent> {
    const response = await this.postSse(plan);
    const reader = response.body?.getReader();
    if (reader === undefined) {
      const text = await response.text();
      yield* parseSseText(text);
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parsed = splitCompleteSseBlocks(buffer);
      buffer = parsed.rest;
      for (const block of parsed.blocks) {
        yield parseSseBlock(block);
      }
    }
    buffer += decoder.decode();
    for (const block of splitCompleteSseBlocks(`${buffer}\n\n`).blocks) {
      yield parseSseBlock(block);
    }
  }

  // postSse: 入参为 TTS plan；功能是向豆包 SSE endpoint 发送已规划的 vendor request。
  private async postSse(plan: TTSSyncPlan | TTSStreamPlan): Promise<Response> {
    const endpoint = String(plan.vendorRequest.endpoint ?? "");
    const response = await this.fetchImpl(endpointUrl(this.baseUrl, endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders("tts"),
        "X-Api-Resource-Id": String(plan.vendorRequest.resourceId ?? DOUBAO_DEFAULT_RESOURCE_ID),
        "X-Api-Request-Id": plan.planId,
        ...(requireUsageTokens(plan.vendorRequest) ? { "X-Control-Require-Usage-Tokens-Return": "text_words" } : {})
      },
      body: JSON.stringify(plan.vendorRequest.body)
    });
    await assertOkResponse(response, "Doubao SSE synthesis");
    return response;
  }

  // postJson: 入参为 path、请求体和鉴权场景；功能是调用豆包 JSON HTTP 接口并返回响应体。
  private async postJson(pathname: string, body: VendorPayload, authKind: "clone"): Promise<VendorPayload> {
    const response = await this.fetchImpl(endpointUrl(this.baseUrl, pathname), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders(authKind),
        "X-Api-Request-Id": createPlanId()
      },
      body: JSON.stringify(body)
    });
    await assertOkResponse(response, "Doubao voice clone");
    const payload = await response.json() as unknown;
    if (!isVendorPayload(payload)) {
      throw new TTSError("Doubao voice clone response was not a JSON object.", "vendor_execution_failed", 502);
    }
    const code = numberValue(payload.code);
    if (code !== undefined && !SUCCESS_CODES.has(code)) {
      throw new TTSError("Doubao voice clone returned an error code.", "vendor_execution_failed", 502, {
        vendorResponse: toJsonValue(payload)
      });
    }
    return payload;
  }

  // authHeaders: 入参为鉴权场景；输出新版或旧版控制台需要的豆包 header。
  private authHeaders(kind: "tts" | "clone"): Record<string, string> {
    if (this.apiKey !== undefined && this.apiKey.trim().length > 0) {
      return {
        "X-Api-Key": this.apiKey
      };
    }
    if (
      this.appId !== undefined &&
      this.appId.trim().length > 0 &&
      this.accessToken !== undefined &&
      this.accessToken.trim().length > 0
    ) {
      return {
        [kind === "tts" ? "X-Api-App-Id" : "X-Api-App-Key"]: this.appId,
        "X-Api-Access-Key": this.accessToken
      };
    }
    throw new TTSError("Doubao API key or app/access key is required.", "vendor_execution_failed", 500);
  }
}

interface DoubaoParsedSseEvent {
  raw: VendorPayload;
  audio?: Uint8Array;
}

interface ApplyTtsVendorExtensionInput {
  providerId: string;
  extension: VendorExtensionInput | undefined;
  directiveMode: VendorDirectiveMode;
  vendorRequest: VendorPayload;
  reqParams: VendorPayload;
  audioParams: VendorPayload;
  appliedVendorExtensions: AppliedVendorExtension[];
  ignoredFields: IgnoredField[];
}

interface ApplyCloneVendorExtensionInput {
  providerId: string;
  extension: VendorExtensionInput | undefined;
  directiveMode: VendorDirectiveMode;
  vendorRequest: VendorPayload;
  appliedVendorExtensions: AppliedVendorExtension[];
  ignoredFields: IgnoredField[];
}

// applyTtsVendorExtension: 入参为扩展和 vendor request；功能是安全应用豆包 TTS 专有字段。
function applyTtsVendorExtension(input: ApplyTtsVendorExtensionInput): void {
  const extension = input.extension;
  if (extension === undefined) {
    return;
  }
  if (input.directiveMode === "canonical_only") {
    input.ignoredFields.push({
      field: `vendor.extensions.${input.providerId}`,
      reason: "Request mode canonical_only forbids vendor extension application."
    });
    return;
  }

  const body = objectAt(input.vendorRequest, "body");
  for (const [key, value] of Object.entries(extension.params)) {
    if (key === "uid" && typeof value === "string" && value.trim().length > 0) {
      objectAt(body, "user").uid = value;
      input.appliedVendorExtensions.push(vendorApplied(key, value, "body.user.uid", extension.schemaVersion));
      continue;
    }
    if (key === "namespace" && typeof value === "string" && value.trim().length > 0) {
      body.namespace = value;
      input.appliedVendorExtensions.push(vendorApplied(key, value, "body.namespace", extension.schemaVersion));
      continue;
    }
    if (key === "resourceId" && typeof value === "string" && value.trim().length > 0) {
      const resourceId = value.trim();
      if (!isDoubaoSynthesisResourceId(resourceId)) {
        input.ignoredFields.push({
          field: `vendor.extensions.${input.providerId}.${key}`,
          reason: `Doubao resource '${resourceId}' is not declared as a synthesis resource.`
        });
        continue;
      }
      input.vendorRequest.resourceId = resourceId;
      objectAt(input.vendorRequest, "headers")["X-Api-Resource-Id"] = resourceId;
      input.appliedVendorExtensions.push(vendorApplied(key, resourceId, "headers.X-Api-Resource-Id", extension.schemaVersion));
      continue;
    }
    if (key === "ttsModel" && typeof value === "string" && value.trim().length > 0) {
      input.reqParams.model = value.trim();
      input.appliedVendorExtensions.push(vendorApplied(key, value.trim(), "body.req_params.model", extension.schemaVersion));
      continue;
    }
    if (key === "additions" && isVendorPayload(value)) {
      input.reqParams.additions = value;
      input.appliedVendorExtensions.push(vendorApplied(key, value, "body.req_params.additions", extension.schemaVersion));
      continue;
    }
    if (key === "emotionScale" && typeof value === "number") {
      input.audioParams.emotion_scale = value;
      input.appliedVendorExtensions.push(vendorApplied(key, value, "body.req_params.audio_params.emotion_scale", extension.schemaVersion));
      continue;
    }
    if (key === "enableTimestamp" && typeof value === "boolean") {
      input.audioParams.enable_timestamp = value;
      input.appliedVendorExtensions.push(vendorApplied(key, value, "body.req_params.audio_params.enable_timestamp", extension.schemaVersion));
      continue;
    }
    if (key === "enableSubtitle" && typeof value === "boolean") {
      input.audioParams.enable_subtitle = value;
      input.appliedVendorExtensions.push(vendorApplied(key, value, "body.req_params.audio_params.enable_subtitle", extension.schemaVersion));
      continue;
    }
    if (key === "mixSpeaker" && isVendorPayload(value)) {
      input.reqParams.mix_speaker = value;
      input.appliedVendorExtensions.push(vendorApplied(key, value, "body.req_params.mix_speaker", extension.schemaVersion));
      continue;
    }
    if (key === "requireUsageTokens" && typeof value === "boolean") {
      input.vendorRequest.requireUsageTokens = value;
      input.appliedVendorExtensions.push(vendorApplied(key, value, "headers.X-Control-Require-Usage-Tokens-Return", extension.schemaVersion));
      continue;
    }
    input.ignoredFields.push({
      field: `vendor.extensions.${input.providerId}.${key}`,
      reason: "Doubao adapter does not support this vendor extension key or value type."
    });
  }
}

// applyCloneVendorExtension: 入参为扩展和 clone request；功能是安全应用豆包声音复刻专有字段。
function applyCloneVendorExtension(input: ApplyCloneVendorExtensionInput): void {
  const extension = input.extension;
  if (extension === undefined) {
    return;
  }
  if (input.directiveMode === "canonical_only") {
    input.ignoredFields.push({
      field: `vendor.extensions.${input.providerId}`,
      reason: "Request mode canonical_only forbids vendor extension application."
    });
    return;
  }

  for (const [key, value] of Object.entries(extension.params)) {
    if (key === "speakerId" && typeof value === "string" && value.trim().length > 0) {
      input.vendorRequest.speaker_id = value.trim();
      input.appliedVendorExtensions.push(vendorApplied(key, value.trim(), "speaker_id", extension.schemaVersion));
      continue;
    }
    if (key === "customSpeakerId" && typeof value === "string" && value.trim().length > 0) {
      input.vendorRequest.custom_speaker_id = value.trim();
      input.appliedVendorExtensions.push(vendorApplied(key, value.trim(), "custom_speaker_id", extension.schemaVersion));
      continue;
    }
    if (key === "prepaid" && value === true) {
      delete input.vendorRequest.custom_speaker_id;
      input.appliedVendorExtensions.push(vendorApplied(key, value, "custom_speaker_id", extension.schemaVersion));
      continue;
    }
    if (key === "languageCode" && typeof value === "number") {
      input.vendorRequest.language = value;
      input.appliedVendorExtensions.push(vendorApplied(key, value, "language", extension.schemaVersion));
      continue;
    }
    if (key === "extraParams" && isVendorPayload(value)) {
      input.vendorRequest.extra_params = value;
      input.appliedVendorExtensions.push(vendorApplied(key, value, "extra_params", extension.schemaVersion));
      continue;
    }
    input.ignoredFields.push({
      field: `vendor.extensions.${input.providerId}.${key}`,
      reason: "Doubao adapter does not support this voice clone extension key or value type."
    });
  }
}

// parseSseText: 入参为完整 SSE 文本；输出解析后的豆包事件序列。
function* parseSseText(text: string): Iterable<DoubaoParsedSseEvent> {
  for (const block of splitCompleteSseBlocks(`${text}\n\n`).blocks) {
    yield parseSseBlock(block);
  }
}

// parseSseBlock: 入参为一个 SSE block；输出统一的原始事件和可选音频字节。
function parseSseBlock(block: string): DoubaoParsedSseEvent {
  const eventName = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
  const dataLines = block
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  const dataText = dataLines.join("\n");
  const payload = dataText.length === 0 ? {} : JSON.parse(dataText) as unknown;
  if (!isVendorPayload(payload)) {
    throw new TTSError("Doubao SSE data was not a JSON object.", "vendor_execution_failed", 502, {
      eventName: eventName ?? "message",
      dataText
    });
  }
  const code = numberValue(payload.code);
  if (code !== undefined && !SUCCESS_CODES.has(code)) {
    const message = typeof payload.message === "string" && payload.message.length > 0 ? payload.message : "unknown";
    throw new TTSError(`Doubao SSE event returned error code ${code}: ${message}`, "vendor_execution_failed", 502, {
      eventName: eventName ?? "message",
      payload: toJsonValue(payload)
    });
  }
  const audio = typeof payload.data === "string" && payload.data.length > 0
    ? new Uint8Array(Buffer.from(payload.data, "base64"))
    : undefined;
  return {
    raw: {
      event: eventName ?? "message",
      payload
    },
    ...(audio === undefined ? {} : { audio })
  };
}

// splitCompleteSseBlocks: 入参为流式缓冲文本；输出完整 block 和剩余未完成文本。
function splitCompleteSseBlocks(buffer: string): { blocks: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/gu, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  return {
    blocks: parts.map((part) => part.trim()).filter((part) => part.length > 0),
    rest
  };
}

// assertOkResponse: 入参为 fetch response 和场景名；功能是把非 2xx 响应转换为平台错误。
async function assertOkResponse(response: Response, label: string): Promise<void> {
  if (response.ok) {
    return;
  }
  throw new TTSError(`${label} failed with HTTP ${response.status}.`, "vendor_execution_failed", 502, {
    status: response.status,
    body: await response.text()
  });
}

// defaultModelId: 入参为模型 capability 和 operation；输出该 operation 可用的默认模型 id。
function defaultModelId(models: TTSVendorModel[], operation: TTSOperation): string {
  return (
    models.find((model) => model.defaultForOperations?.includes(operation))?.modelId ??
    models.find((model) => model.canonicalCapabilities.supportedOperations.includes(operation))?.modelId ??
    DOUBAO_DEFAULT_RESOURCE_ID
  );
}

// isDoubaoSynthesisResourceId: 入参为 Resource Id；输出是否为可用于 SSE 合成请求的 Resource Id。
function isDoubaoSynthesisResourceId(resourceId: string): boolean {
  return (DOUBAO_SYNTHESIS_RESOURCE_IDS as readonly string[]).includes(resourceId);
}

// doubaoResourceIdFromCompatibility: 入参为请求音色兼容事实；输出需要写入 X-Api-Resource-Id 的复刻资源。
function doubaoResourceIdFromCompatibility(compatibility: VoiceCompatibility | undefined): string | undefined {
  if (compatibility?.scope !== "resource") {
    return undefined;
  }
  return compatibility.vendorField === undefined || compatibility.vendorField === "resourceId"
    ? compatibility.resourceIds[0]
    : undefined;
}

// doubaoVoiceResourceCompatibility: 入参为豆包 Resource Id；输出复刻音色合成时需要强制匹配的资源兼容事实。
function doubaoVoiceResourceCompatibility(resourceId: string): VoiceCompatibility {
  return {
    scope: "resource",
    enforced: true,
    resourceIds: [resourceId],
    resourceKind: "clone_resource",
    vendorField: "resourceId",
    compatibleModelIds: doubaoCompatibleTtsModelIds(resourceId),
    preferredModelIds: doubaoCompatibleTtsModelIds(resourceId),
    notes: ["豆包复刻音色合成时必须用匹配的 X-Api-Resource-Id；req_params.model 是复刻 2.0 下的表现模型参数。"]
  };
}

// doubaoCloneResourceIdFromVoice: 入参为本地 voice 记录；输出可从历史字段或音色 ID 中推导出的 seed-icl 资源。
function doubaoCloneResourceIdFromVoice(voice: VoiceRecord): string | undefined {
  const metadataResource =
    stringValue(voice.vendorMetadata?.resourceId) ??
    stringValue(voice.vendorMetadata?.cloneModelId) ??
    stringValue(voice.vendorMetadata?.cloneResourceId);
  if (metadataResource !== undefined && isDoubaoCloneResourceId(metadataResource)) {
    return metadataResource;
  }
  if (voice.modelId !== undefined && isDoubaoCloneResourceId(voice.modelId)) {
    return voice.modelId;
  }
  const searchable = `${voice.voiceId} ${voice.providerVoiceId} ${voice.displayName}`;
  return DOUBAO_CLONE_RESOURCE_IDS.find((resourceId) => searchable.includes(resourceId));
}

// doubaoCompatibleTtsModelIds: 入参为复刻资源；输出平台模型选择上可搭配的 TTS 模型候选。
function doubaoCompatibleTtsModelIds(resourceId: string): string[] {
  return resourceId === "seed-icl-1.0" || resourceId === "seed-icl-1.0-concurr"
    ? ["seed-tts-1.0"]
    : [DOUBAO_DEFAULT_TTS_RESOURCE_ID];
}

// isDoubaoCloneResourceId: 入参为 Resource Id；输出是否为 seed-icl 复刻资源。
function isDoubaoCloneResourceId(resourceId: string): boolean {
  return (DOUBAO_CLONE_RESOURCE_IDS as readonly string[]).includes(resourceId);
}

function applied(field: string, value: JsonValue, vendorField: string): AppliedCanonicalField {
  return {
    field,
    value,
    vendorField
  };
}

function vendorApplied(path: string, value: unknown, _vendorField: string, schemaVersion: string): AppliedVendorExtension {
  return {
    providerId: DOUBAO_PROVIDER_ID,
    schemaVersion,
    path,
    value: toJsonValue(value)
  };
}

function normalizeProviderVoiceId(voiceId: string | undefined): string | undefined {
  if (voiceId === undefined) {
    return undefined;
  }
  const trimmed = voiceId.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const providerStripped = trimmed.startsWith(`${DOUBAO_PROVIDER_ID}:`)
    ? trimmed.slice(`${DOUBAO_PROVIDER_ID}:`.length)
    : trimmed;
  return normalizeDoubaoLegacySpeakerId(providerStripped);
}

// normalizeDoubaoLegacySpeakerId: 入参为平台历史登记音色 ID；输出豆包 req_params.speaker 需要的真实 speaker id。
function normalizeDoubaoLegacySpeakerId(voiceId: string): string {
  for (const resourceId of DOUBAO_SYNTHESIS_RESOURCE_IDS) {
    const prefix = `${DOUBAO_PROVIDER_ID}_${resourceId}_`;
    if (voiceId.startsWith(prefix) && voiceId.length > prefix.length) {
      return voiceId.slice(prefix.length);
    }
  }
  return voiceId;
}

function normalizeCloneSpeakerId(displayName: string): string {
  const normalized = displayName.trim().replace(/[^A-Za-z0-9_-]/gu, "_").replace(/^[-_]+|[-_]+$/gu, "");
  const withPrefix = /^[A-Za-z]/u.test(normalized) ? normalized : `voice_${normalized}`;
  return withPrefix.length >= 8 ? withPrefix : `${withPrefix}_clone`;
}

function localAudioPath(referenceAudio: Extract<TTSOperationRequest, { operation: "voice.clone.create" }>["referenceAudio"][number] | undefined): string | undefined {
  if (referenceAudio?.path !== undefined && referenceAudio.path.trim().length > 0) {
    return referenceAudio.path;
  }
  if (referenceAudio?.uri?.startsWith("file://")) {
    return fileURLToPath(referenceAudio.uri);
  }
  return undefined;
}

function inferAudioFormat(audioPath: string): "wav" | "mp3" | "m4a" | "pcm" | undefined {
  const lower = audioPath.toLowerCase();
  if (lower.endsWith(".wav")) {
    return "wav";
  }
  if (lower.endsWith(".mp3")) {
    return "mp3";
  }
  if (lower.endsWith(".m4a")) {
    return "m4a";
  }
  if (lower.endsWith(".pcm")) {
    return "pcm";
  }
  return undefined;
}

function languageCode(language: string | undefined): number {
  const map: Record<string, number> = {
    "zh-CN": 0,
    "en-US": 1,
    "ja-JP": 2,
    "es-ES": 3,
    "id-ID": 4,
    "pt-PT": 5,
    "de-DE": 6,
    "fr-FR": 7,
    "ko-KR": 8
  };
  return language === undefined ? 0 : map[language] ?? 0;
}

function toDoubaoAudioFormat(format: TTSOutputFormat): string {
  return format === "opus" ? "ogg_opus" : format;
}

function outputFormatFromVendor(vendorRequest: VendorPayload): TTSOutputFormat {
  const format = objectAt(objectAt(objectAt(vendorRequest, "body"), "req_params"), "audio_params").format;
  return format === "ogg_opus" ? "opus" : isTtsOutputFormat(format) ? format : "mp3";
}

function sampleRateFromVendor(vendorRequest: VendorPayload): number {
  const sampleRate = objectAt(objectAt(objectAt(vendorRequest, "body"), "req_params"), "audio_params").sample_rate;
  return typeof sampleRate === "number" ? sampleRate : 24000;
}

function requireUsageTokens(vendorRequest: VendorPayload): boolean {
  return vendorRequest.requireUsageTokens === true;
}

function endpointUrl(baseUrl: string, pathname: string): string {
  return new URL(pathname, baseUrl).toString();
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function objectAt(payload: VendorPayload, key: string): VendorPayload {
  const value = payload[key];
  if (isVendorPayload(value)) {
    return value;
  }
  const next: VendorPayload = {};
  payload[key] = next;
  return next;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// stringValue: 入参为未知值；输出非空字符串，供历史 voice metadata 兼容读取。
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isVendorPayload(value: unknown): value is VendorPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTtsOutputFormat(value: unknown): value is TTSOutputFormat {
  return value === "wav" || value === "mp3" || value === "ogg" || value === "pcm" || value === "flac" || value === "opus";
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]));
  }
  return String(value);
}

function findProviderVoiceId(vendorResponse: VendorPayload, vendorRequest: VendorPayload): string | undefined {
  if (typeof vendorResponse.speaker_id === "string" && vendorResponse.speaker_id.length > 0) {
    return vendorResponse.speaker_id;
  }
  if (typeof vendorResponse.custom_speaker_id === "string" && vendorResponse.custom_speaker_id.length > 0) {
    return vendorResponse.custom_speaker_id;
  }
  if (typeof vendorRequest.custom_speaker_id === "string" && vendorRequest.custom_speaker_id.length > 0) {
    return vendorRequest.custom_speaker_id;
  }
  return typeof vendorRequest.speaker_id === "string" && vendorRequest.speaker_id !== "custom_speaker_id"
    ? vendorRequest.speaker_id
    : undefined;
}

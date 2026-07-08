import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  TTSError,
  type AppliedCanonicalField,
  type AppliedVendorExtension,
  type Approximation,
  type IgnoredField,
  type JsonValue,
  type MappingReport,
  type ReferenceAudio,
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
  type VoiceCloneInstantPlan,
  type VoiceCloneInstantProviderResult
} from "@tts-platform/core";
import { createPlanId } from "../../utils/ids";
import {
  XIAOMI_MIMO_ADAPTER_VERSION,
  XIAOMI_MIMO_DEFAULT_MODEL,
  XIAOMI_MIMO_DEFAULT_VOICE_ID,
  XIAOMI_MIMO_PROVIDER_ID,
  xiaomiMiMoCapabilities
} from "./capabilities";
import { xiaomiMiMoExtensionSchema } from "./extension-schema";

const DEFAULT_BASE_URL = "https://api.xiaomimimo.com";
const CHAT_COMPLETIONS_PATH = "/v1/chat/completions";
const DEFAULT_SAMPLE_RATE_HZ = 24000;

export interface XiaomiMiMoAdapterOptions {
  apiKey?: string | undefined;
  baseUrl?: string;
  fetch?: typeof fetch;
}

// XiaomiMiMoTTSAdapter: 小米 MiMo 语音 adapter；负责 Chat Completions 风格 TTS、流式音频和即时音色复刻。
export class XiaomiMiMoTTSAdapter implements TTSAdapter {
  private readonly providerDefinition;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  readonly providerId;
  readonly adapterVersion;

  // constructor: 入参为 adapter 配置；功能是注入鉴权、baseUrl 和 fetch 依赖。
  constructor(options: XiaomiMiMoAdapterOptions = {}) {
    this.providerDefinition = xiaomiMiMoCapabilities(XIAOMI_MIMO_ADAPTER_VERSION);
    this.providerId = this.providerDefinition.providerId;
    this.adapterVersion = this.providerDefinition.adapterVersion;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetch ?? fetch;
  }

  // capabilities: 无入参；输出当前 MiMo adapter 固化的能力定义。
  capabilities() {
    return this.providerDefinition;
  }

  // extensionSchema: 入参为 operation；输出 MiMo 对应该 operation 的 vendor extension schema。
  extensionSchema(operation: TTSOperation): VendorExtensionSchema {
    return xiaomiMiMoExtensionSchema(operation);
  }

  // plan: 入参为平台 operation request；输出包含 vendor request 和 mapping report 的 MiMo plan。
  async plan(request: TTSOperationRequest): Promise<TTSSyncPlan | TTSStreamPlan | VoiceCloneInstantPlan> {
    if (request.operation === "voice.clone.instant") {
      return this.planInstantVoiceClone(request);
    }
    if (request.operation !== "tts.sync" && request.operation !== "tts.stream") {
      throw new TTSError(`Xiaomi MiMo adapter does not support '${request.operation}'.`, "operation_not_supported", 400);
    }

    const capabilitySnapshot = this.capabilities();
    const operationCapability = capabilitySnapshot.operations[request.operation];
    if (operationCapability?.supported !== true) {
      throw new TTSError("Xiaomi MiMo does not support this operation.", "operation_not_supported", 400);
    }

    const modelId = request.model ?? defaultModelId(capabilitySnapshot.vendorModels, request.operation);
    const model = capabilitySnapshot.vendorModels.find((candidate) => candidate.modelId === modelId);
    if (model === undefined || !model.canonicalCapabilities.supportedOperations.includes(request.operation)) {
      throw new TTSError(`Xiaomi MiMo model '${modelId}' does not support '${request.operation}'.`, "invalid_request", 400);
    }

    const directiveMode = request.vendor?.mode ?? "prefer_vendor";
    const extension = request.vendor?.extensions?.[this.providerId];
    if (directiveMode === "vendor_required" && extension === undefined) {
      throw new TTSError("Xiaomi MiMo vendor extension is required by the request but was not provided.", "vendor_extension_required", 400);
    }

    const appliedCanonicalFields: AppliedCanonicalField[] = [
      applied("text", request.text, "messages[role=assistant].content")
    ];
    const appliedVendorExtensions: AppliedVendorExtension[] = [];
    const ignoredFields: IgnoredField[] = [];
    const approximations: Approximation[] = [];
    const defaultOutput = model.defaultConfiguration?.output ?? {};
    const actualSampleRate = supportedSampleRate(request.output?.sampleRateHz, defaultOutput.sampleRateHz ?? DEFAULT_SAMPLE_RATE_HZ);
    const actualFormat = request.operation === "tts.stream" ? "pcm" : supportedOutputFormat(request.output?.format, defaultOutput.format ?? "wav");
    const userPrompts: string[] = [];
    let assistantPrefix = "";
    let optimizeTextPreview: boolean | undefined;

    if (request.model !== undefined) {
      appliedCanonicalFields.push(applied("model", modelId, "model"));
    }
    if (request.output?.format !== undefined && request.output.format === actualFormat) {
      appliedCanonicalFields.push(applied("output.format", request.output.format, "audio.format"));
    }
    if (request.output?.sampleRateHz !== undefined && request.output.sampleRateHz === actualSampleRate) {
      appliedCanonicalFields.push(applied("output.sampleRateHz", request.output.sampleRateHz, "sampleRateHz"));
    }

    collectUnsupportedOutputFields(request.output, actualFormat, ignoredFields);
    collectApproximatedControls(request.controls, userPrompts, approximations);

    if (request.ssml !== undefined) {
      ignoredFields.push({
        field: "ssml",
        reason: "Xiaomi MiMo Chat Completions TTS does not expose SSML input."
      });
    }

    if (extension !== undefined) {
      const applied = applyTtsVendorExtension({
        providerId: this.providerId,
        directiveMode,
        extension,
        userPrompts,
        modelId,
        ignoredFields,
        appliedVendorExtensions
      });
      assistantPrefix = applied.assistantPrefix;
      optimizeTextPreview = applied.optimizeTextPreview;
    }

    if (modelId === "mimo-v2.5-tts-voicedesign" && userPrompts.length === 0) {
      throw new TTSError("Xiaomi MiMo voice design requires vendor.extensions.xiaomi_mimo.params.voiceDesignPrompt or controls.style.", "invalid_request", 400);
    }

    const messages = buildMessages(userPrompts, assistantPrefix, request.text);
    const audio: VendorPayload = {
      format: request.operation === "tts.stream" ? "pcm16" : actualFormat
    };
    if (modelId === "mimo-v2.5-tts") {
      const requestedVoice = normalizeVoiceId(request.voice.providerVoiceId ?? request.voice.voiceId);
      const voice = requestedVoice ?? XIAOMI_MIMO_DEFAULT_VOICE_ID;
      audio.voice = voice;
      if (requestedVoice !== undefined) {
        appliedCanonicalFields.push(applied("voice", requestedVoice, "audio.voice"));
      }
    }
    if (optimizeTextPreview !== undefined) {
      audio.optimize_text_preview = optimizeTextPreview;
    }

    const body: VendorPayload = {
      model: modelId,
      messages,
      audio,
      ...(request.operation === "tts.stream" ? { stream: true } : {})
    };
    const vendorRequest: VendorPayload = {
      method: "POST",
      endpoint: CHAT_COMPLETIONS_PATH,
      body,
      outputFormat: actualFormat,
      sampleRateHz: actualSampleRate,
      stream: request.operation === "tts.stream"
    };

    const mappingReport: MappingReport = {
      providerId: this.providerId,
      operation: request.operation,
      directiveMode,
      appliedCanonicalFields,
      appliedVendorExtensions,
      ignoredFields,
      approximations,
      warnings: request.operation === "tts.stream" ? ["Xiaomi MiMo stream audio is requested as pcm16 and archived as platform pcm bytes."] : []
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

  // synthesizeSync: 入参为同步合成 plan；输出解码后的音频和 MiMo 原始响应。
  async synthesizeSync(plan: TTSSyncPlan): Promise<TTSSyncProviderResult> {
    const vendorResponse = await this.postJson(plan.vendorRequest);
    const audioData = audioDataFromChatCompletion(vendorResponse);
    return {
      audio: {
        data: decodeBase64(audioData),
        format: outputFormatFromPlan(plan.vendorRequest, "wav"),
        sampleRateHz: sampleRateFromPlan(plan.vendorRequest)
      },
      vendorResponse
    };
  }

  // synthesizeStream: 入参为流式合成 plan；输出统一 stream lifecycle 事件。
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
        endpoint: endpointUrl(this.baseUrl, String(plan.vendorRequest.endpoint ?? CHAT_COMPLETIONS_PATH)),
        model: objectAt(plan.vendorRequest, "body").model,
        format: "pcm16",
        sampleRateHz: sampleRateFromPlan(plan.vendorRequest)
      }
    };
    sequence += 1;

    for await (const chunk of this.consumeChatCompletionStream(plan.vendorRequest)) {
      if (chunk.audio === undefined) {
        if (chunk.raw !== undefined) {
          yield {
            type: "metadata",
            sequence,
            payload: chunk.raw
          };
          sequence += 1;
        }
        continue;
      }
      yield {
        type: "audio.chunk",
        sequence,
        data: chunk.audio,
        format: "pcm"
      };
      sequence += 1;
    }

    yield {
      type: "session.completed",
      sequence
    };
  }

  // createInstantVoiceClone: 入参为即时复刻 plan；输出直接生成的音频和 MiMo 原始响应。
  async createInstantVoiceClone(plan: VoiceCloneInstantPlan): Promise<VoiceCloneInstantProviderResult> {
    const vendorResponse = await this.postJson(plan.vendorRequest);
    const audioData = audioDataFromChatCompletion(vendorResponse);
    return {
      audio: {
        data: decodeBase64(audioData),
        format: outputFormatFromPlan(plan.vendorRequest, "wav"),
        sampleRateHz: sampleRateFromPlan(plan.vendorRequest)
      },
      vendorResponse
    };
  }

  // planInstantVoiceClone: 入参为 voice.clone.instant 请求；输出携带 reference audio data URI 的 MiMo plan。
  private async planInstantVoiceClone(
    request: Extract<TTSOperationRequest, { operation: "voice.clone.instant" }>
  ): Promise<VoiceCloneInstantPlan> {
    const capabilitySnapshot = this.capabilities();
    const operationCapability = capabilitySnapshot.operations[request.operation];
    if (operationCapability?.supported !== true) {
      throw new TTSError("Xiaomi MiMo does not support instant voice clone.", "operation_not_supported", 400);
    }
    if (request.referenceAudio.length === 0) {
      throw new TTSError("Xiaomi MiMo instant voice clone requires one reference audio.", "invalid_request", 400);
    }

    const modelId = request.model ?? "mimo-v2.5-tts-voiceclone";
    const model = capabilitySnapshot.vendorModels.find((candidate) => candidate.modelId === modelId);
    if (model === undefined || !model.canonicalCapabilities.supportedOperations.includes("voice.clone.instant")) {
      throw new TTSError(`Xiaomi MiMo model '${modelId}' does not support voice.clone.instant.`, "invalid_request", 400);
    }

    const directiveMode = request.vendor?.mode ?? "prefer_vendor";
    const extension = request.vendor?.extensions?.[this.providerId];
    if (directiveMode === "vendor_required" && extension === undefined) {
      throw new TTSError("Xiaomi MiMo vendor extension is required by the request but was not provided.", "vendor_extension_required", 400);
    }

    const referenceAudio = request.referenceAudio[0];
    if (referenceAudio === undefined) {
      throw new TTSError("Xiaomi MiMo instant voice clone requires referenceAudio[0].", "invalid_request", 400);
    }
    const referenceAudioVoice = await referenceAudioDataUri(referenceAudio);
    const appliedCanonicalFields: AppliedCanonicalField[] = [
      applied("text", request.text, "messages[role=assistant].content"),
      applied("referenceAudio[0]", referenceAudio.uri, "audio.voice")
    ];
    if (request.model !== undefined) {
      appliedCanonicalFields.push(applied("model", modelId, "model"));
    }
    const ignoredFields: IgnoredField[] = [];
    const approximations: Approximation[] = [];
    const appliedVendorExtensions: AppliedVendorExtension[] = [];
    const userPrompts: string[] = [];
    let assistantPrefix = "";
    collectUnsupportedOutputFields(request.output, "wav", ignoredFields);
    collectApproximatedControls(request.controls, userPrompts, approximations);
    if (extension !== undefined) {
      assistantPrefix = applyInstantCloneVendorExtension({
        providerId: this.providerId,
        directiveMode,
        extension,
        userPrompts,
        ignoredFields,
        appliedVendorExtensions
      });
    }

    const body: VendorPayload = {
      model: modelId,
      messages: buildMessages(userPrompts, assistantPrefix, request.text),
      audio: {
        format: "wav",
        voice: referenceAudioVoice
      }
    };
    const vendorRequest: VendorPayload = {
      method: "POST",
      endpoint: CHAT_COMPLETIONS_PATH,
      body,
      outputFormat: "wav",
      sampleRateHz: supportedSampleRate(request.output?.sampleRateHz, DEFAULT_SAMPLE_RATE_HZ)
    };
    const mappingReport: MappingReport = {
      providerId: this.providerId,
      operation: "voice.clone.instant",
      directiveMode,
      appliedCanonicalFields,
      appliedVendorExtensions,
      ignoredFields,
      approximations,
      warnings: ["Xiaomi MiMo instant voice clone stores reference audio as a data URI in vendor-request.json."]
    };

    return {
      planId: createPlanId(),
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      operation: "voice.clone.instant",
      createdAt: new Date().toISOString(),
      capabilitySnapshot,
      canonicalRequest: request,
      vendorRequest,
      mappingReport
    };
  }

  // postJson: 入参为 vendorRequest；功能是调用 MiMo JSON HTTP 接口并返回 JSON object。
  private async postJson(vendorRequest: VendorPayload): Promise<VendorPayload> {
    const response = await this.fetchImpl(endpointUrl(this.baseUrl, String(vendorRequest.endpoint ?? CHAT_COMPLETIONS_PATH)), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(vendorRequest.body)
    });
    await assertOkResponse(response, "Xiaomi MiMo synthesis");
    const payload = await response.json() as unknown;
    if (!isVendorPayload(payload)) {
      throw new TTSError("Xiaomi MiMo response was not a JSON object.", "vendor_execution_failed", 502);
    }
    return payload;
  }

  // consumeChatCompletionStream: 入参为 vendorRequest；输出 OpenAI 兼容流式响应中的音频片段。
  private async *consumeChatCompletionStream(vendorRequest: VendorPayload): AsyncIterable<MiMoStreamChunk> {
    const response = await this.fetchImpl(endpointUrl(this.baseUrl, String(vendorRequest.endpoint ?? CHAT_COMPLETIONS_PATH)), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(vendorRequest.body)
    });
    await assertOkResponse(response, "Xiaomi MiMo stream synthesis");
    const text = await streamResponseText(response);
    for (const payload of parseOpenAiCompatibleSse(text)) {
      const audio = audioDataFromStreamPayload(payload);
      if (audio !== undefined) {
        yield {
          raw: payload,
          audio: decodeBase64(audio)
        };
        continue;
      }
      yield {
        raw: payload
      };
    }
  }

  // headers: 无入参；输出 MiMo HTTP 请求头，并在缺少 API Key 时抛平台错误。
  private headers(): Record<string, string> {
    if (this.apiKey === undefined || this.apiKey.trim().length === 0) {
      throw new TTSError("Xiaomi MiMo API key is required.", "vendor_execution_failed", 500);
    }
    return {
      "Content-Type": "application/json",
      "api-key": this.apiKey
    };
  }
}

interface ApplyTtsVendorExtensionInput {
  providerId: string;
  directiveMode: VendorDirectiveMode;
  extension: VendorExtensionInput;
  userPrompts: string[];
  modelId: string;
  ignoredFields: IgnoredField[];
  appliedVendorExtensions: AppliedVendorExtension[];
}

interface ApplyInstantCloneVendorExtensionInput {
  providerId: string;
  directiveMode: VendorDirectiveMode;
  extension: VendorExtensionInput;
  userPrompts: string[];
  ignoredFields: IgnoredField[];
  appliedVendorExtensions: AppliedVendorExtension[];
}

interface MiMoStreamChunk {
  raw?: VendorPayload;
  audio?: Uint8Array;
}

// applyTtsVendorExtension: 入参为 MiMo TTS 扩展；输出 assistant prefix 和 preview 开关。
function applyTtsVendorExtension(input: ApplyTtsVendorExtensionInput): {
  assistantPrefix: string;
  optimizeTextPreview?: boolean;
} {
  const result: { assistantPrefix: string; optimizeTextPreview?: boolean } = {
    assistantPrefix: ""
  };
  if (input.directiveMode === "canonical_only") {
    input.ignoredFields.push({
      field: `vendor.extensions.${input.providerId}`,
      reason: "Request mode canonical_only forbids vendor extension application."
    });
    return result;
  }

  for (const [key, value] of Object.entries(input.extension.params)) {
    if (key === "stylePrompt" && typeof value === "string" && value.trim().length > 0) {
      input.userPrompts.push(value.trim());
      input.appliedVendorExtensions.push(vendorApplied(input.providerId, key, value.trim(), input.extension.schemaVersion));
      continue;
    }
    if (key === "assistantPrefix" && typeof value === "string" && value.trim().length > 0) {
      result.assistantPrefix = value.trim();
      input.appliedVendorExtensions.push(vendorApplied(input.providerId, key, value.trim(), input.extension.schemaVersion));
      continue;
    }
    if (key === "voiceDesignPrompt" && typeof value === "string" && value.trim().length > 0) {
      if (input.modelId === "mimo-v2.5-tts-voicedesign") {
        input.userPrompts.push(value.trim());
        input.appliedVendorExtensions.push(vendorApplied(input.providerId, key, value.trim(), input.extension.schemaVersion));
      } else {
        input.ignoredFields.push({
          field: `vendor.extensions.${input.providerId}.${key}`,
          reason: "voiceDesignPrompt is only applied when model is mimo-v2.5-tts-voicedesign."
        });
      }
      continue;
    }
    if (key === "optimizeTextPreview" && typeof value === "boolean") {
      result.optimizeTextPreview = value;
      input.appliedVendorExtensions.push(vendorApplied(input.providerId, key, value, input.extension.schemaVersion));
      continue;
    }
    input.ignoredFields.push({
      field: `vendor.extensions.${input.providerId}.${key}`,
      reason: "Xiaomi MiMo adapter does not support this vendor extension key or value type."
    });
  }

  return result;
}

// applyInstantCloneVendorExtension: 入参为即时复刻扩展；输出 assistant prefix。
function applyInstantCloneVendorExtension(input: ApplyInstantCloneVendorExtensionInput): string {
  if (input.directiveMode === "canonical_only") {
    input.ignoredFields.push({
      field: `vendor.extensions.${input.providerId}`,
      reason: "Request mode canonical_only forbids vendor extension application."
    });
    return "";
  }

  let assistantPrefix = "";
  for (const [key, value] of Object.entries(input.extension.params)) {
    if (key === "stylePrompt" && typeof value === "string" && value.trim().length > 0) {
      input.userPrompts.push(value.trim());
      input.appliedVendorExtensions.push(vendorApplied(input.providerId, key, value.trim(), input.extension.schemaVersion));
      continue;
    }
    if (key === "assistantPrefix" && typeof value === "string" && value.trim().length > 0) {
      assistantPrefix = value.trim();
      input.appliedVendorExtensions.push(vendorApplied(input.providerId, key, value.trim(), input.extension.schemaVersion));
      continue;
    }
    input.ignoredFields.push({
      field: `vendor.extensions.${input.providerId}.${key}`,
      reason: "Xiaomi MiMo instant voice clone does not support this vendor extension key or value type."
    });
  }
  return assistantPrefix;
}

// collectUnsupportedOutputFields: 入参为输出偏好和实际格式；功能是记录 MiMo 当前不支持或未开放的输出字段。
function collectUnsupportedOutputFields(
  output: Extract<TTSOperationRequest, { operation: "tts.sync" | "tts.stream" | "voice.clone.instant" }>["output"],
  actualFormat: TTSOutputFormat,
  ignoredFields: IgnoredField[]
): void {
  if (output?.format !== undefined && output.format !== actualFormat) {
    ignoredFields.push({
      field: "output.format",
      reason: `Xiaomi MiMo adapter currently supports '${actualFormat}' for this operation.`
    });
  }
  if (output?.sampleRateHz !== undefined && output.sampleRateHz !== DEFAULT_SAMPLE_RATE_HZ) {
    ignoredFields.push({
      field: "output.sampleRateHz",
      reason: "Xiaomi MiMo examples and stream contract use 24000 Hz; unsupported sample rates use 24000 Hz."
    });
  }
  if (output?.bitrate !== undefined) {
    ignoredFields.push({
      field: "output.bitrate",
      reason: "Xiaomi MiMo Chat Completions TTS does not expose bitrate control."
    });
  }
  if (output?.channels !== undefined && output.channels !== 1) {
    ignoredFields.push({
      field: "output.channels",
      reason: "Xiaomi MiMo stream examples are mono; unsupported channel counts use mono output."
    });
  }
}

// collectApproximatedControls: 入参为 canonical controls；功能是把可近似表达的 controls 转换成 user prompt。
function collectApproximatedControls(
  controls: Extract<TTSOperationRequest, { operation: "tts.sync" | "tts.stream" | "voice.clone.instant" }>["controls"],
  userPrompts: string[],
  approximations: Approximation[]
): void {
  if (controls?.style !== undefined) {
    userPrompts.push(controls.style);
    approximations.push(approximation("controls.style", controls.style, controls.style, "MiMo expresses style through natural-language user prompts."));
  }
  if (controls?.emotion !== undefined) {
    const prompt = `Use ${controls.emotion} emotion.`;
    userPrompts.push(prompt);
    approximations.push(approximation("controls.emotion", controls.emotion, prompt, "MiMo expresses emotion through natural-language user prompts or assistant audio tags."));
  }
  if (controls?.speed !== undefined) {
    const prompt = controls.speed > 1 ? "Speak faster than normal." : controls.speed < 1 ? "Speak slower than normal." : "Speak at a normal speed.";
    userPrompts.push(prompt);
    approximations.push(approximation("controls.speed", controls.speed, prompt, "MiMo does not expose a numeric speed parameter."));
  }
  if (controls?.pitch !== undefined) {
    const prompt = controls.pitch > 0 ? "Use a slightly higher pitch." : controls.pitch < 0 ? "Use a slightly lower pitch." : "Use a natural pitch.";
    userPrompts.push(prompt);
    approximations.push(approximation("controls.pitch", controls.pitch, prompt, "MiMo does not expose a numeric pitch parameter."));
  }
  if (controls?.volume !== undefined) {
    approximations.push(approximation("controls.volume", controls.volume, "natural volume", "MiMo does not expose a numeric volume parameter."));
  }
}

// buildMessages: 入参为 user prompts、assistant prefix 和文本；输出 MiMo Chat Completions messages。
function buildMessages(userPrompts: string[], assistantPrefix: string, text: string): VendorPayload[] {
  const messages: VendorPayload[] = [];
  const userContent = userPrompts.map((prompt) => prompt.trim()).filter((prompt) => prompt.length > 0).join("\n");
  if (userContent.length > 0) {
    messages.push({
      role: "user",
      content: userContent
    });
  }
  messages.push({
    role: "assistant",
    content: `${assistantPrefix}${text}`
  });
  return messages;
}

// referenceAudioDataUri: 入参为 reference audio；输出 MiMo voice clone 需要的 data URI。
async function referenceAudioDataUri(referenceAudio: ReferenceAudio | undefined): Promise<string> {
  if (referenceAudio === undefined) {
    throw new TTSError("Xiaomi MiMo instant voice clone requires referenceAudio[0].", "invalid_request", 400);
  }
  if (referenceAudio.uri.startsWith("data:")) {
    assertSupportedReferenceAudioDataUri(referenceAudio.uri);
    return referenceAudio.uri;
  }
  const audioPath = localAudioPath(referenceAudio);
  if (audioPath === undefined) {
    throw new TTSError("Xiaomi MiMo instant voice clone requires referenceAudio[0].uri data URI, referenceAudio[0].path, or file:// URI.", "invalid_request", 400);
  }
  const audio = await readFile(audioPath);
  const format = referenceAudio.format ?? inferReferenceAudioFormat(audioPath);
  if (format !== "mp3" && format !== "wav") {
    throw new TTSError("Xiaomi MiMo instant voice clone supports only mp3 and wav reference audio.", "invalid_request", 400);
  }
  return `data:${mimeTypeForReferenceFormat(format)};base64,${audio.toString("base64")}`;
}

// assertSupportedReferenceAudioDataUri: 入参为 data URI；功能是校验 MiMo 当前支持的音频 MIME。
function assertSupportedReferenceAudioDataUri(uri: string): void {
  if (
    !uri.startsWith("data:audio/mpeg;base64,") &&
    !uri.startsWith("data:audio/mp3;base64,") &&
    !uri.startsWith("data:audio/wav;base64,")
  ) {
    throw new TTSError("Xiaomi MiMo instant voice clone supports data URI audio/mpeg, audio/mp3, or audio/wav.", "invalid_request", 400);
  }
}

function defaultModelId(models: TTSVendorModel[], operation: TTSOperation): string {
  return models.find((model) => model.defaultForOperations?.includes(operation))?.modelId ?? XIAOMI_MIMO_DEFAULT_MODEL;
}

function supportedOutputFormat(requested: TTSOutputFormat | undefined, fallback: TTSOutputFormat): TTSOutputFormat {
  return requested === "wav" ? requested : fallback;
}

function supportedSampleRate(requested: number | undefined, fallback: number): number {
  return requested === DEFAULT_SAMPLE_RATE_HZ ? requested : fallback;
}

function normalizeVoiceId(voiceId: string | undefined): string | undefined {
  if (voiceId === undefined) {
    return undefined;
  }
  const trimmed = voiceId.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed.startsWith(`${XIAOMI_MIMO_PROVIDER_ID}:`) ? trimmed.slice(`${XIAOMI_MIMO_PROVIDER_ID}:`.length) : trimmed;
}

function applied(field: string, value: JsonValue, vendorField: string): AppliedCanonicalField {
  return {
    field,
    value,
    vendorField
  };
}

function approximation(field: string, requestedValue: JsonValue, actualValue: JsonValue, reason: string): Approximation {
  return {
    field,
    requestedValue,
    actualValue,
    reason
  };
}

function vendorApplied(providerId: string, path: string, value: unknown, schemaVersion: string): AppliedVendorExtension {
  return {
    providerId,
    schemaVersion,
    path,
    value: toJsonValue(value)
  };
}

function localAudioPath(referenceAudio: ReferenceAudio): string | undefined {
  if (referenceAudio.path !== undefined && referenceAudio.path.trim().length > 0) {
    return referenceAudio.path;
  }
  if (referenceAudio.uri.startsWith("file://")) {
    return fileURLToPath(referenceAudio.uri);
  }
  return undefined;
}

function inferReferenceAudioFormat(audioPath: string): "mp3" | "wav" | undefined {
  const lower = audioPath.toLowerCase();
  if (lower.endsWith(".mp3")) {
    return "mp3";
  }
  if (lower.endsWith(".wav")) {
    return "wav";
  }
  return undefined;
}

function mimeTypeForReferenceFormat(format: "mp3" | "wav"): string {
  return format === "wav" ? "audio/wav" : "audio/mpeg";
}

function endpointUrl(baseUrl: string, pathname: string): string {
  return new URL(pathname, baseUrl).toString();
}

function outputFormatFromPlan(vendorRequest: VendorPayload, fallback: TTSOutputFormat): TTSOutputFormat {
  const value = vendorRequest.outputFormat;
  return value === "wav" || value === "pcm" ? value : fallback;
}

function sampleRateFromPlan(vendorRequest: VendorPayload): number {
  return typeof vendorRequest.sampleRateHz === "number" && Number.isFinite(vendorRequest.sampleRateHz)
    ? vendorRequest.sampleRateHz
    : DEFAULT_SAMPLE_RATE_HZ;
}

function audioDataFromChatCompletion(payload: VendorPayload): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  for (const choice of choices) {
    if (!isVendorPayload(choice)) {
      continue;
    }
    const message = objectValue(choice.message);
    const audio = objectValue(message.audio);
    if (typeof audio.data === "string" && audio.data.length > 0) {
      return audio.data;
    }
  }
  throw new TTSError("Xiaomi MiMo response did not include choices[0].message.audio.data.", "vendor_execution_failed", 502, {
    vendorResponse: toJsonValue(payload)
  });
}

function audioDataFromStreamPayload(payload: VendorPayload): string | undefined {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  for (const choice of choices) {
    if (!isVendorPayload(choice)) {
      continue;
    }
    const delta = objectValue(choice.delta);
    const audio = objectValue(delta.audio);
    if (typeof audio.data === "string" && audio.data.length > 0) {
      return audio.data;
    }
  }
  return undefined;
}

async function streamResponseText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return response.text();
  }
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function parseOpenAiCompatibleSse(text: string): VendorPayload[] {
  const payloads: VendorPayload[] = [];
  for (const block of text.replace(/\r\n/gu, "\n").split("\n\n")) {
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (dataLines.length === 0) {
      continue;
    }
    const data = dataLines.join("\n").trim();
    if (data.length === 0 || data === "[DONE]") {
      continue;
    }
    const parsed = JSON.parse(data) as unknown;
    if (!isVendorPayload(parsed)) {
      throw new TTSError("Xiaomi MiMo stream data was not a JSON object.", "vendor_execution_failed", 502);
    }
    payloads.push(parsed);
  }
  return payloads;
}

async function assertOkResponse(response: Response, label: string): Promise<void> {
  if (response.ok) {
    return;
  }
  throw new TTSError(`${label} failed with HTTP ${response.status}.`, "vendor_execution_failed", 502, {
    status: response.status,
    body: await response.text()
  });
}

function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function objectAt(payload: VendorPayload, key: string): VendorPayload {
  const value = payload[key];
  return isVendorPayload(value) ? value : {};
}

function objectValue(value: unknown): VendorPayload {
  return isVendorPayload(value) ? value : {};
}

function isVendorPayload(value: unknown): value is VendorPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

import {
  TTSError,
  type AppliedCanonicalField,
  type AppliedVendorExtension,
  type Approximation,
  type IgnoredField,
  type JsonValue,
  type MappingReport,
  type TTSAdapter,
  type TTSStreamEvent,
  type TTSStreamPlan,
  type TTSOperation,
  type TTSOperationRequest,
  type TTSVendorModel,
  type TTSSyncPlan,
  type TTSSyncProviderResult,
  type TTSSyncRequest,
  type TTSStreamRequest,
  type VendorDirectiveMode,
  type VendorExtensionSchema,
  type VendorPayload
} from "@tts-platform/core";
import { createPlanId, createRunId } from "../../utils/ids";
import { mockCapabilities, MOCK_ADAPTER_VERSION } from "./capabilities";
import { mockExtensionSchema } from "./extension-schema";

export class MockTTSAdapter implements TTSAdapter {
  private readonly providerDefinition;

  readonly providerId;
  readonly adapterVersion;

  constructor(providerDefinition = mockCapabilities(MOCK_ADAPTER_VERSION)) {
    this.providerDefinition = providerDefinition;
    this.providerId = providerDefinition.providerId;
    this.adapterVersion = providerDefinition.adapterVersion;
  }

  capabilities() {
    return this.providerDefinition;
  }

  extensionSchema(operation: TTSOperation): VendorExtensionSchema {
    return mockExtensionSchema(operation);
  }

  // plan: 入参为同步合成请求；输出 mock 同步 plan，并记录 canonical/vendor 映射报告。
  async plan(request: TTSSyncRequest): Promise<TTSSyncPlan>;
  // plan: 入参为流式合成请求；输出 mock 流式 plan，并记录 canonical/vendor 映射报告。
  async plan(request: TTSStreamRequest): Promise<TTSStreamPlan>;
  // plan: 入参为平台 operation request；输出 mock plan，并记录 canonical/vendor 映射报告。
  async plan(request: TTSOperationRequest): Promise<TTSSyncPlan | TTSStreamPlan> {
    if (request.operation !== "tts.sync" && request.operation !== "tts.stream") {
      throw new TTSError(
        `Mock adapter does not implement '${request.operation}' execution yet.`,
        "operation_not_supported",
        400
      );
    }

    const capabilitySnapshot = this.capabilities();
    const operationCapability = capabilitySnapshot.operations[request.operation];
    if (operationCapability?.supported !== true) {
      throw new TTSError("Mock adapter cannot plan this operation.", "operation_not_supported", 400);
    }

    const directiveMode = request.vendor?.mode ?? "prefer_vendor";
    const extension = request.vendor?.extensions?.[this.providerId];
    if (directiveMode === "vendor_required" && extension === undefined) {
      throw new TTSError(
        "Mock vendor extension is required by the request but was not provided.",
        "vendor_extension_required",
        400
      );
    }

    const model = request.model ?? defaultModelId(capabilitySnapshot.vendorModels, request.operation);
    const modelDefinition = capabilitySnapshot.vendorModels.find((candidate) => candidate.modelId === model);
    if (modelDefinition === undefined) {
      throw new TTSError(`Mock model '${model}' was not found.`, "invalid_request", 400);
    }
    const defaultOutput = modelDefinition.defaultConfiguration?.output ?? {};
    const defaultControls = modelDefinition.defaultConfiguration?.controls ?? {};
    const defaultVoice = modelDefinition.defaultConfiguration?.voice ?? {};
    const supportedFormats = modelDefinition.canonicalCapabilities.outputFormats ?? [];
    const supportedSampleRates = modelDefinition.canonicalCapabilities.sampleRatesHz ?? [];
    const actualFormat =
      request.output?.format !== undefined && supportedFormats.includes(request.output.format)
        ? request.output.format
        : defaultOutput.format ?? "wav";
    const actualSampleRate =
      request.output?.sampleRateHz !== undefined &&
      supportedSampleRates.includes(request.output.sampleRateHz)
        ? request.output.sampleRateHz
        : defaultOutput.sampleRateHz ?? 24000;
    const requestedVoice = request.voice.providerVoiceId ?? request.voice.voiceId;
    const voice = requestedVoice ?? defaultVoice.providerVoiceId ?? "mock-default-voice";

    const appliedCanonicalFields: AppliedCanonicalField[] = [
      applied("text", request.text, "input.text")
    ];

    if (requestedVoice !== undefined) {
      appliedCanonicalFields.push(applied("voice", requestedVoice, "voice"));
    }
    if (request.model !== undefined) {
      appliedCanonicalFields.push(applied("model", model, "model"));
    }
    if (request.voice.language !== undefined) {
      appliedCanonicalFields.push(applied("voice.language", request.voice.language, "language"));
    }
    if (request.ssml !== undefined && modelDefinition.canonicalCapabilities.supportsSSML) {
      appliedCanonicalFields.push(applied("ssml", request.ssml, "input.ssml"));
    }
    if (request.controls?.speed !== undefined) {
      appliedCanonicalFields.push(applied("controls.speed", request.controls.speed, "speed"));
    }
    if (request.controls?.pitch !== undefined) {
      appliedCanonicalFields.push(applied("controls.pitch", request.controls.pitch, "pitchSemitones"));
    }
    if (request.output?.format !== undefined && supportedFormats.includes(request.output.format)) {
      appliedCanonicalFields.push(applied("output.format", request.output.format, "format"));
    }
    if (
      request.output?.sampleRateHz !== undefined &&
      supportedSampleRates.includes(request.output.sampleRateHz)
    ) {
      appliedCanonicalFields.push(applied("output.sampleRateHz", request.output.sampleRateHz, "sampleRateHz"));
    }

    const approximations: Approximation[] = [];
    const ignoredFields: IgnoredField[] = [];
    if (request.output?.format !== undefined && !supportedFormats.includes(request.output.format)) {
      ignoredFields.push({
        field: "output.format",
        reason: `Model '${model}' does not support output format '${request.output.format}'. The vendor default is used.`
      });
    }
    if (
      request.output?.sampleRateHz !== undefined &&
      !supportedSampleRates.includes(request.output.sampleRateHz)
    ) {
      ignoredFields.push({
        field: "output.sampleRateHz",
        reason: `Model '${model}' does not support sample rate '${request.output.sampleRateHz}'. The vendor default is used.`
      });
    }
    if (request.output?.bitrate !== undefined) {
      ignoredFields.push({
        field: "output.bitrate",
        reason: `Model '${model}' does not expose bitrate control. The vendor default is used.`
      });
    }
    if (request.output?.channels !== undefined) {
      ignoredFields.push({
        field: "output.channels",
        reason: `Model '${model}' does not expose channel control. The vendor default is used.`
      });
    }

    const appliedVendorExtensions: AppliedVendorExtension[] = [];
    const vendorRequest: VendorPayload = {
      input: {
        text: request.text
      },
      model,
      voice,
      language: request.voice.language ?? defaultControls.language ?? "en",
      format: actualFormat,
      sampleRateHz: actualSampleRate,
      speed: request.controls?.speed ?? defaultControls.speed ?? 1,
      pitchSemitones: request.controls?.pitch ?? defaultControls.pitch ?? 0
    };

    if (request.controls?.volume !== undefined) {
      ignoredFields.push({
        field: "controls.volume",
        reason: "The mock adapter records this control but does not alter waveform gain."
      });
    }
    if (request.controls?.emotion !== undefined) {
      ignoredFields.push({
        field: "controls.emotion",
        reason: `Model '${model}' does not support emotion control.`
      });
    }
    if (request.controls?.style !== undefined) {
      ignoredFields.push({
        field: "controls.style",
        reason: `Model '${model}' does not support style control.`
      });
    }
    if (request.ssml !== undefined && !modelDefinition.canonicalCapabilities.supportsSSML) {
      ignoredFields.push({
        field: "ssml",
        reason: `Model '${model}' does not support SSML.`
      });
    }

    if (extension !== undefined && directiveMode === "canonical_only") {
      ignoredFields.push({
        field: `vendor.extensions.${this.providerId}`,
        reason: "Request mode canonical_only forbids vendor extension application."
      });
    }

    if (extension !== undefined && directiveMode !== "canonical_only") {
      for (const [key, value] of Object.entries(extension.params)) {
        vendorRequest[key] = value;
        appliedVendorExtensions.push({
          providerId: this.providerId,
          schemaVersion: extension.schemaVersion,
          path: key,
          value: toJsonValue(value)
        });
      }
    }

    const mappingReport: MappingReport = {
      providerId: this.providerId,
      operation: request.operation,
      directiveMode,
      appliedCanonicalFields,
      appliedVendorExtensions,
      ignoredFields,
      approximations,
      warnings: []
    };

    if (request.text.trim().length === 0) {
      mappingReport.warnings.push("Text is empty after trimming; mock audio will still be generated.");
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

  // synthesizeSync: 入参为同步 plan；输出本地生成的 WAV 音频和 mock vendor response。
  async synthesizeSync(plan: TTSSyncPlan): Promise<TTSSyncProviderResult> {
    const sampleRateHz = numberFromVendor(plan.vendorRequest.sampleRateHz, 24000);
    const toneHz = numberFromVendor(plan.vendorRequest.toneHz, 440);
    const durationMs = numberFromVendor(plan.vendorRequest.durationMs, 600);
    const audio = createSineWaveWav({
      sampleRateHz,
      toneHz,
      durationMs
    });

    return {
      audio: {
        data: audio,
        format: "wav",
        sampleRateHz
      },
      vendorResponse: {
        providerRunId: createRunId(),
        bytes: audio.byteLength,
        sampleRateHz,
        toneHz,
        durationMs
      }
    };
  }

  // synthesizeStream: 入参为流式 plan；输出统一 stream lifecycle 事件和一个 WAV 音频 chunk。
  async *synthesizeStream(plan: TTSStreamPlan): AsyncIterable<TTSStreamEvent> {
    const sampleRateHz = numberFromVendor(plan.vendorRequest.sampleRateHz, 24000);
    const toneHz = numberFromVendor(plan.vendorRequest.toneHz, 440);
    const durationMs = numberFromVendor(plan.vendorRequest.durationMs, 300);
    const audio = createSineWaveWav({
      sampleRateHz,
      toneHz,
      durationMs
    });

    yield {
      type: "session.started",
      sessionId: plan.planId,
      planId: plan.planId,
      sequence: 0
    };
    yield {
      type: "metadata",
      sequence: 1,
      payload: {
        providerRunId: createRunId(),
        protocol: "websocket",
        inputMode: "text_once",
        format: "wav",
        sampleRateHz,
        toneHz,
        durationMs
      }
    };
    yield {
      type: "audio.chunk",
      sequence: 2,
      data: audio,
      format: "wav",
      timestampMs: 0
    };
    yield {
      type: "session.completed",
      sequence: 3,
      durationMs
    };
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

function numberFromVendor(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

function createSineWaveWav(input: {
  sampleRateHz: number;
  toneHz: number;
  durationMs: number;
}): Uint8Array {
  const channelCount = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.max(1, Math.floor((input.sampleRateHz * input.durationMs) / 1000));
  const dataSize = sampleCount * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, input.sampleRateHz, true);
  view.setUint32(28, input.sampleRateHz * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const amplitude = 0.25 * 32767;
  for (let index = 0; index < sampleCount; index += 1) {
    const phase = (2 * Math.PI * input.toneHz * index) / input.sampleRateHz;
    const sample = Math.round(Math.sin(phase) * amplitude);
    view.setInt16(44 + index * bytesPerSample, sample, true);
  }

  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

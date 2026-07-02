import {
  TTSError,
  type AppliedCanonicalField,
  type AppliedVendorExtension,
  type Approximation,
  type IgnoredField,
  type JsonValue,
  type MappingReport,
  type TTSAdapter,
  type TTSOperation,
  type TTSOperationRequest,
  type TTSSyncPlan,
  type TTSSyncProviderResult,
  type TTSSyncRequest,
  type VendorDirectiveMode,
  type VendorExtensionSchema,
  type VendorPayload
} from "@tts-platform/core";
import { createPlanId, createRunId } from "../../utils/ids";
import { mockCapabilities, MOCK_ADAPTER_VERSION, MOCK_PROVIDER_ID } from "./capabilities";
import { mockExtensionSchema } from "./extension-schema";

const SUPPORTED_SAMPLE_RATES = [16000, 24000, 48000] as const;

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

  async plan(request: TTSOperationRequest): Promise<TTSSyncPlan> {
    if (request.operation !== "tts.sync") {
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

    const requestedFormat = request.output?.format ?? "wav";
    const actualFormat = requestedFormat === "wav" ? requestedFormat : "wav";
    const requestedSampleRate = request.output?.sampleRateHz ?? 24000;
    const actualSampleRate = nearestSampleRate(requestedSampleRate);
    const voice = request.voice.providerVoiceId ?? request.voice.voiceId ?? "mock-default-voice";
    const model = request.model ?? "mock-tts-v1";

    const appliedCanonicalFields: AppliedCanonicalField[] = [
      applied("text", request.text, "input.text"),
      applied("model", model, "model"),
      applied("voice", voice, "voice")
    ];

    if (request.voice.language !== undefined) {
      appliedCanonicalFields.push(applied("voice.language", request.voice.language, "language"));
    }
    if (request.controls?.speed !== undefined) {
      appliedCanonicalFields.push(applied("controls.speed", request.controls.speed, "speed"));
    }
    if (request.controls?.pitch !== undefined) {
      appliedCanonicalFields.push(applied("controls.pitch", request.controls.pitch, "pitchSemitones"));
    }
    if (request.controls?.volume !== undefined) {
      appliedCanonicalFields.push(applied("controls.volume", request.controls.volume, "volume"));
    }

    const approximations: Approximation[] = [];
    if (actualFormat !== requestedFormat) {
      approximations.push({
        field: "output.format",
        requestedValue: requestedFormat,
        actualValue: actualFormat,
        reason: "The mock adapter only emits wav audio."
      });
    }
    if (actualSampleRate !== requestedSampleRate) {
      approximations.push({
        field: "output.sampleRateHz",
        requestedValue: requestedSampleRate,
        actualValue: actualSampleRate,
        reason: "The requested sample rate was mapped to the nearest supported mock rate."
      });
    }

    const ignoredFields: IgnoredField[] = [];
    const appliedVendorExtensions: AppliedVendorExtension[] = [];
    const vendorRequest: VendorPayload = {
      input: {
        text: request.text
      },
      model,
      voice,
      language: request.voice.language ?? "en",
      format: actualFormat,
      sampleRateHz: actualSampleRate,
      speed: request.controls?.speed ?? 1,
      pitchSemitones: request.controls?.pitch ?? 0
    };

    if (request.controls?.volume !== undefined) {
      ignoredFields.push({
        field: "controls.volume",
        reason: "The mock adapter records this control but does not alter waveform gain."
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
}

function applied(field: string, value: JsonValue, vendorField: string): AppliedCanonicalField {
  return {
    field,
    value,
    vendorField
  };
}

function nearestSampleRate(requested: number): number {
  const first = SUPPORTED_SAMPLE_RATES[0];
  return SUPPORTED_SAMPLE_RATES.reduce((best, candidate) => {
    return Math.abs(candidate - requested) < Math.abs(best - requested) ? candidate : best;
  }, first);
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

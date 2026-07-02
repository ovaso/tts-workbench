import { TTSError, type TTSSyncRequest, type VendorDirective } from "@tts-platform/core";
import type { FastifyInstance } from "fastify";
import type { TTSFacade } from "../facade/tts-facade";

export async function registerSynthesizeRoutes(
  app: FastifyInstance,
  facade: TTSFacade
): Promise<void> {
  app.post("/v1/tts/sync", async (request, reply) => {
    const syncRequest = parseSyncRequest(request.body);
    const result = await facade.synthesizeSync(syncRequest);
    return reply.status(201).send(result);
  });
}

function parseSyncRequest(body: unknown): TTSSyncRequest {
  const input = requireObject(body, "request body");
  const providerId = requireString(input.providerId, "providerId");
  const text = requireString(input.text, "text");
  const voice = parseVoice(input.voice);

  const request: TTSSyncRequest = {
    operation: "tts.sync",
    providerId,
    text,
    voice
  };

  if (typeof input.operation === "string" && input.operation !== "tts.sync") {
    throw new TTSError("Only operation 'tts.sync' is accepted by this endpoint.", "invalid_request", 400);
  }
  if (typeof input.model === "string") {
    request.model = input.model;
  }
  const output = parseOutput(input.output);
  if (output !== undefined) {
    request.output = output;
  }
  const controls = parseControls(input.controls);
  if (controls !== undefined) {
    request.controls = controls;
  }
  const vendor = parseVendorDirective(input.vendor);
  if (vendor !== undefined) {
    request.vendor = vendor;
  }
  if (typeof input.clientRequestId === "string") {
    request.clientRequestId = input.clientRequestId;
  }

  return request;
}

function parseVoice(value: unknown): TTSSyncRequest["voice"] {
  const voice = requireObject(value, "voice");
  const parsed: TTSSyncRequest["voice"] = {};
  if (typeof voice.voiceId === "string") {
    parsed.voiceId = voice.voiceId;
  }
  if (typeof voice.providerVoiceId === "string") {
    parsed.providerVoiceId = voice.providerVoiceId;
  }
  if (typeof voice.language === "string") {
    parsed.language = voice.language;
  }
  if (parsed.voiceId === undefined && parsed.providerVoiceId === undefined) {
    throw new TTSError("voice.voiceId or voice.providerVoiceId is required.", "invalid_request", 400);
  }
  return parsed;
}

function parseOutput(value: unknown): TTSSyncRequest["output"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const output = requireObject(value, "output");
  const parsed: TTSSyncRequest["output"] = {};
  if (output.format !== undefined) {
    if (
      output.format !== "wav" &&
      output.format !== "mp3" &&
      output.format !== "ogg" &&
      output.format !== "pcm" &&
      output.format !== "flac" &&
      output.format !== "opus"
    ) {
      throw new TTSError("output.format is not supported.", "invalid_request", 400);
    }
    parsed.format = output.format;
  }
  if (output.sampleRateHz !== undefined) {
    if (typeof output.sampleRateHz !== "number" || !Number.isFinite(output.sampleRateHz)) {
      throw new TTSError("output.sampleRateHz must be a number.", "invalid_request", 400);
    }
    parsed.sampleRateHz = output.sampleRateHz;
  }
  if (output.bitrate !== undefined) {
    if (typeof output.bitrate !== "number" || !Number.isFinite(output.bitrate)) {
      throw new TTSError("output.bitrate must be a number.", "invalid_request", 400);
    }
    parsed.bitrate = output.bitrate;
  }
  if (output.channels !== undefined) {
    if (output.channels !== 1 && output.channels !== 2) {
      throw new TTSError("output.channels must be 1 or 2.", "invalid_request", 400);
    }
    parsed.channels = output.channels;
  }
  return parsed;
}

function parseControls(value: unknown): TTSSyncRequest["controls"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const controls = requireObject(value, "controls");
  const parsed: TTSSyncRequest["controls"] = {};
  for (const key of ["speed", "pitch", "volume"] as const) {
    if (controls[key] !== undefined) {
      if (typeof controls[key] !== "number" || !Number.isFinite(controls[key])) {
        throw new TTSError(`controls.${key} must be a number.`, "invalid_request", 400);
      }
      parsed[key] = controls[key];
    }
  }
  if (typeof controls.emotion === "string") {
    parsed.emotion = controls.emotion;
  }
  if (typeof controls.style === "string") {
    parsed.style = controls.style;
  }
  return parsed;
}

function parseVendorDirective(value: unknown): VendorDirective | undefined {
  if (value === undefined) {
    return undefined;
  }
  const vendor = requireObject(value, "vendor");
  const parsed: VendorDirective = {};
  if (vendor.mode !== undefined) {
    if (
      vendor.mode !== "canonical_only" &&
      vendor.mode !== "prefer_vendor" &&
      vendor.mode !== "vendor_required"
    ) {
      throw new TTSError("vendor.mode is invalid.", "invalid_request", 400);
    }
    parsed.mode = vendor.mode;
  }
  if (vendor.extensions !== undefined) {
    const extensions = requireObject(vendor.extensions, "vendor.extensions");
    parsed.extensions = {};
    for (const [providerId, rawExtension] of Object.entries(extensions)) {
      const extension = requireObject(rawExtension, `vendor.extensions.${providerId}`);
      const schemaVersion = requireString(
        extension.schemaVersion,
        `vendor.extensions.${providerId}.schemaVersion`
      );
      const params = requireObject(extension.params, `vendor.extensions.${providerId}.params`);
      parsed.extensions[providerId] = {
        schemaVersion,
        params
      };
    }
  }
  return parsed;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TTSError(`${label} must be an object.`, "invalid_request", 400);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TTSError(`${label} is required.`, "invalid_request", 400);
  }
  return value;
}

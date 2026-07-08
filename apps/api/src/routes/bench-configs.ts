import {
  TTSError,
  type BenchConfigCreateRequest,
  type BenchConfigSetCreateRequest,
  type TTSCanonicalControls,
  type TTSOutputPreferences,
  type TTSVoiceSelection,
  type VendorDirective
} from "@tts-platform/core";
import type { FastifyInstance } from "fastify";
import type { FileBenchConfigRegistry } from "../storage/bench-config-registry";

export async function registerBenchConfigRoutes(
  app: FastifyInstance,
  configs: FileBenchConfigRegistry
): Promise<void> {
  app.get("/v1/bench-configs", async () => {
    return {
      configs: configs.list()
    };
  });

  app.post("/v1/bench-configs", async (request, reply) => {
    const config = configs.save(parseBenchConfigCreateRequest(request.body));
    return reply.status(201).send({ config });
  });

  app.get("/v1/bench-config-sets", async () => {
    return {
      sets: configs.listSets()
    };
  });

  app.post("/v1/bench-config-sets", async (request, reply) => {
    const set = configs.saveSet(parseBenchConfigSetCreateRequest(request.body));
    return reply.status(201).send({ set });
  });
}

// parseBenchConfigCreateRequest: 入参为 HTTP body；输出可保存的 Benchmark 配置创建请求。
function parseBenchConfigCreateRequest(body: unknown): BenchConfigCreateRequest {
  const input = requireObject(body, "request body");
  const request: BenchConfigCreateRequest = {
    displayName: requireTrimmedString(input.displayName, "displayName"),
    providerId: requireTrimmedString(input.providerId, "providerId"),
    modelId: requireTrimmedString(input.modelId, "modelId"),
    voice: parseVoice(input.voice)
  };

  if (typeof input.description === "string" && input.description.trim().length > 0) {
    request.description = input.description.trim();
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
  return request;
}

// parseBenchConfigSetCreateRequest: 入参为 HTTP body；输出可保存的 Benchmark 配置组合创建请求。
function parseBenchConfigSetCreateRequest(body: unknown): BenchConfigSetCreateRequest {
  const input = requireObject(body, "request body");
  const request: BenchConfigSetCreateRequest = {
    name: requireTrimmedString(input.name, "name"),
    configIds: parseStringList(input.configIds, "configIds")
  };
  if (typeof input.description === "string" && input.description.trim().length > 0) {
    request.description = input.description.trim();
  }
  return request;
}

// parseVoice: 入参为未知 voice 对象；输出配置 tuple 使用的音色选择。
function parseVoice(value: unknown): TTSVoiceSelection {
  const voice = requireObject(value, "voice");
  const parsed: TTSVoiceSelection = {};
  if (typeof voice.voiceId === "string" && voice.voiceId.trim().length > 0) {
    parsed.voiceId = voice.voiceId.trim();
  }
  if (typeof voice.providerVoiceId === "string" && voice.providerVoiceId.trim().length > 0) {
    parsed.providerVoiceId = voice.providerVoiceId.trim();
  }
  if (typeof voice.language === "string" && voice.language.trim().length > 0) {
    parsed.language = voice.language.trim();
  }
  if (parsed.voiceId === undefined && parsed.providerVoiceId === undefined) {
    throw new TTSError("voice.voiceId or voice.providerVoiceId is required.", "invalid_request", 400);
  }
  return parsed;
}

// parseOutput: 入参为未知 output 对象；输出配置 tuple 使用的音频输出偏好。
function parseOutput(value: unknown): TTSOutputPreferences | undefined {
  if (value === undefined) {
    return undefined;
  }
  const output = requireObject(value, "output");
  const parsed: TTSOutputPreferences = {};
  if (output.format !== undefined) {
    if (!isOutputFormat(output.format)) {
      throw new TTSError("output.format is not supported.", "invalid_request", 400);
    }
    parsed.format = output.format;
  }
  if (output.sampleRateHz !== undefined) {
    parsed.sampleRateHz = requireNumber(output.sampleRateHz, "output.sampleRateHz");
  }
  if (output.bitrate !== undefined) {
    parsed.bitrate = requireNumber(output.bitrate, "output.bitrate");
  }
  if (output.channels !== undefined) {
    if (output.channels !== 1 && output.channels !== 2) {
      throw new TTSError("output.channels must be 1 or 2.", "invalid_request", 400);
    }
    parsed.channels = output.channels;
  }
  return parsed;
}

// parseControls: 入参为未知 controls 对象；输出配置 tuple 使用的通用控制参数。
function parseControls(value: unknown): TTSCanonicalControls | undefined {
  if (value === undefined) {
    return undefined;
  }
  const controls = requireObject(value, "controls");
  const parsed: TTSCanonicalControls = {};
  for (const key of ["speed", "pitch", "volume"] as const) {
    if (controls[key] !== undefined) {
      parsed[key] = requireNumber(controls[key], `controls.${key}`);
    }
  }
  if (typeof controls.emotion === "string" && controls.emotion.trim().length > 0) {
    parsed.emotion = controls.emotion.trim();
  }
  if (typeof controls.style === "string" && controls.style.trim().length > 0) {
    parsed.style = controls.style.trim();
  }
  return parsed;
}

// parseVendorDirective: 入参为未知 vendor 对象；输出配置 tuple 使用的厂商扩展指令。
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
    parsed.extensions = {};
    const extensions = requireObject(vendor.extensions, "vendor.extensions");
    for (const [providerId, rawExtension] of Object.entries(extensions)) {
      const extension = requireObject(rawExtension, `vendor.extensions.${providerId}`);
      parsed.extensions[providerId] = {
        schemaVersion: requireTrimmedString(extension.schemaVersion, `vendor.extensions.${providerId}.schemaVersion`),
        params: requireObject(extension.params, `vendor.extensions.${providerId}.params`)
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

// requireTrimmedString: 入参为未知值和字段名；输出 trim 后非空字符串。
function requireTrimmedString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TTSError(`${label} is required.`, "invalid_request", 400);
  }
  return value.trim();
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TTSError(`${label} must be a number.`, "invalid_request", 400);
  }
  return value;
}

// parseStringList: 入参为未知数组和字段名；输出 trim 后的非空字符串列表。
function parseStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new TTSError(`${label} must be an array.`, "invalid_request", 400);
  }
  return value.map((item, index) => requireTrimmedString(item, `${label}[${index}]`));
}

function isOutputFormat(value: unknown): value is NonNullable<TTSOutputPreferences["format"]> {
  return (
    value === "wav" ||
    value === "mp3" ||
    value === "ogg" ||
    value === "pcm" ||
    value === "flac" ||
    value === "opus"
  );
}

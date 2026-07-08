import {
  TTSError,
  type TTSOutputFormat,
  type TTSStreamEvent,
  type TTSSyncRequest,
  type TTSStreamRequest,
  type VoiceCloneInstantRequest,
  type VoiceCloneRequest,
  type VoiceCreateRequest,
  type VendorPayload,
  type VendorDirective
} from "@tts-platform/core";
import type { FastifyInstance } from "fastify";
import type { TTSFacade } from "../facade/tts-facade";
import type { FileRunArchive } from "../storage/run-archive";
import type { StreamSessionRegistry } from "../stream/stream-session-registry";

export async function registerSynthesizeRoutes(
  app: FastifyInstance,
  facade: TTSFacade,
  archive: FileRunArchive,
  streamSessions: StreamSessionRegistry
): Promise<void> {
  app.post("/v1/tts/sync", async (request, reply) => {
    const syncRequest = parseSyncRequest(request.body);
    const result = await facade.synthesizeSync(syncRequest);
    return reply.status(201).send(result);
  });

  app.post("/v1/tts/stream", async (request, reply) => {
    const streamRequest = parseStreamRequest(request.body);
    const prepared = await facade.prepareStream(streamRequest);
    const result = streamSessions.save(prepared, `/v1/tts/stream/${prepared.session.sessionId}/ws`);
    return reply.status(201).send(result.session);
  });

  app.get<{ Params: { sessionId: string } }>(
    "/v1/tts/stream/:sessionId/ws",
    { websocket: true },
    async (socket, request) => {
      const sessionId = decodeURIComponent(request.params.sessionId);
      const record = streamSessions.consume(sessionId);
      const vendorEvents: VendorPayload[] = [];
      const audioChunks: Uint8Array[] = [];
      let audioFormat: TTSOutputFormat | undefined;
      let closedByClient = false;
      let runStatus: "succeeded" | "failed" = "succeeded";
      let markClientReady: () => void = () => {};
      const clientReady = new Promise<void>((resolve) => {
        markClientReady = resolve;
      });
      let finalResponse: VendorPayload = {
        status: "started",
        sessionId
      };

      socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
        const event = parseDownstreamFrame(data);
        if (event === undefined) {
          return;
        }
        vendorEvents.push({
          direction: "downstream",
          event
        });
        if (event.type === "cancel") {
          closedByClient = true;
          socket.close(1000, "cancelled");
          markClientReady();
          return;
        }
        if (event.type === "client.ready") {
          markClientReady();
        }
      });
      socket.on("close", () => {
        closedByClient = true;
        markClientReady();
      });

      try {
        await clientReady;
        if (closedByClient) {
          return;
        }
        for await (const event of record.adapter.synthesizeStream(record.plan)) {
          vendorEvents.push(toArchiveStreamEvent(event));
          if (event.type === "audio.chunk") {
            audioChunks.push(event.data);
            audioFormat = event.format;
            if (isWebSocketOpen(socket.readyState)) {
              socket.send(Buffer.from(event.data));
            }
            continue;
          }

          if (event.type === "session.completed") {
            finalResponse = {
              status: "succeeded",
              event: toArchiveStreamEvent(event)
            };
          }
          if (event.type === "error") {
            runStatus = "failed";
            finalResponse = {
              status: "failed",
              event: toArchiveStreamEvent(event)
            };
          }
          if (isWebSocketOpen(socket.readyState)) {
            socket.send(JSON.stringify(toDownstreamStreamEvent(event)));
          }
        }

        await archive.writeStreamRun({
          request: record.request,
          plan: record.plan,
          vendorEvents,
          vendorResponse: finalResponse,
          status: runStatus,
          ...(audioChunks.length === 0 || audioFormat === undefined
            ? {}
            : {
                audio: {
                  data: concatBytes(audioChunks),
                  format: audioFormat,
                  sampleRateHz: sampleRateFromStreamPlan(record.plan.vendorRequest)
                }
              })
        });
        if (!closedByClient && isWebSocketOpen(socket.readyState)) {
          socket.close(1000, "completed");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Stream execution failed.";
        finalResponse = {
          status: "failed",
          message
        };
        vendorEvents.push({
          direction: "platform",
          type: "error",
          message
        });
        await archive.writeStreamRun({
          request: record.request,
          plan: record.plan,
          vendorEvents,
          vendorResponse: finalResponse,
          status: "failed",
          ...(audioChunks.length === 0 || audioFormat === undefined
            ? {}
            : {
                audio: {
                  data: concatBytes(audioChunks),
                  format: audioFormat,
                  sampleRateHz: sampleRateFromStreamPlan(record.plan.vendorRequest)
                }
              })
        });
        if (isWebSocketOpen(socket.readyState)) {
          socket.send(
            JSON.stringify({
              type: "error",
              sequence: vendorEvents.length,
              message
            })
          );
          socket.close(1011, "stream error");
        }
      } finally {
        streamSessions.delete(sessionId);
      }
    }
  );

  app.post(
    "/v1/voice-clones",
    {
      bodyLimit: 32 * 1024 * 1024
    },
    async (request, reply) => {
      const cloneRequest = parseVoiceCloneRequest(request.body);
      const result = await facade.createVoiceClone(cloneRequest);
      return reply.status(201).send(result);
    }
  );

  app.post(
    "/v1/voice-clones/instant",
    {
      bodyLimit: 32 * 1024 * 1024
    },
    async (request, reply) => {
      const cloneRequest = parseVoiceCloneInstantRequest(request.body);
      const result = await facade.createInstantVoiceClone(cloneRequest);
      return reply.status(201).send(result);
    }
  );

  app.get("/v1/voices", async (request) => {
    const query = requireObject(request.query, "query");
    const providerId = typeof query.providerId === "string" ? query.providerId : undefined;
    const modelId = typeof query.modelId === "string" ? query.modelId : undefined;
    return {
      voices: facade.listVoices({
        ...(providerId === undefined ? {} : { providerId }),
        ...(modelId === undefined ? {} : { modelId })
      })
    };
  });

  app.post("/v1/voices", async (request, reply) => {
    const voiceRequest = parseVoiceCreateRequest(request.body);
    const voice = facade.createVoice(voiceRequest);
    return reply.status(201).send({ voice });
  });

  app.delete<{ Params: { voiceId: string } }>("/v1/voices/:voiceId", async (request) => {
    const voiceId = decodeURIComponent(request.params.voiceId);
    return facade.deleteVoice(voiceId);
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
  if (typeof input.ssml === "string") {
    request.ssml = input.ssml;
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

function parseStreamRequest(body: unknown): TTSStreamRequest {
  const sync = parseSyncRequest({
    ...requireObject(body, "request body"),
    operation: "tts.sync"
  });
  const input = requireObject(body, "request body");
  const request: TTSStreamRequest = {
    ...sync,
    operation: "tts.stream"
  };
  const stream = parseStreamPreferences(input.stream);
  if (stream !== undefined) {
    request.stream = stream;
  }
  return request;
}

function parseVoiceCloneRequest(body: unknown): VoiceCloneRequest {
  const input = requireObject(body, "request body");
  const providerId = requireString(input.providerId, "providerId");
  const displayName = requireString(input.displayName, "displayName");
  const referenceAudio = parseReferenceAudioList(input.referenceAudio);
  const request: VoiceCloneRequest = {
    operation: "voice.clone.create",
    providerId,
    displayName,
    referenceAudio
  };
  if (typeof input.model === "string") {
    request.model = input.model;
  }
  if (typeof input.language === "string") {
    request.language = input.language;
  }
  const consent = parseVoiceCloneConsent(input.consent);
  if (consent !== undefined) {
    request.consent = consent;
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

// parseVoiceCloneInstantRequest: 入参为 HTTP body；输出即时音色复刻请求，执行后会直接生成音频 run。
function parseVoiceCloneInstantRequest(body: unknown): VoiceCloneInstantRequest {
  const input = requireObject(body, "request body");
  const providerId = requireString(input.providerId, "providerId");
  const text = requireString(input.text, "text");
  const request: VoiceCloneInstantRequest = {
    operation: "voice.clone.instant",
    providerId,
    text,
    referenceAudio: parseReferenceAudioList(input.referenceAudio)
  };

  if (typeof input.operation === "string" && input.operation !== "voice.clone.instant") {
    throw new TTSError("Only operation 'voice.clone.instant' is accepted by this endpoint.", "invalid_request", 400);
  }
  if (typeof input.model === "string") {
    request.model = input.model;
  }
  if (typeof input.language === "string") {
    request.language = input.language;
  }
  const output = parseOutput(input.output);
  if (output !== undefined) {
    request.output = output;
  }
  const controls = parseControls(input.controls);
  if (controls !== undefined) {
    request.controls = controls;
  }
  const consent = parseVoiceCloneConsent(input.consent);
  if (consent !== undefined) {
    request.consent = consent;
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

// parseReferenceAudioList: 入参为 HTTP body 中的 referenceAudio；输出 canonical reference audio 列表。
function parseReferenceAudioList(value: unknown): VoiceCloneRequest["referenceAudio"] {
  const referenceAudioInput = Array.isArray(value) ? value : [];
  return referenceAudioInput.map((item, index) => {
    const audio = requireObject(item, `referenceAudio[${index}]`);
    const parsed: VoiceCloneRequest["referenceAudio"][number] = {
      uri: typeof audio.uri === "string" ? audio.uri : ""
    };
    if (typeof audio.fileId === "string") {
      parsed.fileId = audio.fileId;
    }
    if (typeof audio.path === "string") {
      parsed.path = audio.path;
    }
    if (isReferenceAudioFormat(audio.format)) {
      parsed.format = audio.format;
    }
    if (typeof audio.durationMs === "number" && Number.isFinite(audio.durationMs)) {
      parsed.durationMs = audio.durationMs;
    }
    if (typeof audio.transcript === "string") {
      parsed.transcript = audio.transcript;
    }
    return parsed;
  });
}

// parseVoiceCloneConsent: 入参为 HTTP body 中的 consent；输出音色授权确认信息。
function parseVoiceCloneConsent(value: unknown): VoiceCloneRequest["consent"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const consent = requireObject(value, "consent");
  const parsed: VoiceCloneRequest["consent"] = {
    confirmed: consent.confirmed === true
  };
  if (typeof consent.speakerName === "string") {
    parsed.speakerName = consent.speakerName;
  }
  if (
    consent.usageScope === "internal_eval" ||
    consent.usageScope === "commercial" ||
    consent.usageScope === "research"
  ) {
    parsed.usageScope = consent.usageScope;
  }
  return parsed;
}

// parseVoiceCreateRequest: 入参为 HTTP body；输出手动登记到本地 registry 的音色请求。
function parseVoiceCreateRequest(body: unknown): VoiceCreateRequest {
  const input = requireObject(body, "request body");
  const providerId = requireTrimmedString(input.providerId, "providerId");
  const providerVoiceId = requireTrimmedString(input.providerVoiceId, "providerVoiceId");
  const displayName = requireTrimmedString(input.displayName, "displayName");
  const source = input.source === "vendor_builtin" ? "vendor_builtin" : "external";
  const request: VoiceCreateRequest = {
    providerId,
    providerVoiceId,
    displayName,
    source
  };
  if (typeof input.modelId === "string" && input.modelId.trim().length > 0) {
    request.modelId = input.modelId.trim();
  }
  if (typeof input.language === "string" && input.language.trim().length > 0) {
    request.language = input.language.trim();
  }
  if (input.vendorMetadata !== undefined) {
    request.vendorMetadata = requireObject(input.vendorMetadata, "vendorMetadata");
  }
  return request;
}

function isReferenceAudioFormat(value: unknown): value is NonNullable<VoiceCloneRequest["referenceAudio"][number]["format"]> {
  return (
    value === "wav" ||
    value === "mp3" ||
    value === "ogg" ||
    value === "pcm" ||
    value === "flac" ||
    value === "opus" ||
    value === "m4a"
  );
}

function parseVoice(value: unknown): TTSSyncRequest["voice"] {
  const voice = requireObject(value, "voice");
  const parsed: TTSSyncRequest["voice"] = {};
  if (typeof voice.voiceId === "string" && voice.voiceId.trim().length > 0) {
    parsed.voiceId = voice.voiceId;
  }
  if (typeof voice.providerVoiceId === "string" && voice.providerVoiceId.trim().length > 0) {
    parsed.providerVoiceId = voice.providerVoiceId;
  }
  if (typeof voice.language === "string" && voice.language.trim().length > 0) {
    parsed.language = voice.language;
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

function parseStreamPreferences(value: unknown): TTSStreamRequest["stream"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const stream = requireObject(value, "stream");
  const parsed: TTSStreamRequest["stream"] = {};
  if (
    stream.protocol === "websocket" ||
    stream.protocol === "sse" ||
    stream.protocol === "http_chunk"
  ) {
    parsed.protocol = stream.protocol;
  }
  if (
    stream.chunkFormat === "mp3" ||
    stream.chunkFormat === "wav" ||
    stream.chunkFormat === "flac" ||
    stream.chunkFormat === "ogg" ||
    stream.chunkFormat === "pcm" ||
    stream.chunkFormat === "opus"
  ) {
    parsed.chunkFormat = stream.chunkFormat;
  }
  if (typeof stream.enableTimestamps === "boolean") {
    parsed.enableTimestamps = stream.enableTimestamps;
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

// parseDownstreamFrame: 入参为下游 WebSocket 消息；输出可归档的平台控制事件。
function parseDownstreamFrame(data: Buffer | ArrayBuffer | Buffer[]): VendorPayload | undefined {
  if (Array.isArray(data)) {
    return undefined;
  }
  const text = Buffer.isBuffer(data) ? data.toString("utf8") : Buffer.from(data).toString("utf8");
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as VendorPayload)
      : undefined;
  } catch {
    return undefined;
  }
}

// toDownstreamStreamEvent: 入参为统一流式事件；输出下游 WebSocket JSON 事件。
function toDownstreamStreamEvent(event: TTSStreamEvent): VendorPayload {
  if (event.type === "audio.chunk") {
    return {
      type: event.type,
      sequence: event.sequence,
      byteLength: event.data.byteLength,
      format: event.format,
      ...(event.timestampMs === undefined ? {} : { timestampMs: event.timestampMs })
    };
  }
  return event;
}

// toArchiveStreamEvent: 入参为统一流式事件；输出去除大块音频正文后的归档事件。
function toArchiveStreamEvent(event: TTSStreamEvent): VendorPayload {
  if (event.type === "audio.chunk") {
    return {
      type: event.type,
      sequence: event.sequence,
      byteLength: event.data.byteLength,
      format: event.format,
      ...(event.timestampMs === undefined ? {} : { timestampMs: event.timestampMs })
    };
  }
  return event;
}

// concatBytes: 入参为多个 Uint8Array；输出按顺序拼接后的字节数组。
function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

// sampleRateFromStreamPlan: 入参为 vendorRequest；输出流式归档音频的采样率。
function sampleRateFromStreamPlan(vendorRequest: VendorPayload): number {
  return typeof vendorRequest.sampleRateHz === "number" && Number.isFinite(vendorRequest.sampleRateHz)
    ? vendorRequest.sampleRateHz
    : 24000;
}

// isWebSocketOpen: 入参为 ws readyState；输出连接是否仍可发送数据。
function isWebSocketOpen(readyState: number): boolean {
  return readyState === 1;
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

// requireTrimmedString: 入参为未知值和字段名；输出 trim 后非空字符串，否则抛出请求错误。
function requireTrimmedString(value: unknown, label: string): string {
  const parsed = requireString(value, label).trim();
  if (parsed.length === 0) {
    throw new TTSError(`${label} is required.`, "invalid_request", 400);
  }
  return parsed;
}

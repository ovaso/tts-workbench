export const REALTIME_SIMULATOR_MODELS = {
  douBaoV3Bidirection: {
    label: "豆包 V3 双向流",
    modelParam: "seed-tts-1.0",
    voiceParam: "zh_male_lengkugege_emo_v2_mars_bigtts",
    requiresModel: true,
    requiresVoice: true
  },
  elevenLabsRealtime: {
    label: "ElevenLabs Realtime",
    modelParam: "eleven_flash_v2_5",
    voiceParam: "",
    requiresModel: false,
    requiresVoice: true
  },
  myVocalRealtime: {
    label: "MyVocal Realtime",
    modelParam: "flash_v2_5",
    voiceParam: "",
    requiresModel: false,
    requiresVoice: true
  },
  lightningRealtime: {
    label: "Lightning Realtime",
    modelParam: "Lightning-TTS-Turbo-1.5",
    voiceParam: "default",
    requiresModel: false,
    requiresVoice: false
  },
  minimaxRealtime: {
    label: "MiniMax Realtime",
    modelParam: "speech-2.8-hd",
    voiceParam: "male-qn-qingse",
    requiresModel: true,
    requiresVoice: true
  },
  cosyVoice: {
    label: "阿里 CosyVoice",
    modelParam: "cosyvoice-v3.5-plus",
    voiceParam: "longxiaochun",
    requiresModel: false,
    requiresVoice: true
  }
} as const;

export type RealtimeSimulatorModelName = keyof typeof REALTIME_SIMULATOR_MODELS;
export type RealtimeSimulatorAudioFormat = "pcm" | "wav";

export interface RealtimeSimulatorParameters {
  format: RealtimeSimulatorAudioFormat;
  sampleRate: number;
  speechRate: number;
  voice?: string;
}

export interface RealtimeSimulatorStartSessionMessage {
  eventType: "start_session";
  eventId: string;
  modelName: RealtimeSimulatorModelName;
  callId: string;
  parameters: RealtimeSimulatorParameters;
}

export interface RealtimeSimulatorTextTaskMessage {
  eventType: "text_task_request";
  eventId: string;
  modelName: RealtimeSimulatorModelName;
  callId: string;
  text: string;
  sentenceStart: 0 | 1;
  parameters: RealtimeSimulatorParameters;
}

export interface RealtimeSimulatorSentenceEndMessage {
  eventType: "sentence_end";
  eventId: string;
  modelName: RealtimeSimulatorModelName;
  callId: string;
}

export type RealtimeSimulatorOutboundMessage =
  | RealtimeSimulatorStartSessionMessage
  | RealtimeSimulatorTextTaskMessage
  | RealtimeSimulatorSentenceEndMessage;

export type RealtimeSimulatorBridgeMessage =
  | {
      type: "bridge_open";
      connectionLatencyMs: number;
      target: string;
    }
  | {
      type: "proxy_text";
      payload: string;
    }
  | {
      type: "bridge_error";
      message: string;
    }
  | {
      type: "bridge_close";
      code: number;
      reason: string;
    };

export interface RealtimeSimulatorProxyEvent {
  eventType: string;
  raw: string;
}

export interface RealtimeSimulatorLayout {
  connectionColumns: number;
  textColumns: number;
  timelineColumns: number;
}

// createRealtimeSimulatorCallId: 入参为可选时间戳；输出仿真通话 ID。
export function createRealtimeSimulatorCallId(now = Date.now()): string {
  return `sim-${now}`;
}

// createRealtimeSimulatorEventId: 入参为可选时间戳和随机片段；输出单次合成事件 ID。
export function createRealtimeSimulatorEventId(
  now = Date.now(),
  randomPart = Math.random().toString(16).slice(2, 8)
): string {
  return `evt-${now}-${randomPart}`;
}

// realtimeSimulatorLayout: 无入参；输出桌面主卡片等分、时间线独占整行的 Vuetify 栅格配置。
export function realtimeSimulatorLayout(): RealtimeSimulatorLayout {
  return {
    connectionColumns: 6,
    textColumns: 6,
    timelineColumns: 12
  };
}

// realtimeSimulatorModelItems: 无入参；输出供 Vuetify 下拉框使用的模型选项。
export function realtimeSimulatorModelItems(): Array<{
  title: string;
  value: RealtimeSimulatorModelName;
}> {
  return Object.entries(REALTIME_SIMULATOR_MODELS).map(([value, definition]) => ({
    title: definition.label,
    value: value as RealtimeSimulatorModelName
  }));
}

// validateRealtimeSimulatorModelConfig: 入参为模型及厂商参数；输出全部校验错误。
export function validateRealtimeSimulatorModelConfig(
  modelName: RealtimeSimulatorModelName,
  modelParam: string,
  voiceParam: string
): string[] {
  const definition = REALTIME_SIMULATOR_MODELS[modelName];
  const errors: string[] = [];
  if (definition.requiresModel && modelParam.trim().length === 0) {
    errors.push(`${definition.label} 必须填写模型参数`);
  }
  if (definition.requiresVoice && voiceParam.trim().length === 0) {
    errors.push(`${definition.label} 必须填写音色参数`);
  }
  return errors;
}

// buildRealtimeSimulatorProxyUrl: 入参为连接表单字段；输出带模型、音色和 Call ID 的上游地址。
export function buildRealtimeSimulatorProxyUrl(input: {
  endpoint: string;
  modelName: RealtimeSimulatorModelName;
  modelParam: string;
  voiceParam: string;
  callId: string;
}): string {
  const url = new URL(input.endpoint);
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("代理地址必须以 ws:// 或 wss:// 开头");
  }
  url.searchParams.set("modelName", input.modelName);
  setOptionalSearchParam(url, "modelParam", input.modelParam);
  setOptionalSearchParam(url, "voiceParam", input.voiceParam);
  url.searchParams.set("callId", input.callId);
  return url.toString();
}

// buildRealtimeSimulatorParameters: 入参为音频表单字段；输出代理 ParameterDTO 对应对象。
export function buildRealtimeSimulatorParameters(input: {
  format: RealtimeSimulatorAudioFormat;
  sampleRate: number;
  speechRate: number;
  voiceParam: string;
}): RealtimeSimulatorParameters {
  return {
    format: input.format,
    sampleRate: Number(input.sampleRate),
    speechRate: Number(input.speechRate),
    ...(input.voiceParam.trim().length > 0 ? { voice: input.voiceParam.trim() } : {})
  };
}

// buildRealtimeSimulatorStartMessage: 入参为事件公共字段与音频参数；输出 start_session 消息。
export function buildRealtimeSimulatorStartMessage(input: {
  eventId: string;
  modelName: RealtimeSimulatorModelName;
  callId: string;
  parameters: RealtimeSimulatorParameters;
}): RealtimeSimulatorStartSessionMessage {
  return {
    eventType: "start_session",
    ...input
  };
}

// splitRealtimeSimulatorText: 入参为原始文本和分块策略；输出保留空行的文本块。
export function splitRealtimeSimulatorText(text: string, splitByLine: boolean): string[] {
  const source = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (source.length === 0) {
    return [];
  }
  return splitByLine ? source.split("\n") : [source];
}

// buildRealtimeSimulatorTextMessages: 入参为文本块与公共字段；输出逐块 text_task_request 消息。
export function buildRealtimeSimulatorTextMessages(input: {
  chunks: string[];
  eventId: string;
  modelName: RealtimeSimulatorModelName;
  callId: string;
  parameters: RealtimeSimulatorParameters;
}): RealtimeSimulatorTextTaskMessage[] {
  const firstContentIndex = input.chunks.findIndex((text) => text.trim().length > 0);
  return input.chunks.map((text, index) => ({
    eventType: "text_task_request",
    eventId: input.eventId,
    modelName: input.modelName,
    callId: input.callId,
    text,
    sentenceStart: index === (firstContentIndex >= 0 ? firstContentIndex : 0) ? 1 : 0,
    parameters: input.parameters
  }));
}

// buildRealtimeSimulatorSentenceEndMessage: 入参为事件公共字段；输出 sentence_end 消息。
export function buildRealtimeSimulatorSentenceEndMessage(input: {
  eventId: string;
  modelName: RealtimeSimulatorModelName;
  callId: string;
}): RealtimeSimulatorSentenceEndMessage {
  return {
    eventType: "sentence_end",
    ...input
  };
}

// resolveRealtimeSimulatorPlaybackRate: 入参为模型和页面采样率；输出代理实际 PCM 播放采样率。
export function resolveRealtimeSimulatorPlaybackRate(
  modelName: RealtimeSimulatorModelName,
  selectedSampleRate: number
): number {
  if (
    ["elevenLabsRealtime", "myVocalRealtime", "lightningRealtime", "minimaxRealtime"].includes(
      modelName
    )
  ) {
    return 8000;
  }
  return Number(selectedSampleRate);
}

// calculateRealtimeSimulatorPcmDurationMs: 入参为 PCM 字节数和采样率；输出单声道 S16LE 时长。
export function calculateRealtimeSimulatorPcmDurationMs(
  byteLength: number,
  sampleRate: number
): number {
  if (byteLength <= 0 || sampleRate <= 0) {
    return 0;
  }
  return (byteLength / (sampleRate * 2)) * 1000;
}

// calculateRealtimeSimulatorRtf: 入参为合成耗时与音频时长；输出实时率，无法计算时返回空值。
export function calculateRealtimeSimulatorRtf(
  synthesisMs: number,
  audioDurationMs: number
): number | undefined {
  if (synthesisMs <= 0 || audioDurationMs <= 0) {
    return undefined;
  }
  return synthesisMs / audioDurationMs;
}

// concatenateRealtimeSimulatorAudio: 入参为多个音频字节块；输出按接收顺序合并后的字节数组。
export function concatenateRealtimeSimulatorAudio(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

// createRealtimeSimulatorWav: 入参为裸 PCM S16LE 单声道字节和采样率；输出带标准 RIFF 头的 WAV。
export function createRealtimeSimulatorWav(pcmBytes: Uint8Array, sampleRate: number): Uint8Array {
  const headerLength = 44;
  const bytesPerSample = 2;
  const channelCount = 1;
  const wavBytes = new Uint8Array(headerLength + pcmBytes.byteLength);
  const view = new DataView(wavBytes.buffer);

  // 按 RIFF/WAVE 规范写入文件头、PCM 格式块和数据块长度。
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + pcmBytes.byteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, pcmBytes.byteLength, true);
  wavBytes.set(pcmBytes, headerLength);
  return wavBytes;
}

// parseRealtimeSimulatorBridgeMessage: 入参为桥接文本帧；输出通过字段校验的控制消息。
export function parseRealtimeSimulatorBridgeMessage(
  raw: string
): RealtimeSimulatorBridgeMessage | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const message = parsed as {
      type?: unknown;
      connectionLatencyMs?: unknown;
      target?: unknown;
      payload?: unknown;
      message?: unknown;
      code?: unknown;
      reason?: unknown;
    };
    if (
      message.type === "bridge_open" &&
      typeof message.connectionLatencyMs === "number" &&
      typeof message.target === "string"
    ) {
      return {
        type: "bridge_open",
        connectionLatencyMs: message.connectionLatencyMs,
        target: message.target
      };
    }
    if (message.type === "proxy_text" && typeof message.payload === "string") {
      return { type: "proxy_text", payload: message.payload };
    }
    if (message.type === "bridge_error" && typeof message.message === "string") {
      return { type: "bridge_error", message: message.message };
    }
    if (
      message.type === "bridge_close" &&
      typeof message.code === "number" &&
      typeof message.reason === "string"
    ) {
      return { type: "bridge_close", code: message.code, reason: message.reason };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// parseRealtimeSimulatorProxyEvent: 入参为代理文本帧；输出事件名和保留的原始 JSON。
export function parseRealtimeSimulatorProxyEvent(raw: string): RealtimeSimulatorProxyEvent {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const eventType = (parsed as { eventType?: unknown }).eventType;
      return {
        eventType: typeof eventType === "string" ? eventType : "proxy_event",
        raw: JSON.stringify(parsed, null, 2)
      };
    }
  } catch {
    // 非 JSON 文本仍保留在时间线中，便于审计代理的原始返回。
  }
  return {
    eventType: "proxy_text",
    raw
  };
}

// formatRealtimeSimulatorMilliseconds: 入参为毫秒值；输出指标展示文本。
export function formatRealtimeSimulatorMilliseconds(value?: number): string {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? `${Math.round(value)} ms`
    : "—";
}

// formatRealtimeSimulatorBytes: 入参为字节数；输出易读容量文本。
export function formatRealtimeSimulatorBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// truncateRealtimeSimulatorTimelinePayload: 入参为时间线正文；输出限制长度后的审计文本。
export function truncateRealtimeSimulatorTimelinePayload(value: string, maximumLength = 720): string {
  return value.length > maximumLength ? `${value.slice(0, maximumLength)}…` : value;
}

// setOptionalSearchParam: 入参为 URL、参数名和值；功能是只保留非空查询参数。
function setOptionalSearchParam(url: URL, name: string, value: string): void {
  if (value.trim().length > 0) {
    url.searchParams.set(name, value.trim());
  } else {
    url.searchParams.delete(name);
  }
}

// writeAscii: 入参为 DataView、偏移和文本；功能是向 WAV 头写入 ASCII 字节。
function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

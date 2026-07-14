<template>
  <section class="page-shell realtime-simulator-page">
    <v-card class="simulator-hero" elevation="0">
      <div>
        <div class="simulator-eyebrow">FreeSWITCH · aicc-tts-proxy</div>
        <h1>实时仿真</h1>
        <p>独立模拟会话握手、流式文本下发和 PCM 音频回传，不经过 Workbench Facade。</p>
      </div>
      <div class="simulator-hero-actions">
        <v-chip :color="connectionColor" :prepend-icon="connectionIcon" variant="tonal">
          {{ connectionLabel }}
        </v-chip>
        <v-btn
          color="primary"
          prepend-icon="mdi-lan-connect"
          :loading="connecting"
          variant="flat"
          @click="connectFromButton"
        >
          {{ proxyReady ? "重新连接" : "连接代理" }}
        </v-btn>
      </div>
    </v-card>

    <v-alert v-if="error" class="mt-4" closable type="error" variant="tonal" @click:close="error = ''">
      {{ error }}
    </v-alert>

    <div class="simulator-metrics" aria-label="实时仿真指标">
      <v-card v-for="metric in metricItems" :key="metric.label" class="simulator-metric" elevation="0">
        <v-icon :color="metric.color" :icon="metric.icon" size="22" />
        <div>
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
          <small>{{ metric.note }}</small>
        </div>
      </v-card>
    </div>

    <v-row class="simulator-primary-row mt-1" align="stretch">
      <v-col class="simulator-primary-column" cols="12" :lg="layout.connectionColumns">
        <v-card class="simulator-card simulator-primary-card" elevation="0">
          <v-card-title class="simulator-card-title">
            <span><v-icon icon="mdi-tune-variant" /> 连接与模型</span>
            <v-chip size="small" variant="outlined">本地桥接</v-chip>
          </v-card-title>
          <v-card-text>
            <v-text-field
              v-model="endpoint"
              label="代理 WebSocket 地址"
              prepend-inner-icon="mdi-web"
              variant="outlined"
            />
            <v-row>
              <v-col cols="12" md="6">
                <v-select
                  v-model="modelName"
                  :items="modelItems"
                  label="模型路由"
                  prepend-inner-icon="mdi-router-wireless"
                  variant="outlined"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="callId"
                  label="Call ID"
                  prepend-inner-icon="mdi-identifier"
                  variant="outlined"
                >
                  <template #append-inner>
                    <v-btn
                      aria-label="刷新 Call ID"
                      icon="mdi-refresh"
                      size="small"
                      variant="text"
                      @click="callId = createRealtimeSimulatorCallId()"
                    />
                  </template>
                </v-text-field>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="modelParam"
                  :hint="currentModel.requiresModel ? '当前模型必填' : '当前模型可选'"
                  label="模型参数"
                  persistent-hint
                  variant="outlined"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="voiceParam"
                  :hint="currentModel.requiresVoice ? '当前模型必填' : '当前模型可选'"
                  label="音色参数"
                  persistent-hint
                  variant="outlined"
                />
              </v-col>
            </v-row>
            <v-text-field
              v-model="apiKey"
              autocomplete="off"
              hint="只保存在当前页面内存，并仅用于本次桥接握手。"
              label="Authorization API Key"
              persistent-hint
              prepend-inner-icon="mdi-key-outline"
              type="password"
              variant="outlined"
            />

            <v-divider class="my-5" />

            <div class="simulator-section-heading">
              <div>
                <h2>音频参数</h2>
                <p>PCM 按 S16LE 单声道实时播放；WAV 模式只收集并导出。</p>
              </div>
            </div>
            <v-row>
              <v-col cols="12" sm="4">
                <v-select v-model="format" :items="formatItems" label="返回格式" variant="outlined" />
              </v-col>
              <v-col cols="12" sm="4">
                <v-select
                  v-model.number="sampleRate"
                  :items="sampleRateItems"
                  label="请求采样率"
                  variant="outlined"
                />
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field
                  v-model.number="chunkDelay"
                  label="分块间隔 (ms)"
                  min="0"
                  step="20"
                  type="number"
                  variant="outlined"
                />
              </v-col>
            </v-row>
            <div class="simulator-slider-row">
              <div>
                <span>语速</span>
                <strong>{{ speechRate.toFixed(2) }}×</strong>
              </div>
              <v-slider
                v-model="speechRate"
                color="primary"
                hide-details
                max="2"
                min="0.5"
                step="0.05"
                thumb-label
              />
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col class="simulator-primary-column" cols="12" :lg="layout.textColumns">
        <v-card class="simulator-card simulator-primary-card simulator-compose-card" elevation="0">
          <v-card-title class="simulator-card-title">
            <span><v-icon icon="mdi-message-processing-outline" /> 文本流</span>
            <div class="simulator-stage-chips">
              <v-chip color="primary" size="small" variant="tonal">{{ requestState }}</v-chip>
              <v-chip v-if="eventId" size="small" variant="outlined">{{ eventId }}</v-chip>
            </div>
          </v-card-title>
          <v-card-text class="simulator-compose-body">
            <v-textarea
              v-model="textInput"
              auto-grow
              counter
              label="合成文本"
              placeholder="输入需要模拟 FreeSWITCH 下发的文本"
              rows="7"
              variant="outlined"
            />
            <div class="simulator-compose-options">
              <v-switch
                v-model="splitByLine"
                color="primary"
                hide-details
                inset
                label="按行发送（保留空行）"
              />
              <span>实际播放：{{ playbackSampleRate }} Hz</span>
            </div>
          </v-card-text>
          <v-card-actions class="simulator-actions">
            <v-btn
              color="primary"
              prepend-icon="mdi-play-circle-outline"
              :loading="synthesizing"
              variant="flat"
              @click="synthesizeAndPlay"
            >
              开始仿真
            </v-btn>
            <v-btn prepend-icon="mdi-stop-circle-outline" variant="outlined" @click="stopLocalPlayback">
              停止本地播放
            </v-btn>
            <v-spacer />
            <v-btn
              :disabled="audioChunks.length === 0"
              prepend-icon="mdi-download"
              variant="text"
              @click="exportCurrentAudio"
            >
              导出 WAV
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <v-row class="mt-1">
      <v-col :cols="layout.timelineColumns">
        <v-card class="simulator-card simulator-timeline-card" elevation="0">
          <v-card-title class="simulator-card-title">
            <span><v-icon icon="mdi-timeline-text-outline" /> 协议时间线</span>
            <v-btn icon="mdi-delete-sweep-outline" size="small" variant="text" @click="clearTimeline" />
          </v-card-title>
          <v-card-subtitle>保留上下行协议、桥接状态和音频进度，不记录 API Key。</v-card-subtitle>
          <v-card-text class="simulator-timeline">
            <div v-if="timeline.length === 0" class="simulator-empty-timeline">
              <v-icon color="primary" icon="mdi-access-point-network-off" size="38" />
              <strong>等待仿真事件</strong>
              <span>连接代理并开始仿真后，事件将按时间顺序显示。</span>
            </div>
            <div
              v-for="entry in timeline"
              v-else
              :key="entry.id"
              :class="['simulator-timeline-entry', `is-${entry.kind}`]"
            >
              <div class="simulator-timeline-marker">
                <v-icon :icon="timelineIcon(entry.kind)" size="16" />
              </div>
              <div class="simulator-timeline-content">
                <div>
                  <strong>{{ entry.type }}</strong>
                  <time>{{ entry.timestamp }}</time>
                </div>
                <pre>{{ entry.payload }}</pre>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { webSocketUrl } from "../api/client";
import { RealtimeSimulatorPcmPlayer } from "./realtime-simulator-audio";
import {
  REALTIME_SIMULATOR_MODELS,
  buildRealtimeSimulatorParameters,
  buildRealtimeSimulatorProxyUrl,
  buildRealtimeSimulatorSentenceEndMessage,
  buildRealtimeSimulatorStartMessage,
  buildRealtimeSimulatorTextMessages,
  calculateRealtimeSimulatorPcmDurationMs,
  calculateRealtimeSimulatorRtf,
  concatenateRealtimeSimulatorAudio,
  createRealtimeSimulatorCallId,
  createRealtimeSimulatorEventId,
  createRealtimeSimulatorWav,
  formatRealtimeSimulatorBytes,
  formatRealtimeSimulatorMilliseconds,
  parseRealtimeSimulatorBridgeMessage,
  parseRealtimeSimulatorProxyEvent,
  realtimeSimulatorLayout,
  realtimeSimulatorModelItems,
  resolveRealtimeSimulatorPlaybackRate,
  splitRealtimeSimulatorText,
  truncateRealtimeSimulatorTimelinePayload,
  validateRealtimeSimulatorModelConfig,
  type RealtimeSimulatorAudioFormat,
  type RealtimeSimulatorModelName,
  type RealtimeSimulatorOutboundMessage
} from "./realtime-simulator";

type TimelineKind = "send" | "receive" | "audio" | "error" | "system";

interface TimelineEntry {
  id: number;
  kind: TimelineKind;
  type: string;
  timestamp: string;
  payload: string;
}

interface EventWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: number;
}

const endpoint = ref("ws://127.0.0.1:8887/api/general/tts");
const modelName = ref<RealtimeSimulatorModelName>("douBaoV3Bidirection");
const callId = ref(createRealtimeSimulatorCallId());
const modelParam = ref<string>(REALTIME_SIMULATOR_MODELS.douBaoV3Bidirection.modelParam);
const voiceParam = ref<string>(REALTIME_SIMULATOR_MODELS.douBaoV3Bidirection.voiceParam);
const apiKey = ref("");
const format = ref<RealtimeSimulatorAudioFormat>("pcm");
const sampleRate = ref(8000);
const speechRate = ref(1);
const chunkDelay = ref(120);
const splitByLine = ref(true);
const textInput = ref("你好，这是一段实时语音仿真测试。\n系统会按行发送文本并播放返回的 PCM 音频。");
const connectionState = ref<"offline" | "connecting" | "online" | "error">("offline");
const requestState = ref("IDLE");
const eventId = ref("");
const connectedTarget = ref("");
const connecting = ref(false);
const synthesizing = ref(false);
const proxyReady = ref(false);
const error = ref("");
const connectionLatencyMs = ref<number>();
const sessionLatencyMs = ref<number>();
const firstPacketLatencyMs = ref<number>();
const synthesisLatencyMs = ref<number>();
const audioByteLength = ref(0);
const audioChunkCount = ref(0);
const audioChunks = ref<Uint8Array[]>([]);
const timeline = ref<TimelineEntry[]>([]);

const modelItems = realtimeSimulatorModelItems();
const layout = realtimeSimulatorLayout();
const formatItems = [
  { title: "PCM S16LE", value: "pcm" },
  { title: "WAV", value: "wav" }
];
const sampleRateItems = [8000, 16000, 24000, 32000, 48000];
const currentModel = computed(() => REALTIME_SIMULATOR_MODELS[modelName.value]);
const playbackSampleRate = computed(() =>
  resolveRealtimeSimulatorPlaybackRate(modelName.value, sampleRate.value)
);
const audioDurationMs = computed(() =>
  format.value === "pcm"
    ? calculateRealtimeSimulatorPcmDurationMs(audioByteLength.value, playbackSampleRate.value)
    : 0
);
const realtimeFactor = computed(() =>
  calculateRealtimeSimulatorRtf(synthesisLatencyMs.value ?? 0, audioDurationMs.value)
);
const connectionLabel = computed(() => {
  if (connectionState.value === "connecting") return "正在连接";
  if (connectionState.value === "online") return "代理已连接";
  if (connectionState.value === "error") return "连接异常";
  return "未连接";
});
const connectionColor = computed(() => {
  if (connectionState.value === "online") return "success";
  if (connectionState.value === "connecting") return "warning";
  if (connectionState.value === "error") return "error";
  return "default";
});
const connectionIcon = computed(() => {
  if (connectionState.value === "online") return "mdi-lan-check";
  if (connectionState.value === "connecting") return "mdi-lan-pending";
  if (connectionState.value === "error") return "mdi-lan-disconnect";
  return "mdi-lan";
});
const metricItems = computed(() => [
  {
    label: "WS 连接",
    value: formatRealtimeSimulatorMilliseconds(connectionLatencyMs.value),
    note: "含上游握手",
    icon: "mdi-lan-connect",
    color: "primary"
  },
  {
    label: "会话启动",
    value: formatRealtimeSimulatorMilliseconds(sessionLatencyMs.value),
    note: "start → started",
    icon: "mdi-timer-play-outline",
    color: "secondary"
  },
  {
    label: "首包延迟",
    value: formatRealtimeSimulatorMilliseconds(firstPacketLatencyMs.value),
    note: "text → audio",
    icon: "mdi-flash-outline",
    color: "warning"
  },
  {
    label: "合成耗时",
    value: formatRealtimeSimulatorMilliseconds(synthesisLatencyMs.value),
    note: "text → sentence_end",
    icon: "mdi-timer-music-outline",
    color: "info"
  },
  {
    label: "音频数据",
    value: formatRealtimeSimulatorBytes(audioByteLength.value),
    note: `${audioChunkCount.value} chunks`,
    icon: "mdi-waveform",
    color: "accent"
  },
  {
    label: "RTF",
    value: realtimeFactor.value === undefined ? "—" : realtimeFactor.value.toFixed(3),
    note: format.value === "pcm" ? `${(audioDurationMs.value / 1000).toFixed(2)}s audio` : "WAV 不估算",
    icon: "mdi-speedometer",
    color: "success"
  }
]);

const pcmPlayer = new RealtimeSimulatorPcmPlayer();
const eventWaiters = new Map<string, EventWaiter[]>();
let bridgeSocket: WebSocket | undefined;
let connectingPromise: Promise<void> | undefined;
let timelineSequence = 0;
let sessionSentAt = 0;
let firstTextSentAt = 0;
let firstAudioAt = 0;

watch(modelName, (nextModelName) => {
  const definition = REALTIME_SIMULATOR_MODELS[nextModelName];
  modelParam.value = definition.modelParam;
  voiceParam.value = definition.voiceParam;
});

// connectFromButton: 无入参；功能是处理用户主动连接并把失败留在页面错误态，避免产生未处理 Promise。
function connectFromButton(): void {
  connectProxy().catch(() => undefined);
}

// connectProxy: 无入参；功能是连接 API 桥接并让桥接携带当前临时密钥连接上游代理。
async function connectProxy(): Promise<void> {
  error.value = "";
  connecting.value = true;
  try {
    const proxyUrl = currentProxyUrl();
    closeBridgeSocket("page reconnect");
    connectionState.value = "connecting";
    addTimeline("system", "connecting", proxyUrl);

    connectingPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(webSocketUrl("/v1/realtime-simulator/bridge"));
      bridgeSocket = socket;
      socket.binaryType = "arraybuffer";
      const timeout = window.setTimeout(() => {
        reject(new Error("连接代理超时（25 秒）"));
        closeBridgeSocket("connection timeout");
      }, 25_000);

      socket.addEventListener("open", () => {
        socket.send(
          JSON.stringify({
            type: "connect",
            proxyUrl,
            apiKey: apiKey.value
          })
        );
      });
      socket.addEventListener("message", (event) => {
        if (event.data instanceof ArrayBuffer) {
          handleProxyAudio(event.data).catch((caught) => {
            addTimeline("error", "audio_playback_error", errorMessage(caught));
          });
          return;
        }
        if (typeof event.data !== "string") {
          addTimeline("error", "bridge_frame_error", "桥接返回了无法识别的帧类型");
          return;
        }
        const message = parseRealtimeSimulatorBridgeMessage(event.data);
        if (message === undefined) {
          addTimeline("error", "bridge_parse_error", event.data);
          return;
        }
        if (message.type === "bridge_open") {
          window.clearTimeout(timeout);
          proxyReady.value = true;
          connectedTarget.value = message.target;
          connectionState.value = "online";
          connectionLatencyMs.value = message.connectionLatencyMs;
          addTimeline("system", "bridge_open", JSON.stringify(message, null, 2));
          resolve();
          return;
        }
        window.clearTimeout(timeout);
        handleBridgeMessage(message, socket, reject);
      });
      socket.addEventListener("error", () => {
        window.clearTimeout(timeout);
        reject(new Error("无法连接 Workbench 实时仿真桥接服务"));
      });
      socket.addEventListener("close", () => {
        if (bridgeSocket !== socket) {
          return;
        }
        window.clearTimeout(timeout);
        proxyReady.value = false;
        connectedTarget.value = "";
        if (connectionState.value !== "error") {
          connectionState.value = "offline";
        }
        reject(new Error("代理连接在握手完成前关闭"));
        rejectPendingWaiters(new Error("代理连接已关闭"));
      });
    });
    await connectingPromise;
  } catch (caught) {
    connectionState.value = "error";
    error.value = errorMessage(caught);
    addTimeline("error", "connection_error", error.value);
    throw caught;
  } finally {
    connecting.value = false;
    connectingPromise = undefined;
  }
}

// synthesizeAndPlay: 无入参；功能是按 FreeSWITCH 顺序完成会话启动、文本流下发和句尾等待。
async function synthesizeAndPlay(): Promise<void> {
  error.value = "";
  synthesizing.value = true;
  try {
    const chunks = splitRealtimeSimulatorText(textInput.value, splitByLine.value);
    if (!chunks.some((chunk) => chunk.trim().length > 0)) {
      throw new Error("请输入需要合成的文本");
    }

    // 由用户点击恢复 AudioContext，避免首帧到达时被浏览器自动播放策略拦截。
    await pcmPlayer.ensureContext();
    pcmPlayer.stop();
    await ensureProxyConnection();
    resetSynthesisMetrics();

    const parameters = buildRealtimeSimulatorParameters({
      format: format.value,
      sampleRate: sampleRate.value,
      speechRate: speechRate.value,
      voiceParam: voiceParam.value
    });
    const sessionStarted = waitForProxyEvent("session_started", 12_000);
    sessionSentAt = Date.now();
    requestState.value = "STARTING_SESSION";
    sendProxyMessage(
      buildRealtimeSimulatorStartMessage({
        eventId: eventId.value,
        modelName: modelName.value,
        callId: callId.value,
        parameters
      })
    );
    await sessionStarted;

    // 先登记句尾等待器，再发送文本，避免极速上游提前返回造成事件丢失。
    const sentenceEnded = waitForProxyEvent("tts_sentence_end", 60_000);
    const textMessages = buildRealtimeSimulatorTextMessages({
      chunks,
      eventId: eventId.value,
      modelName: modelName.value,
      callId: callId.value,
      parameters
    });
    for (let index = 0; index < textMessages.length; index += 1) {
      if (index === 0) {
        firstTextSentAt = Date.now();
      }
      requestState.value = "SENDING_TEXT";
      const message = textMessages[index];
      if (message !== undefined) {
        sendProxyMessage(message);
      }
      if (index < textMessages.length - 1) {
        await delay(Math.max(0, chunkDelay.value));
      }
    }

    requestState.value = "WAITING_AUDIO";
    sendProxyMessage(
      buildRealtimeSimulatorSentenceEndMessage({
        eventId: eventId.value,
        modelName: modelName.value,
        callId: callId.value
      })
    );
    await sentenceEnded;
  } catch (caught) {
    requestState.value = "ERROR";
    error.value = errorMessage(caught);
    addTimeline("error", "synthesis_error", error.value);
  } finally {
    synthesizing.value = false;
  }
}

// handleBridgeMessage: 入参为桥接控制消息、来源连接和连接拒绝器；功能是更新连接或转交代理文本事件。
function handleBridgeMessage(
  message: Exclude<
    ReturnType<typeof parseRealtimeSimulatorBridgeMessage>,
    { type: "bridge_open" } | undefined
  >,
  sourceSocket: WebSocket,
  rejectConnection: (error: Error) => void
): void {
  if (bridgeSocket !== sourceSocket) {
    return;
  }
  if (message.type === "proxy_text") {
    handleProxyText(message.payload);
    return;
  }
  if (message.type === "bridge_error") {
    proxyReady.value = false;
    connectionState.value = "error";
    error.value = message.message;
    addTimeline("error", "bridge_error", message.message);
    rejectConnection(new Error(message.message));
    rejectPendingWaiters(new Error(message.message));
    return;
  }
  proxyReady.value = false;
  connectedTarget.value = "";
  connectionState.value = "offline";
  addTimeline("system", "bridge_close", JSON.stringify(message, null, 2));
  rejectPendingWaiters(new Error(`代理连接已断开 (${message.code})`));
}

// handleProxyText: 入参为代理原始文本；功能是记录协议并推进页面会话状态与性能指标。
function handleProxyText(payload: string): void {
  const event = parseRealtimeSimulatorProxyEvent(payload);
  addTimeline("receive", event.eventType, event.raw);
  if (event.eventType === "session_started") {
    sessionLatencyMs.value = Date.now() - sessionSentAt;
    requestState.value = "SESSION_READY";
  } else if (event.eventType === "tts_sentence_start") {
    requestState.value = "STREAMING_AUDIO";
  } else if (event.eventType === "tts_sentence_end") {
    synthesisLatencyMs.value = Date.now() - firstTextSentAt;
    requestState.value = "COMPLETED";
  } else if (event.eventType === "session_canceled") {
    requestState.value = "CANCELED";
  }
  resolveProxyEvent(event.eventType);
}

// handleProxyAudio: 入参为上游二进制音频帧；功能是统计、缓存并在 PCM 模式下实时播放。
async function handleProxyAudio(arrayBuffer: ArrayBuffer): Promise<void> {
  const now = Date.now();
  const copiedChunk = new Uint8Array(arrayBuffer.slice(0));
  audioChunks.value = [...audioChunks.value, copiedChunk];
  audioByteLength.value += arrayBuffer.byteLength;
  audioChunkCount.value += 1;
  if (firstAudioAt === 0) {
    firstAudioAt = now;
    firstPacketLatencyMs.value = now - firstTextSentAt;
    addTimeline("audio", "first_audio_packet", `${arrayBuffer.byteLength} bytes`);
  } else if (audioChunkCount.value % 10 === 0) {
    addTimeline(
      "audio",
      "audio_progress",
      `${audioChunkCount.value} chunks / ${formatRealtimeSimulatorBytes(audioByteLength.value)}`
    );
  }
  if (format.value === "pcm") {
    await pcmPlayer.enqueue(arrayBuffer, playbackSampleRate.value);
  }
}

// ensureProxyConnection: 无入参；功能是复用当前目标连接，表单目标变化时自动重连。
async function ensureProxyConnection(): Promise<void> {
  const target = currentProxyUrl();
  if (proxyReady.value && connectedTarget.value === target) {
    return;
  }
  if (connectingPromise !== undefined) {
    await connectingPromise;
    return;
  }
  await connectProxy();
}

// currentProxyUrl: 无入参；输出经过必填校验的当前上游代理地址。
function currentProxyUrl(): string {
  const errors = validateRealtimeSimulatorModelConfig(
    modelName.value,
    modelParam.value,
    voiceParam.value
  );
  if (callId.value.trim().length === 0) {
    errors.push("Call ID 不能为空");
  }
  if (errors.length > 0) {
    throw new Error(errors.join("；"));
  }
  return buildRealtimeSimulatorProxyUrl({
    endpoint: endpoint.value.trim(),
    modelName: modelName.value,
    modelParam: modelParam.value,
    voiceParam: voiceParam.value,
    callId: callId.value.trim()
  });
}

// sendProxyMessage: 入参为仿真协议消息；功能是通过桥接发送 JSON 文本并记录下行时间线。
function sendProxyMessage(message: RealtimeSimulatorOutboundMessage): void {
  if (bridgeSocket === undefined || bridgeSocket.readyState !== WebSocket.OPEN || !proxyReady.value) {
    throw new Error("代理尚未连接");
  }
  const payload = JSON.stringify(message);
  bridgeSocket.send(JSON.stringify({ type: "proxy_text", payload }));
  addTimeline("send", message.eventType, JSON.stringify(message, null, 2));
}

// waitForProxyEvent: 入参为事件名和超时；输出在代理事件到达时完成的 Promise。
function waitForProxyEvent(eventType: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      const waiters = eventWaiters.get(eventType) ?? [];
      eventWaiters.set(
        eventType,
        waiters.filter((waiter) => waiter.resolve !== resolve)
      );
      reject(new Error(`等待 ${eventType} 超时（${timeoutMs}ms）`));
    }, timeoutMs);
    const waiters = eventWaiters.get(eventType) ?? [];
    waiters.push({ resolve, reject, timer });
    eventWaiters.set(eventType, waiters);
  });
}

// resolveProxyEvent: 入参为事件名；功能是完成并清理等待该事件的全部业务流程。
function resolveProxyEvent(eventType: string): void {
  const waiters = eventWaiters.get(eventType) ?? [];
  eventWaiters.delete(eventType);
  for (const waiter of waiters) {
    window.clearTimeout(waiter.timer);
    waiter.resolve();
  }
}

// rejectPendingWaiters: 入参为失败原因；功能是终止连接关闭后不可能再完成的等待流程。
function rejectPendingWaiters(reason: Error): void {
  for (const waiters of eventWaiters.values()) {
    for (const waiter of waiters) {
      window.clearTimeout(waiter.timer);
      waiter.reject(reason);
    }
  }
  eventWaiters.clear();
}

// resetSynthesisMetrics: 无入参；功能是初始化新一次合成的事件 ID、指标和音频缓存。
function resetSynthesisMetrics(): void {
  eventId.value = createRealtimeSimulatorEventId();
  requestState.value = "PREPARING";
  sessionLatencyMs.value = undefined;
  firstPacketLatencyMs.value = undefined;
  synthesisLatencyMs.value = undefined;
  audioByteLength.value = 0;
  audioChunkCount.value = 0;
  audioChunks.value = [];
  sessionSentAt = 0;
  firstTextSentAt = 0;
  firstAudioAt = 0;
}

// stopLocalPlayback: 无入参；功能是清空浏览器播放队列但保持上游合成继续执行。
function stopLocalPlayback(): void {
  pcmPlayer.stop();
  addTimeline("system", "local_playback_stopped", "仅停止浏览器播放，不会中断上游合成。" );
}

// exportCurrentAudio: 无入参；功能是把缓存 PCM 封装为 WAV，或直接导出收到的 WAV 字节。
function exportCurrentAudio(): void {
  if (audioChunks.value.length === 0) {
    error.value = "当前还没有可导出的音频";
    return;
  }
  const received = concatenateRealtimeSimulatorAudio(audioChunks.value);
  const exported =
    format.value === "pcm"
      ? createRealtimeSimulatorWav(received, playbackSampleRate.value)
      : received;
  const blobBytes = exported.slice().buffer as ArrayBuffer;
  const blob = new Blob([blobBytes], { type: "audio/wav" });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = `tts-${eventId.value || Date.now()}.wav`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(downloadUrl);
  addTimeline(
    "system",
    "audio_exported",
    `${anchor.download} / ${formatRealtimeSimulatorBytes(exported.byteLength)}`
  );
}

// closeBridgeSocket: 入参为关闭原因；功能是释放当前浏览器桥接连接并重置连接标记。
function closeBridgeSocket(reason: string): void {
  const socket = bridgeSocket;
  bridgeSocket = undefined;
  if (socket !== undefined && socket.readyState <= WebSocket.OPEN) {
    socket.close(1000, reason);
  }
  proxyReady.value = false;
  connectedTarget.value = "";
}

// addTimeline: 入参为方向、事件名和正文；功能是追加可滚动的协议审计条目。
function addTimeline(kind: TimelineKind, type: string, payload: string): void {
  timelineSequence += 1;
  timeline.value = [
    ...timeline.value,
    {
      id: timelineSequence,
      kind,
      type,
      timestamp: new Date().toLocaleTimeString("zh-CN", {
        hour12: false,
        fractionalSecondDigits: 3
      }),
      payload: truncateRealtimeSimulatorTimelinePayload(payload)
    }
  ];
  window.requestAnimationFrame(() => {
    const container = document.querySelector<HTMLElement>(".simulator-timeline");
    if (container !== null) {
      container.scrollTop = container.scrollHeight;
    }
  });
}

// clearTimeline: 无入参；功能是清空当前页面协议时间线。
function clearTimeline(): void {
  timeline.value = [];
}

// timelineIcon: 入参为时间线方向；输出对应 Material Design 图标。
function timelineIcon(kind: TimelineKind): string {
  return {
    send: "mdi-arrow-up",
    receive: "mdi-arrow-down",
    audio: "mdi-waveform",
    error: "mdi-alert-circle-outline",
    system: "mdi-cog-outline"
  }[kind];
}

// delay: 入参为毫秒数；输出定时完成的 Promise，用于模拟逐块文本间隔。
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

// errorMessage: 入参为未知错误；输出页面可展示的稳定文本。
function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : "实时仿真执行失败";
}

onBeforeUnmount(() => {
  pcmPlayer.stop();
  rejectPendingWaiters(new Error("页面已离开"));
  closeBridgeSocket("page unmounted");
});
</script>

<style scoped>
.realtime-simulator-page {
  width: min(1440px, calc(100% - 40px));
}

.simulator-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  overflow: hidden;
  padding: 26px 28px;
  border: 1px solid #d7dfec;
  border-radius: 18px;
  background:
    radial-gradient(circle at 92% 10%, rgba(36, 84, 166, 0.14), transparent 32%),
    linear-gradient(135deg, #ffffff 0%, #f3f7fd 100%);
}

.simulator-hero h1 {
  margin: 3px 0 6px;
  color: #15213a;
  font-size: clamp(1.7rem, 1.4rem + 1vw, 2.35rem);
}

.simulator-hero p {
  max-width: 720px;
  margin: 0;
  color: #59677e;
}

.simulator-eyebrow {
  color: #2454a6;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.simulator-hero-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}

.simulator-metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin: 16px 0;
}

.simulator-metric {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  padding: 15px;
  border: 1px solid #dce2ec;
  border-radius: 14px;
  background: #fff;
}

.simulator-metric div {
  display: grid;
  min-width: 0;
}

.simulator-metric span,
.simulator-metric small {
  overflow: hidden;
  color: #718096;
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.simulator-metric strong {
  margin: 2px 0;
  color: #172033;
  font-size: 1.05rem;
}

.simulator-card {
  border: 1px solid #d9e0ea;
  border-radius: 16px;
  background: #ffffff;
}

.simulator-primary-row {
  align-items: stretch;
}

.simulator-primary-column {
  display: flex;
}

.simulator-primary-card {
  width: 100%;
  height: 100%;
}

.simulator-compose-card {
  display: flex;
  flex-direction: column;
}

.simulator-compose-body {
  flex: 1;
}

.simulator-card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 12px;
  font-size: 1rem;
  font-weight: 700;
}

.simulator-card-title > span {
  display: flex;
  align-items: center;
  gap: 8px;
}

.simulator-section-heading {
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;
}

.simulator-section-heading h2 {
  margin: 0;
  font-size: 1rem;
}

.simulator-section-heading p {
  margin: 3px 0 0;
  color: #6d788b;
  font-size: 0.82rem;
}

.simulator-slider-row {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  align-items: center;
  gap: 18px;
  padding: 4px 4px 8px;
}

.simulator-slider-row div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #566277;
}

.simulator-slider-row strong {
  color: #2454a6;
}

.simulator-stage-chips {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.simulator-compose-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: #667085;
  font-size: 0.82rem;
}

.simulator-actions {
  gap: 8px;
  padding: 0 20px 20px;
}

.simulator-timeline-card {
  display: flex;
  flex-direction: column;
  min-height: 520px;
}

.simulator-timeline-card :deep(.v-card-subtitle) {
  padding: 0 20px 14px;
  white-space: normal;
}

.simulator-timeline {
  flex: 1;
  overflow: auto;
  max-height: 680px;
  padding: 8px 20px 22px;
}

.simulator-empty-timeline {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 360px;
  color: #7a8596;
  text-align: center;
}

.simulator-empty-timeline strong {
  color: #344054;
}

.simulator-empty-timeline span {
  max-width: 300px;
  font-size: 0.86rem;
}

.simulator-timeline-entry {
  --timeline-color: #667085;
  position: relative;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
  padding-bottom: 18px;
}

.simulator-timeline-entry::before {
  position: absolute;
  top: 26px;
  bottom: 0;
  left: 13px;
  width: 1px;
  background: #dce2eb;
  content: "";
}

.simulator-timeline-entry:last-child::before {
  display: none;
}

.simulator-timeline-marker {
  z-index: 1;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--timeline-color) 35%, white);
  border-radius: 50%;
  color: var(--timeline-color);
  background: color-mix(in srgb, var(--timeline-color) 9%, white);
}

.simulator-timeline-content {
  min-width: 0;
  padding-top: 3px;
}

.simulator-timeline-content > div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.simulator-timeline-content strong {
  color: var(--timeline-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
}

.simulator-timeline-content time {
  color: #98a2b3;
  font-size: 0.7rem;
}

.simulator-timeline-content pre {
  overflow: auto;
  max-height: 220px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 9px;
  color: #40506a;
  background: #f6f8fb;
  font: 0.72rem/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.simulator-timeline-entry.is-send { --timeline-color: #2454a6; }
.simulator-timeline-entry.is-receive { --timeline-color: #217c66; }
.simulator-timeline-entry.is-audio { --timeline-color: #9b4b36; }
.simulator-timeline-entry.is-error { --timeline-color: #b42318; }
.simulator-timeline-entry.is-system { --timeline-color: #697386; }

@media (max-width: 1260px) {
  .simulator-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1279px) {
  .simulator-timeline {
    max-height: 640px;
  }
}

@media (max-width: 720px) {
  .realtime-simulator-page {
    width: min(100% - 24px, 720px);
  }

  .simulator-hero,
  .simulator-hero-actions,
  .simulator-compose-options,
  .simulator-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .simulator-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .simulator-card-title {
    align-items: flex-start;
    flex-direction: column;
  }

  .simulator-stage-chips {
    flex-wrap: wrap;
  }
}
</style>

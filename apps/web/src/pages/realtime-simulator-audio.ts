/**
 * 裸 PCM S16LE 单声道流式播放器，仅供独立实时仿真页面使用。
 */
export class RealtimeSimulatorPcmPlayer {
  private audioContext?: AudioContext;
  private nextStartTime = 0;
  private readonly sources = new Set<AudioBufferSourceNode>();

  // ensureContext: 无入参；输出已创建并恢复的 AudioContext。
  async ensureContext(): Promise<AudioContext> {
    if (this.audioContext === undefined) {
      const audioWindow = window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextClass = window.AudioContext ?? audioWindow.webkitAudioContext;
      if (AudioContextClass === undefined) {
        throw new Error("当前浏览器不支持 Web Audio API");
      }
      this.audioContext = new AudioContextClass();
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    return this.audioContext;
  }

  // enqueue: 入参为 PCM ArrayBuffer 和采样率；功能是把当前音频帧连续排入本地播放队列。
  async enqueue(arrayBuffer: ArrayBuffer, sampleRate: number): Promise<void> {
    const context = await this.ensureContext();
    const bytes = new Uint8Array(arrayBuffer);
    const sampleCount = Math.floor(bytes.byteLength / 2);
    if (sampleCount === 0) {
      return;
    }

    // PCM 为 16 位小端有符号整数，逐采样归一化为 Web Audio 所需的浮点数。
    const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
    const samples = new Float32Array(sampleCount);
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = view.getInt16(index * 2, true) / 32768;
    }

    // 每帧排在上一帧结束点之后，减少 WebSocket 包边界上的爆音和间隙。
    const audioBuffer = context.createBuffer(1, sampleCount, sampleRate);
    audioBuffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.025, this.nextStartTime);
    this.nextStartTime = startAt + audioBuffer.duration;
    this.sources.add(source);
    source.addEventListener("ended", () => this.sources.delete(source), { once: true });
    source.start(startAt);
  }

  // stop: 无入参；功能是停止当前本地播放并清空等待队列，不向上游发送中断事件。
  stop(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // 已自然结束的节点无需再次停止。
      }
    }
    this.sources.clear();
    this.nextStartTime = this.audioContext?.currentTime ?? 0;
  }
}

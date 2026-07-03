import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { VoiceQuery, VoiceRecord } from "@tts-platform/core";
import { defaultDataRoot } from "./paths";

export class InMemoryVoiceRegistry {
  private readonly voices = new Map<string, VoiceRecord>();
  private readonly filePath: string;

  // constructor: 入参为可选 data root；功能是加载文件系统 voice registry 快照。
  constructor(dataRoot = defaultDataRoot()) {
    this.filePath = path.join(dataRoot, "voices", "voices.json");
    this.load();
  }

  // get: 入参为平台 voiceId；功能是从本地 voice registry 中读取单条音色记录。
  get(voiceId: string): VoiceRecord | undefined {
    return this.voices.get(voiceId);
  }

  // list: 入参为可选查询条件；功能是列出本地保存的音色记录。
  list(query: VoiceQuery = {}): VoiceRecord[] {
    return [...this.voices.values()].filter((voice) => {
      return query.providerId === undefined || voice.providerId === query.providerId;
    });
  }

  // save: 入参为音色记录；功能是写入内存 registry 并持久化到本地文件。
  save(voice: VoiceRecord): VoiceRecord {
    this.voices.set(voice.voiceId, voice);
    this.persist();
    return voice;
  }

  // delete: 入参为平台 voiceId；功能是从本地 registry 删除受控音色并持久化，返回被删记录。
  delete(voiceId: string): VoiceRecord | undefined {
    const voice = this.voices.get(voiceId);
    if (voice === undefined) {
      return undefined;
    }
    this.voices.delete(voiceId);
    this.persist();
    return voice;
  }

  // load: 无入参；功能是从本地文件读取 voice records，文件不存在时保持空 registry。
  private load(): void {
    if (!existsSync(this.filePath)) {
      return;
    }
    const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as { voices?: VoiceRecord[] };
    for (const voice of raw.voices ?? []) {
      this.voices.set(voice.voiceId, voice);
    }
  }

  // persist: 无入参；功能是把 voice records 写回本地文件系统。
  private persist(): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(
      this.filePath,
      `${JSON.stringify(
        {
          voices: [...this.voices.values()]
        },
        null,
        2
      )}\n`
    );
  }
}

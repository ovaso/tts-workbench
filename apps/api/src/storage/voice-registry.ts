import type { VoiceQuery, VoiceRecord } from "@tts-platform/core";

export class InMemoryVoiceRegistry {
  private readonly voices = new Map<string, VoiceRecord>();

  list(query: VoiceQuery = {}): VoiceRecord[] {
    return [...this.voices.values()].filter((voice) => {
      return query.providerId === undefined || voice.providerId === query.providerId;
    });
  }

  save(voice: VoiceRecord): VoiceRecord {
    this.voices.set(voice.voiceId, voice);
    return voice;
  }
}

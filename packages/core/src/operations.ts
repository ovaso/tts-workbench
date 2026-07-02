export const TTS_OPERATIONS = [
  "tts.sync",
  "tts.stream",
  "voice.clone.create",
  "voice.clone.instant",
  "voice.clone.delete"
] as const;

export type TTSOperation = (typeof TTS_OPERATIONS)[number];

export function isTTSOperation(value: string): value is TTSOperation {
  return TTS_OPERATIONS.includes(value as TTSOperation);
}

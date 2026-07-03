import type { VoiceCloneRequest, VoiceCloneResult, VoiceRecord, VoiceQuery } from "@tts-platform/core";
import { requestJson } from "./client";

export async function createVoiceClone(request: VoiceCloneRequest): Promise<VoiceCloneResult> {
  return requestJson<VoiceCloneResult>("/v1/voice-clones", {
    method: "POST",
    json: request
  });
}

// listVoices: 入参为可选 voice 查询条件；功能是从 API 读取已保存的本地音色 registry。
export async function listVoices(query: VoiceQuery = {}): Promise<VoiceRecord[]> {
  const search = query.providerId === undefined ? "" : `?providerId=${encodeURIComponent(query.providerId)}`;
  const response = await requestJson<{ voices: VoiceRecord[] }>(`/v1/voices${search}`);
  return response.voices;
}

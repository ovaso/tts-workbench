import type {
  VoiceCloneRequest,
  VoiceCloneResult,
  VoiceCreateRequest,
  VoiceDeleteResult,
  VoiceRecord,
  VoiceQuery
} from "@tts-platform/core";
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

// createVoice: 入参为手动登记音色请求；功能是把外部控制台已有音色登记到本地 registry。
export async function createVoice(request: VoiceCreateRequest): Promise<VoiceRecord> {
  const response = await requestJson<{ voice: VoiceRecord }>("/v1/voices", {
    method: "POST",
    json: request
  });
  return response.voice;
}

// deleteVoice: 入参为平台 voiceId；功能是从本地受控 registry 移除音色记录。
export async function deleteVoice(voiceId: string): Promise<VoiceDeleteResult> {
  return requestJson<VoiceDeleteResult>(`/v1/voices/${encodeURIComponent(voiceId)}`, {
    method: "DELETE"
  });
}

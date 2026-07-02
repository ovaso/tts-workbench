import type { TTSSyncRequest, TTSSyncResult } from "@tts-platform/core";
import { requestJson } from "./client";

export async function synthesizeSync(request: TTSSyncRequest): Promise<TTSSyncResult> {
  return requestJson<TTSSyncResult>("/v1/tts/sync", {
    method: "POST",
    json: request
  });
}

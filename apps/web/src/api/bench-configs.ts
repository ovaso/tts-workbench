import type { BenchConfig, BenchConfigCreateRequest } from "@tts-platform/core";
import { requestJson } from "./client";

// listBenchConfigs: 无入参；功能是读取本地 Benchmark 配置 registry。
export async function listBenchConfigs(): Promise<BenchConfig[]> {
  const response = await requestJson<{ configs: BenchConfig[] }>("/v1/bench-configs");
  return response.configs;
}

// createBenchConfig: 入参为配置创建请求；功能是保存去重后的 Benchmark 配置。
export async function createBenchConfig(request: BenchConfigCreateRequest): Promise<BenchConfig> {
  const response = await requestJson<{ config: BenchConfig }>("/v1/bench-configs", {
    method: "POST",
    json: request
  });
  return response.config;
}

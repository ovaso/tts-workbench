import type {
  BenchConfig,
  BenchConfigCreateRequest,
  BenchConfigSet,
  BenchConfigSetCreateRequest
} from "@tts-platform/core";
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

// listBenchConfigSets: 无入参；功能是读取已保存的 Benchmark 配置组合。
export async function listBenchConfigSets(): Promise<BenchConfigSet[]> {
  const response = await requestJson<{ sets: BenchConfigSet[] }>("/v1/bench-config-sets");
  return response.sets;
}

// createBenchConfigSet: 入参为配置组合创建请求；功能是保存一组可复用 Benchmark 配置。
export async function createBenchConfigSet(request: BenchConfigSetCreateRequest): Promise<BenchConfigSet> {
  const response = await requestJson<{ set: BenchConfigSet }>("/v1/bench-config-sets", {
    method: "POST",
    json: request
  });
  return response.set;
}

import type { BenchmarkPlan, BenchmarkPlanCreateRequest } from "@tts-platform/core";
import { requestJson } from "./client";

// listBenchmarkPlans: 无入参；功能是读取已归档的 Benchmark 方案列表。
export async function listBenchmarkPlans(): Promise<BenchmarkPlan[]> {
  const response = await requestJson<{ plans: BenchmarkPlan[] }>("/v1/benchmark-plans");
  return response.plans;
}

// getBenchmarkPlan: 入参为 planId；功能是读取 Benchmark 方案详情和 job 结果。
export async function getBenchmarkPlan(planId: string): Promise<BenchmarkPlan> {
  return requestJson<BenchmarkPlan>(`/v1/benchmark-plans/${encodeURIComponent(planId)}`);
}

// createBenchmarkPlan: 入参为 Benchmark 方案创建请求；功能是生成 planned jobs 并归档方案。
export async function createBenchmarkPlan(request: BenchmarkPlanCreateRequest): Promise<BenchmarkPlan> {
  const response = await requestJson<{ plan: BenchmarkPlan }>("/v1/benchmark-plans", {
    method: "POST",
    json: request
  });
  return response.plan;
}

// runBenchmarkPlan: 入参为 planId；功能是顺序执行方案内 jobs 并返回写回后的方案。
export async function runBenchmarkPlan(planId: string): Promise<BenchmarkPlan> {
  return requestJson<BenchmarkPlan>(`/v1/benchmark-plans/${encodeURIComponent(planId)}/run`, {
    method: "POST"
  });
}

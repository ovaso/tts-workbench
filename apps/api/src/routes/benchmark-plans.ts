import {
  TTSError,
  type BenchmarkJobOperation,
  type BenchmarkPlanCreateRequest,
  type BenchmarkTextMode
} from "@tts-platform/core";
import type { FastifyInstance } from "fastify";
import type { FileBenchmarkPlanArchive } from "../storage/benchmark-plan-archive";

// registerBenchmarkPlanRoutes: 入参为 Fastify 实例和 Benchmark plan archive；功能是注册 plan HTTP API。
export async function registerBenchmarkPlanRoutes(
  app: FastifyInstance,
  plans: FileBenchmarkPlanArchive
): Promise<void> {
  app.get("/v1/benchmark-plans", async () => {
    return {
      plans: await plans.listPlans()
    };
  });

  app.get<{ Params: { planId: string } }>("/v1/benchmark-plans/:planId", async (request) => {
    return plans.readPlan(decodeURIComponent(request.params.planId));
  });

  app.post("/v1/benchmark-plans", async (request, reply) => {
    const plan = await plans.createPlan(parseBenchmarkPlanCreateRequest(request.body));
    return reply.status(201).send({ plan });
  });
}

// parseBenchmarkPlanCreateRequest: 入参为 HTTP body；输出可生成 planned Benchmark plan 的请求。
function parseBenchmarkPlanCreateRequest(body: unknown): BenchmarkPlanCreateRequest {
  const input = requireObject(body, "request body");
  const request: BenchmarkPlanCreateRequest = {
    displayName: requireTrimmedString(input.displayName, "displayName"),
    corpusSetId: requireTrimmedString(input.corpusSetId, "corpusSetId"),
    configSetId: requireTrimmedString(input.configSetId, "configSetId")
  };
  if (typeof input.description === "string" && input.description.trim().length > 0) {
    request.description = input.description.trim();
  }
  if (input.operation !== undefined) {
    request.operation = parseBenchmarkOperation(input.operation);
  }
  if (input.textMode !== undefined) {
    request.textMode = parseBenchmarkTextMode(input.textMode);
  }
  return request;
}

// parseBenchmarkOperation: 入参为未知 operation；输出 Benchmark 可规划的合成 operation。
function parseBenchmarkOperation(value: unknown): BenchmarkJobOperation {
  if (value === "tts.sync" || value === "tts.stream") {
    return value;
  }
  throw new TTSError("operation is invalid.", "invalid_request", 400);
}

// parseBenchmarkTextMode: 入参为未知文本模式；输出受控文本模式。
function parseBenchmarkTextMode(value: unknown): BenchmarkTextMode {
  if (value === "text" || value === "ssml") {
    return value;
  }
  throw new TTSError("textMode is invalid.", "invalid_request", 400);
}

// requireObject: 入参为未知值和字段名；输出普通对象，否则抛出请求错误。
function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TTSError(`${label} must be an object.`, "invalid_request", 400);
  }
  return value as Record<string, unknown>;
}

// requireTrimmedString: 入参为未知值和字段名；输出 trim 后非空字符串。
function requireTrimmedString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TTSError(`${label} is required.`, "invalid_request", 400);
  }
  return value.trim();
}

import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { TTSError } from "@tts-platform/core";
import fastify, { type FastifyInstance } from "fastify";
import { CosyVoiceTTSAdapter } from "./adapters/cosyvoice/adapter";
import { MiniMaxTTSAdapter } from "./adapters/minimax/adapter";
import { MockTTSAdapter } from "./adapters/mock/adapter";
import { AdapterRegistry } from "./facade/adapter-registry";
import { TTSFacade } from "./facade/tts-facade";
import { loadEnvFiles } from "./config/env";
import { registerBenchConfigRoutes } from "./routes/bench-configs";
import { registerHealthRoutes } from "./routes/health";
import { registerProviderRoutes } from "./routes/providers";
import { registerRunRoutes } from "./routes/runs";
import { registerSynthesizeRoutes } from "./routes/synthesize";
import { FileRunArchive } from "./storage/run-archive";
import { FileBenchConfigRegistry } from "./storage/bench-config-registry";
import { InMemoryVoiceRegistry } from "./storage/voice-registry";
import { StreamSessionRegistry } from "./stream/stream-session-registry";

export interface BuildAppOptions {
  dataRoot?: string;
  logger?: boolean;
  loadEnv?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  if (options.loadEnv ?? true) {
    loadEnvFiles();
  }

  const app = fastify({
    logger: options.logger ?? false
  });

  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"]
  });
  await app.register(websocket);

  const registry = new AdapterRegistry([
    new MockTTSAdapter(),
    // MiniMaxTTSAdapter: 注册真实厂商 adapter；无 API key 时仍可查看 capability，真实执行时再校验密钥。
    new MiniMaxTTSAdapter({
      apiKey: process.env.MINIMAX_API_KEY
    }),
    // CosyVoiceTTSAdapter: 注册阿里云百炼 CosyVoice；HTTP/克隆需要 Workspace，流式 WS 可使用全局 inference endpoint。
    new CosyVoiceTTSAdapter({
      apiKey:
        process.env.COSYVOICE_API_KEY ??
        process.env.cosyvoice_api_key ??
        process.env.DASHSCOPE_API_KEY ??
        process.env.dashscope_api_key,
      workspaceId: process.env.COSYVOICE_WORKSPACE_ID ?? process.env.cosyvoice_workspace_id,
      region: process.env.COSYVOICE_REGION ?? process.env.cosyvoice_region,
      streamEndpoint:
        process.env.COSYVOICE_STREAM_ENDPOINT ??
        process.env.cosyvoice_inference_endpoint ??
        process.env.DASHSCOPE_INFERENCE_ENDPOINT ??
        process.env.dashscope_inference_endpoint
    })
  ]);
  const archive = new FileRunArchive(options.dataRoot);
  const voices = new InMemoryVoiceRegistry(options.dataRoot);
  const benchConfigs = new FileBenchConfigRegistry(options.dataRoot);
  const streamSessions = new StreamSessionRegistry();
  const facade = new TTSFacade(registry, archive, voices);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof TTSError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: {
        code: "internal_error",
        message: "Internal server error."
      }
    });
  });

  await registerHealthRoutes(app);
  await registerProviderRoutes(app, facade);
  await registerSynthesizeRoutes(app, facade, archive, streamSessions);
  await registerRunRoutes(app, archive);
  await registerBenchConfigRoutes(app, benchConfigs);

  return app;
}

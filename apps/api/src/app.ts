import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { TTSError } from "@tts-platform/core";
import fastify, { type FastifyInstance } from "fastify";
import { CosyVoiceTTSAdapter } from "./adapters/cosyvoice/adapter";
import { DoubaoTTSAdapter } from "./adapters/doubao/adapter";
import { MiniMaxTTSAdapter } from "./adapters/minimax/adapter";
import { MockTTSAdapter } from "./adapters/mock/adapter";
import { XiaomiMiMoTTSAdapter } from "./adapters/xiaomi-mimo/adapter";
import { AdapterRegistry } from "./facade/adapter-registry";
import { TTSFacade } from "./facade/tts-facade";
import { loadEnvFiles } from "./config/env";
import { registerBenchConfigRoutes } from "./routes/bench-configs";
import { registerHealthRoutes } from "./routes/health";
import { registerProviderRoutes } from "./routes/providers";
import { registerRealtimeSimulatorRoutes } from "./routes/realtime-simulator";
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
    }),
    // DoubaoTTSAdapter: 注册火山引擎豆包语音；支持新版 API Key 和旧版 app/access key。
    new DoubaoTTSAdapter({
      apiKey: process.env.DOUBAO_API_KEY ?? process.env.doubao_api_key,
      appId: process.env.DOUBAO_APP_ID ?? process.env.doubao_app_id,
      accessToken:
        process.env.DOUBAO_ACCESS_TOKEN ??
        process.env.doubao_access_token ??
        process.env["doubao_access-token"]
    }),
    // XiaomiMiMoTTSAdapter: 注册小米 MiMo；执行时需要 MIMO_API_KEY，capability 展示不依赖密钥。
    new XiaomiMiMoTTSAdapter({
      apiKey:
        process.env.MIMO_API_KEY ??
        process.env.XIAOMI_MIMO_API_KEY ??
        process.env.xiaomi_mimo_api_key ??
        process.env.mimo_api_key
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
  // registerRealtimeSimulatorRoutes: 独立注册 FreeSWITCH 代理仿真桥接，不经过 core、Facade 或 run archive。
  await registerRealtimeSimulatorRoutes(app);
  await registerRunRoutes(app, archive);
  await registerBenchConfigRoutes(app, benchConfigs);

  return app;
}

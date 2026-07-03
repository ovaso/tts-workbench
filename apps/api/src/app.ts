import cors from "@fastify/cors";
import { TTSError } from "@tts-platform/core";
import fastify, { type FastifyInstance } from "fastify";
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

  const registry = new AdapterRegistry([
    new MockTTSAdapter(),
    // MiniMaxTTSAdapter: 注册真实厂商 adapter；无 API key 时仍可查看 capability，真实执行时再校验密钥。
    new MiniMaxTTSAdapter({
      apiKey: process.env.MINIMAX_API_KEY
    })
  ]);
  const archive = new FileRunArchive(options.dataRoot);
  const voices = new InMemoryVoiceRegistry(options.dataRoot);
  const benchConfigs = new FileBenchConfigRegistry(options.dataRoot);
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
  await registerSynthesizeRoutes(app, facade);
  await registerRunRoutes(app, archive);
  await registerBenchConfigRoutes(app, benchConfigs);

  return app;
}

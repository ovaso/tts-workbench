import cors from "@fastify/cors";
import { TTSError } from "@tts-platform/core";
import fastify, { type FastifyInstance } from "fastify";
import { MockTTSAdapter } from "./adapters/mock/adapter";
import { AdapterRegistry } from "./facade/adapter-registry";
import { TTSFacade } from "./facade/tts-facade";
import { registerHealthRoutes } from "./routes/health";
import { registerProviderRoutes } from "./routes/providers";
import { registerRunRoutes } from "./routes/runs";
import { registerSynthesizeRoutes } from "./routes/synthesize";
import { FileRunArchive } from "./storage/run-archive";
import { InMemoryVoiceRegistry } from "./storage/voice-registry";

export interface BuildAppOptions {
  dataRoot?: string;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = fastify({
    logger: options.logger ?? false
  });

  await app.register(cors, {
    origin: true
  });

  const registry = new AdapterRegistry([new MockTTSAdapter()]);
  const archive = new FileRunArchive(options.dataRoot);
  const voices = new InMemoryVoiceRegistry();
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

  return app;
}

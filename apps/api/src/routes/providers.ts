import type { FastifyInstance } from "fastify";
import type { TTSFacade } from "../facade/tts-facade";

export async function registerProviderRoutes(
  app: FastifyInstance,
  facade: TTSFacade
): Promise<void> {
  app.get("/v1/providers", async () => {
    return {
      providers: facade.listProviders()
    };
  });

  app.get<{ Params: { providerId: string } }>("/v1/providers/:providerId/capabilities", async (request) => {
    return facade.getCapabilities(request.params.providerId);
  });
}

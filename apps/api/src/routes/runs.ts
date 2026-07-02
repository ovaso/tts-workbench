import type { FastifyInstance } from "fastify";
import type { FileRunArchive } from "../storage/run-archive";

export async function registerRunRoutes(
  app: FastifyInstance,
  archive: FileRunArchive
): Promise<void> {
  app.get("/v1/runs", async () => {
    return {
      runs: await archive.listRuns()
    };
  });

  app.get<{ Params: { runId: string } }>("/v1/runs/:runId", async (request) => {
    return archive.readRun(request.params.runId);
  });

  app.get<{ Params: { runId: string } }>("/v1/runs/:runId/audio", async (request, reply) => {
    const { stream, filePath } = await archive.audioStream(request.params.runId);
    const contentType = filePath.endsWith(".wav") ? "audio/wav" : "application/octet-stream";
    return reply.type(contentType).send(stream);
  });
}

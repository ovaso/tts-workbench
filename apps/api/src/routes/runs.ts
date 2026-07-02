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
    const contentType = audioContentType(filePath);
    return reply.type(contentType).send(stream);
  });
}

// audioContentType: 入参为音频文件路径；功能是为浏览器播放器返回正确的音频 MIME 类型。
export function audioContentType(filePath: string): string {
  if (filePath.endsWith(".wav")) {
    return "audio/wav";
  }
  if (filePath.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (filePath.endsWith(".ogg")) {
    return "audio/ogg";
  }
  if (filePath.endsWith(".flac")) {
    return "audio/flac";
  }
  if (filePath.endsWith(".pcm")) {
    return "audio/L16";
  }
  return "application/octet-stream";
}

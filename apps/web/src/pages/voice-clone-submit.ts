import type { ReferenceAudioFormat } from "@tts-platform/core";

export function selectedReferenceFile(value: File | File[] | null): File | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

export function referenceAudioFormat(file: File): ReferenceAudioFormat | undefined {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "mp3" || extension === "m4a" || extension === "wav") {
    return extension;
  }
  if (file.type === "audio/mpeg") {
    return "mp3";
  }
  if (file.type === "audio/mp4" || file.type === "audio/x-m4a") {
    return "m4a";
  }
  if (file.type === "audio/wav" || file.type === "audio/wave" || file.type === "audio/x-wav") {
    return "wav";
  }
  return undefined;
}

export async function fileToDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 8192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  const mediaType = file.type.length > 0 ? file.type : mimeTypeForFormat(referenceAudioFormat(file));
  return `data:${mediaType};base64,${btoa(binary)}`;
}

function mimeTypeForFormat(format: ReferenceAudioFormat | undefined): string {
  if (format === "wav") {
    return "audio/wav";
  }
  if (format === "m4a") {
    return "audio/mp4";
  }
  return "audio/mpeg";
}

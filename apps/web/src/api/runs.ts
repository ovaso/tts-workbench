import type {
  MappingReport,
  ArchivedRunSummary,
  TTSOperationRequest,
  TTSPlan,
  VendorPayload
} from "@tts-platform/core";
import { requestJson } from "./client";

export interface RunDetail {
  result: ArchivedRunSummary & VendorPayload;
  request: TTSOperationRequest;
  plan: TTSPlan;
  mappingReport: MappingReport;
  vendorRequest: VendorPayload;
  vendorResponse: VendorPayload;
}

export async function listRuns(): Promise<ArchivedRunSummary[]> {
  const response = await requestJson<{ runs: ArchivedRunSummary[] }>("/v1/runs");
  return response.runs;
}

export async function getRun(runId: string): Promise<RunDetail> {
  return requestJson<RunDetail>(`/v1/runs/${runId}`);
}

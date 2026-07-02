import type {
  MappingReport,
  TTSSyncPlan,
  TTSSyncRequest,
  TTSSyncResult,
  VendorPayload
} from "@tts-platform/core";
import { requestJson } from "./client";

export interface RunDetail {
  result: TTSSyncResult;
  request: TTSSyncRequest;
  plan: TTSSyncPlan;
  mappingReport: MappingReport;
  vendorRequest: VendorPayload;
  vendorResponse: VendorPayload;
}

export async function listRuns(): Promise<TTSSyncResult[]> {
  const response = await requestJson<{ runs: TTSSyncResult[] }>("/v1/runs");
  return response.runs;
}

export async function getRun(runId: string): Promise<RunDetail> {
  return requestJson<RunDetail>(`/v1/runs/${runId}`);
}

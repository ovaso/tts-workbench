import { randomUUID } from "node:crypto";

export function createRunId(now = new Date()): string {
  const timestamp = now.toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14);
  return `run_${timestamp}_${randomUUID().slice(0, 8)}`;
}

export function createPlanId(now = new Date()): string {
  const timestamp = now.toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14);
  return `plan_${timestamp}_${randomUUID().slice(0, 8)}`;
}

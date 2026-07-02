import type { JsonValue } from "./json";
import type { TTSOperation } from "./operations";
import type { VendorDirectiveMode } from "./vendor-extension";

export interface AppliedCanonicalField {
  field: string;
  value: JsonValue;
  vendorField?: string;
}

export interface AppliedVendorExtension {
  providerId: string;
  schemaVersion: string;
  path: string;
  value: JsonValue;
}

export interface IgnoredField {
  field: string;
  reason: string;
}

export interface Approximation {
  field: string;
  requestedValue: JsonValue;
  actualValue: JsonValue;
  reason: string;
}

export interface MappingReport {
  providerId: string;
  operation: TTSOperation;
  directiveMode: VendorDirectiveMode;
  appliedCanonicalFields: AppliedCanonicalField[];
  appliedVendorExtensions: AppliedVendorExtension[];
  ignoredFields: IgnoredField[];
  approximations: Approximation[];
  warnings: string[];
}

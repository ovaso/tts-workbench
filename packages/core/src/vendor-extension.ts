export type VendorDirectiveMode =
  | "canonical_only"
  | "prefer_vendor"
  | "vendor_required";

export type VendorPayload = Record<string, unknown>;

export interface VendorExtensionInput {
  schemaVersion: string;
  params: VendorPayload;
}

export interface VendorDirective {
  mode?: VendorDirectiveMode;
  extensions?: {
    [providerId: string]: VendorExtensionInput;
  };
}

export interface VendorExtensionSchema {
  schemaVersion: string;
  title: string;
  description?: string;
  jsonSchema: VendorPayload;
}

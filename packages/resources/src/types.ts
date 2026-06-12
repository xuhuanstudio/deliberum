import type {
  Resource,
  ResourcePrivacy,
  ResourceUrlExposure,
  ResourceVariant
} from "@deliberum/protocol";

export type { Resource, ResourceVariant } from "@deliberum/protocol";

export type ResourceDeliveryMode = "url" | "base64" | "none";
export type ResourceSensitivity = "public" | "internal" | "sensitive";

export type InMemoryResourceContent = {
  dataRef: string;
  base64: string;
};

export type ResourceRegistration = {
  resource: Resource;
  contents?: readonly InMemoryResourceContent[];
};

export type ResourceBroker = {
  registerResource(registration: ResourceRegistration): Resource;
  getResource(resourceId: string): Resource | undefined;
  listResources(): Resource[];
  getExplicitInMemoryContent(dataRef: string): string | undefined;
};

export type ResourceDeliveryPolicyOverrides = {
  preferredModes?: ResourceDeliveryMode[];
  requestedMode?: ResourceDeliveryMode;
  allowLocalhostUrl?: boolean;
  allowLanUrl?: boolean;
  allowPublicUrl?: boolean;
  allowBase64?: boolean;
  maxBase64SizeBytes?: number;
  allowHostedContentUrl?: boolean;
  maxHostedContentSizeBytes?: number;
};

export type ResourceDeliveryPolicy = ResourceDeliveryPolicyOverrides & {
  participantOverrides?: Record<string, ResourceDeliveryPolicyOverrides>;
};

export type ResourceDeliveryRequest = {
  resourceId: string;
  participantId: string;
  policy?: ResourceDeliveryPolicy;
};

export type UrlDeliveryMaterial = {
  mode: "url";
  url: string;
  exposure: ResourceUrlExposure;
  expiresAt?: string;
};

export type Base64DeliveryMaterial = {
  mode: "base64";
  mime: string;
  data: string;
  sizeBytes: number;
};

export type ResourceDeliveryMaterial = UrlDeliveryMaterial | Base64DeliveryMaterial;

export type ResourceAccessReport = {
  resourceId: string;
  participantId: string;
  selectedMode: ResourceDeliveryMode;
  allowed: boolean;
  reason: string;
  warnings: string[];
};

export type ResourceDeliveryPlan = ResourceAccessReport & {
  delivery?: ResourceDeliveryMaterial;
};

export function resourceSensitivityFromPrivacy(privacy: ResourcePrivacy): ResourceSensitivity {
  if (privacy === "private") {
    return "internal";
  }

  return privacy;
}

export function isBase64Variant(variant: ResourceVariant): variant is Extract<ResourceVariant, { mode: "base64" }> {
  return variant.mode === "base64";
}

export function isUrlVariant(variant: ResourceVariant): variant is Extract<ResourceVariant, { mode: "url" }> {
  return variant.mode === "url";
}

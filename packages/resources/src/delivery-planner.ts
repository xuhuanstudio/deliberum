import { ResourceNotFoundError, InvalidResourcePolicyError } from "./errors";
import {
  isBase64Variant,
  isUrlVariant,
  resourceSensitivityFromPrivacy,
  type Base64DeliveryMaterial,
  type Resource,
  type ResourceBroker,
  type ResourceDeliveryMode,
  type ResourceDeliveryPlan,
  type ResourceDeliveryPolicy,
  type ResourceDeliveryPolicyOverrides,
  type ResourceDeliveryRequest,
  type ResourceSensitivity,
  type ResourceVariant,
  type UrlDeliveryMaterial
} from "./types";

const DEFAULT_MODE_PREFERENCE: ResourceDeliveryMode[] = ["url", "base64", "none"];

export type DeliveryPlannerOptions = {
  broker: ResourceBroker;
  defaultPolicy?: ResourceDeliveryPolicy;
};

export class DeliveryPlanner {
  private readonly broker: ResourceBroker;
  private readonly defaultPolicy: ResourceDeliveryPolicy;

  constructor(options: DeliveryPlannerOptions) {
    this.broker = options.broker;
    this.defaultPolicy = options.defaultPolicy ?? {};
  }

  planDelivery(request: ResourceDeliveryRequest): ResourceDeliveryPlan {
    const resource = this.broker.getResource(request.resourceId);

    if (!resource) {
      throw new ResourceNotFoundError(request.resourceId);
    }

    const policy = resolvePolicy(
      this.defaultPolicy,
      request.policy,
      request.participantId
    );
    validatePolicy(policy);

    const sensitivity = resourceSensitivityFromPrivacy(resource.privacy);

    if (sensitivity === "sensitive") {
      return createNonePlan(
        request,
        "Sensitive resources are not deliverable in Stage 12.",
        ["Sensitive resource delivery requires a future explicit secure workflow."]
      );
    }

    const requestedModes = policy.requestedMode
      ? [policy.requestedMode]
      : policy.preferredModes && policy.preferredModes.length > 0
        ? policy.preferredModes
        : DEFAULT_MODE_PREFERENCE;
    const deniedReasons: string[] = [];

    for (const mode of requestedModes) {
      if (mode === "none") {
        return createNonePlan(request, "No resource delivery mode was selected.", deniedReasons);
      }

      const plan =
        mode === "url"
          ? planUrlDelivery(request, resource, sensitivity, policy)
          : planBase64Delivery(request, resource, policy, this.broker);

      if (plan.allowed) {
        return plan;
      }

      deniedReasons.push(plan.reason);

      if (policy.requestedMode) {
        return createNonePlan(request, plan.reason, plan.warnings);
      }
    }

    return createNonePlan(
      request,
      deniedReasons[0] ?? "No allowed resource delivery mode is available.",
      deniedReasons.slice(1)
    );
  }
}

function resolvePolicy(
  defaultPolicy: ResourceDeliveryPolicy,
  requestPolicy: ResourceDeliveryPolicy | undefined,
  participantId: string
): ResourceDeliveryPolicyOverrides {
  return {
    ...stripParticipantOverrides(defaultPolicy),
    ...defaultPolicy.participantOverrides?.[participantId],
    ...stripParticipantOverrides(requestPolicy ?? {}),
    ...requestPolicy?.participantOverrides?.[participantId]
  };
}

function stripParticipantOverrides(policy: ResourceDeliveryPolicy): ResourceDeliveryPolicyOverrides {
  const { participantOverrides: _participantOverrides, ...rest } = policy;

  return rest;
}

function validatePolicy(policy: ResourceDeliveryPolicyOverrides): void {
  if (
    policy.maxBase64SizeBytes !== undefined &&
    (!Number.isInteger(policy.maxBase64SizeBytes) || policy.maxBase64SizeBytes < 0)
  ) {
    throw new InvalidResourcePolicyError("maxBase64SizeBytes must be a nonnegative integer.");
  }

  if (
    policy.maxHostedContentSizeBytes !== undefined &&
    (!Number.isInteger(policy.maxHostedContentSizeBytes) ||
      policy.maxHostedContentSizeBytes < 0)
  ) {
    throw new InvalidResourcePolicyError(
      "maxHostedContentSizeBytes must be a nonnegative integer."
    );
  }

  for (const mode of policy.preferredModes ?? []) {
    if (!isResourceDeliveryMode(mode)) {
      throw new InvalidResourcePolicyError("preferredModes contains an unsupported mode.");
    }
  }

  if (policy.requestedMode !== undefined && !isResourceDeliveryMode(policy.requestedMode)) {
    throw new InvalidResourcePolicyError("requestedMode is unsupported.");
  }
}

function planUrlDelivery(
  request: ResourceDeliveryRequest,
  resource: Resource,
  sensitivity: ResourceSensitivity,
  policy: ResourceDeliveryPolicyOverrides
): ResourceDeliveryPlan {
  const urlVariants = resource.variants.filter(isUrlVariant);

  if (urlVariants.length === 0) {
    return createNonePlan(request, "Resource has no URL variant.");
  }

  for (const variant of urlVariants) {
    const exposureReason = getUrlExposureDenialReason(variant, sensitivity, policy);

    if (exposureReason) {
      continue;
    }

    const safeMaterial = createSafeUrlMaterial(variant, policy);

    if (!safeMaterial.allowed) {
      continue;
    }

    return {
      resourceId: request.resourceId,
      participantId: request.participantId,
      selectedMode: "url",
      allowed: true,
      reason: "URL delivery is explicitly allowed by policy.",
      warnings:
        variant.exposure === "public"
          ? ["Public URL delivery was explicitly allowed by policy."]
          : [],
      delivery: safeMaterial.material
    };
  }

  return createNonePlan(
    request,
    getFirstUrlDenialReason(urlVariants, sensitivity, policy)
  );
}

function getUrlExposureDenialReason(
  variant: Extract<ResourceVariant, { mode: "url" }>,
  sensitivity: ResourceSensitivity,
  policy: ResourceDeliveryPolicyOverrides
): string | undefined {
  if (variant.exposure === "public" && sensitivity !== "public") {
    return "Public URL exposure is only allowed for public resources in Stage 12.";
  }

  if (variant.exposure === "localhost" && policy.allowLocalhostUrl !== true) {
    return "Localhost URL delivery is not allowed by policy.";
  }

  if (variant.exposure === "lan" && policy.allowLanUrl !== true) {
    return "LAN URL delivery is not allowed by policy.";
  }

  if (variant.exposure === "public" && policy.allowPublicUrl !== true) {
    return "Public URL delivery requires allowPublicUrl policy.";
  }

  return undefined;
}

function getFirstUrlDenialReason(
  variants: readonly Extract<ResourceVariant, { mode: "url" }>[],
  sensitivity: ResourceSensitivity,
  policy: ResourceDeliveryPolicyOverrides
): string {
  for (const variant of variants) {
    const exposureReason = getUrlExposureDenialReason(variant, sensitivity, policy);

    if (exposureReason) {
      return exposureReason;
    }

    const safeMaterial = createSafeUrlMaterial(variant, policy);
    if (!safeMaterial.allowed) {
      return safeMaterial.reason;
    }
  }

  return "No safe URL variant is available.";
}

function createSafeUrlMaterial(
  variant: Extract<ResourceVariant, { mode: "url" }>,
  policy: ResourceDeliveryPolicyOverrides
):
  | {
      allowed: true;
      material: UrlDeliveryMaterial;
    }
  | {
      allowed: false;
      reason: string;
    } {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(variant.url);
  } catch {
    return {
      allowed: false,
      reason: "Registered URL is not safe for delivery."
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      allowed: false,
      reason: "Registered URL is not safe for delivery."
    };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return {
      allowed: false,
      reason: "Registered URL contains credentials."
    };
  }

  const hostSafety = classifyUrlHostSafety(parsedUrl.hostname);

  if (hostSafety === "localhost" && (variant.exposure !== "localhost" || policy.allowLocalhostUrl !== true)) {
    return {
      allowed: false,
      reason: "Registered URL is not safe for delivery."
    };
  }

  if (hostSafety === "lan" && (variant.exposure !== "lan" || policy.allowLanUrl !== true)) {
    return {
      allowed: false,
      reason: "Registered URL is not safe for delivery."
    };
  }

  if (containsUnsafeUrlMaterial(parsedUrl)) {
    return {
      allowed: false,
      reason: "Registered URL contains private delivery material."
    };
  }

  return {
    allowed: true,
    material: {
      mode: "url",
      url: parsedUrl.toString(),
      exposure: variant.exposure,
      expiresAt: variant.expiresAt
    }
  };
}

function planBase64Delivery(
  request: ResourceDeliveryRequest,
  resource: Resource,
  policy: ResourceDeliveryPolicyOverrides,
  broker: ResourceBroker
): ResourceDeliveryPlan {
  const base64Variants = resource.variants.filter(isBase64Variant);

  if (base64Variants.length === 0) {
    return createNonePlan(request, "Resource has no base64 variant.");
  }

  if (policy.allowBase64 !== true) {
    return createNonePlan(request, "Base64 delivery requires allowBase64 policy.");
  }

  if (policy.maxBase64SizeBytes === undefined) {
    return createNonePlan(request, "Base64 delivery requires maxBase64SizeBytes policy.");
  }

  for (const variant of base64Variants) {
    const content = broker.getExplicitInMemoryContent(variant.dataRef);

    if (content === undefined) {
      continue;
    }

    const safeContent = createSafeBase64Material(variant, content, policy.maxBase64SizeBytes);

    if (!safeContent.allowed) {
      return createNonePlan(request, safeContent.reason);
    }

    return {
      resourceId: request.resourceId,
      participantId: request.participantId,
      selectedMode: "base64",
      allowed: true,
      reason: "Base64 delivery is explicitly allowed by policy and within size limit.",
      warnings: ["Base64 delivery sends resource content to the participant."],
      delivery: safeContent.material
    };
  }

  return createNonePlan(
    request,
    "No base64 variant has explicit in-memory content within the configured size limit."
  );
}

function createSafeBase64Material(
  variant: Extract<ResourceVariant, { mode: "base64" }>,
  content: string,
  maxBase64SizeBytes: number
):
  | {
      allowed: true;
      material: Base64DeliveryMaterial;
    }
  | {
      allowed: false;
      reason: string;
    } {
  const decoded = decodeStrictBase64(content);

  if (!decoded) {
    return {
      allowed: false,
      reason: "In-memory base64 content is not safe for delivery."
    };
  }

  if (decoded.byteLength > maxBase64SizeBytes) {
    return {
      allowed: false,
      reason: "In-memory base64 content exceeds the configured size limit."
    };
  }

  if (decoded.byteLength > variant.sizeBytes) {
    return {
      allowed: false,
      reason: "In-memory base64 content does not match registered resource metadata."
    };
  }

  const decodedText = decodeValidUtf8(decoded);
  if (decodedText !== undefined && containsSecretLikeText(decodedText)) {
    return {
      allowed: false,
      reason: "In-memory base64 content contains private delivery material."
    };
  }

  return {
    allowed: true,
    material: {
      mode: "base64",
      mime: variant.mime,
      data: content,
      sizeBytes: decoded.byteLength
    }
  };
}

function createNonePlan(
  request: Pick<ResourceDeliveryRequest, "resourceId" | "participantId">,
  reason: string,
  warnings: readonly string[] = []
): ResourceDeliveryPlan {
  return {
    resourceId: request.resourceId,
    participantId: request.participantId,
    selectedMode: "none",
    allowed: false,
    reason,
    warnings: [...warnings]
  };
}

function isResourceDeliveryMode(value: unknown): value is ResourceDeliveryMode {
  return value === "url" || value === "base64" || value === "none";
}

function decodeStrictBase64(value: string): Uint8Array | undefined {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return undefined;
  }

  let binary: string;

  try {
    binary = atob(value);
  } catch {
    return undefined;
  }

  const decoded = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    decoded[index] = binary.charCodeAt(index);
  }

  return encodeBase64(decoded) === value ? decoded : undefined;
}

function decodeValidUtf8(bytes: Uint8Array): string | undefined {
  let text: string;

  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }

  const encoded = new TextEncoder().encode(text);

  if (encoded.byteLength !== bytes.byteLength) {
    return undefined;
  }

  for (let index = 0; index < encoded.byteLength; index += 1) {
    if (encoded[index] !== bytes[index]) {
      return undefined;
    }
  }

  return text;
}

function encodeBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let binary = "";

  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function containsUnsafeUrlMaterial(url: URL): boolean {
  const decodedPathname = decodePathname(url.pathname);

  if (
    decodedPathname === undefined ||
    containsSecretLikeText(url.toString()) ||
    containsSecretLikeText(decodedPathname) ||
    looksLikeLocalFilePath(decodedPathname)
  ) {
    return true;
  }

  for (const [key, value] of url.searchParams) {
    if (containsSecretLikeText(key) || containsSecretLikeText(value)) {
      return true;
    }
  }

  return false;
}

function decodePathname(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}

function looksLikeLocalFilePath(decodedPathname: string): boolean {
  const normalizedPathname = decodedPathname.toLowerCase();

  return (
    normalizedPathname.startsWith("/users/") ||
    normalizedPathname.startsWith("/home/") ||
    normalizedPathname.startsWith("/private/") ||
    normalizedPathname.includes("/.ssh/") ||
    normalizedPathname.includes("\\")
  );
}

function classifyUrlHostSafety(hostname: string): "public" | "localhost" | "lan" {
  const normalizedHostname = hostname.toLowerCase();

  if (
    normalizedHostname === "localhost" ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "::1" ||
    normalizedHostname === "[::1]" ||
    normalizedHostname.startsWith("127.")
  ) {
    return "localhost";
  }

  if (
    normalizedHostname.startsWith("10.") ||
    normalizedHostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalizedHostname) ||
    normalizedHostname.startsWith("[fc") ||
    normalizedHostname.startsWith("[fd") ||
    normalizedHostname.startsWith("[fe80:") ||
    normalizedHostname.startsWith("169.254.") ||
    normalizedHostname === "0.0.0.0"
  ) {
    return "lan";
  }

  return "public";
}

function containsSecretLikeText(value: string): boolean {
  return /api[_-]?key|apikey|secret|private[_-]?token|access[_-]?token|auth(orization)?|bearer\s+|signature|sig=|sk-[a-z0-9]|token[=:/?&]|[?&]token=/i.test(value);
}

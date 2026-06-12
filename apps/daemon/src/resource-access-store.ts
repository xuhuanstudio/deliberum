import { createHash, randomBytes } from "node:crypto";
import type { ResourceUrlExposure } from "@deliberum/protocol";

export const RESOURCE_ACCESS_DEFAULT_TTL_MS = 5 * 60 * 1000;
export const RESOURCE_ACCESS_MAX_TTL_MS = 60 * 60 * 1000;

export type ResourceAccessClock = () => number;
export type ResourceAccessTokenGenerator = () => string;

export type ResourceAccessGrantMode = "redirect" | "content";

export type ResourceAccessContentReference = {
  dataRef: string;
  mime: string;
  sizeBytes: number;
  hash: string;
};

type ResourceAccessGrantBaseInput = {
  resourceAccessId: string;
  sessionId: string;
  resourceId: string;
  participantId: string;
  mode: ResourceAccessGrantMode;
  exposure: ResourceUrlExposure;
  ttlMs?: number;
  expiresAt?: number;
};

export type ResourceAccessGrantInput =
  | (ResourceAccessGrantBaseInput & {
      mode: "redirect";
      targetUrl: string;
    })
  | (ResourceAccessGrantBaseInput & {
      mode: "content";
      content: ResourceAccessContentReference;
    });

type ResourceAccessGrantBase = {
  resourceAccessId: string;
  tokenHash: string;
  sessionId: string;
  resourceId: string;
  participantId: string;
  mode: ResourceAccessGrantMode;
  exposure: ResourceUrlExposure;
  createdAt: number;
  expiresAt: number;
  revokedAt?: number;
  accessCount: number;
  lastAccessedAt?: number;
};

export type ResourceAccessGrant =
  | (ResourceAccessGrantBase & {
      mode: "redirect";
      targetUrl: string;
    })
  | (ResourceAccessGrantBase & {
      mode: "content";
      content: ResourceAccessContentReference;
    });

export type ResourceAccessGrantCreated = {
  accessId: string;
  grant: ResourceAccessGrant;
};

export type ResourceAccessGrantSafeView = {
  resourceAccessId: string;
  sessionId: string;
  resourceId: string;
  participantId: string;
  mode: ResourceAccessGrantMode;
  exposure: ResourceUrlExposure;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  accessCount: number;
  lastAccessedAt?: string;
  content?: {
    mime: string;
    sizeBytes: number;
    hash: string;
  };
};

export type ResourceAccessGrantStoreLike = {
  createGrant(input: ResourceAccessGrantInput): ResourceAccessGrantCreated;
  recordAccess(accessId: string): ResourceAccessGrant;
  revokeGrant(accessId: string): ResourceAccessGrant;
  getSafeView(accessId: string): ResourceAccessGrantSafeView;
};

export class ResourceAccessError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ResourceAccessError";
    this.code = code;
  }
}

export type ResourceAccessGrantStoreOptions = {
  clock?: ResourceAccessClock;
  tokenGenerator?: ResourceAccessTokenGenerator;
  defaultTtlMs?: number;
};

export type CreateResourceAccessGrantRecordOptions = {
  accessId: string;
  now: number;
  defaultTtlMs: number;
};

export class ResourceAccessGrantStore implements ResourceAccessGrantStoreLike {
  private readonly grantsByTokenHash = new Map<string, ResourceAccessGrant>();
  private readonly clock: ResourceAccessClock;
  private readonly tokenGenerator: ResourceAccessTokenGenerator;
  private readonly defaultTtlMs: number;

  constructor(options: ResourceAccessGrantStoreOptions = {}) {
    this.clock = options.clock ?? (() => Date.now());
    this.tokenGenerator = options.tokenGenerator ?? createDefaultToken;
    this.defaultTtlMs = parseResourceAccessTtlMs(
      options.defaultTtlMs ?? RESOURCE_ACCESS_DEFAULT_TTL_MS,
      "defaultTtlMs"
    );
  }

  createGrant(input: ResourceAccessGrantInput): ResourceAccessGrantCreated {
    const now = this.clock();
    const token = this.createUniqueToken();
    const grant = createResourceAccessGrantRecord(input, {
      accessId: token,
      now,
      defaultTtlMs: this.defaultTtlMs
    });

    this.grantsByTokenHash.set(grant.tokenHash, grant);

    return {
      accessId: token,
      grant: cloneGrant(grant)
    };
  }

  recordAccess(accessId: string): ResourceAccessGrant {
    const grant = this.getActiveGrant(accessId);
    grant.accessCount += 1;
    grant.lastAccessedAt = this.clock();

    return cloneGrant(grant);
  }

  revokeGrant(accessId: string): ResourceAccessGrant {
    const grant = this.getGrantByAccessId(accessId);
    const now = this.clock();

    if (grant.revokedAt === undefined) {
      grant.revokedAt = now;
    }

    return cloneGrant(grant);
  }

  getSafeView(accessId: string): ResourceAccessGrantSafeView {
    return toSafeView(this.getGrantByAccessId(accessId));
  }

  private getActiveGrant(accessId: string): ResourceAccessGrant {
    const grant = this.getGrantByAccessId(accessId);
    const now = this.clock();

    if (grant.revokedAt !== undefined) {
      throw new ResourceAccessError(
        "resource_access_revoked",
        "Resource access grant has been revoked."
      );
    }

    if (grant.expiresAt <= now) {
      this.grantsByTokenHash.delete(grant.tokenHash);
      throw new ResourceAccessError(
        "resource_access_expired",
        "Resource access grant is expired."
      );
    }

    return grant;
  }

  private getGrantByAccessId(accessId: string): ResourceAccessGrant {
    const tokenHash = createResourceAccessTokenHash(accessId);
    const grant = this.grantsByTokenHash.get(tokenHash);

    if (!grant) {
      throw new ResourceAccessError(
        "resource_access_not_found",
        "Resource access grant was not found."
      );
    }

    return grant;
  }

  private createUniqueToken(): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const token = this.tokenGenerator();
      const accessId = parseResourceAccessId(token);
      if (!this.grantsByTokenHash.has(createResourceAccessTokenHash(accessId))) {
        return accessId;
      }
    }

    throw new ResourceAccessError(
      "resource_access_token_unavailable",
      "Resource access token could not be generated."
    );
  }
}

export function createResourceAccessUrl(baseUrl: string, accessId: string): string {
  const parsed = parseBaseUrl(baseUrl);
  const basePath = parsed.pathname.replace(/\/$/, "");
  parsed.pathname = `${basePath}/resource-access/${encodeURIComponent(parseResourceAccessId(accessId))}`;
  parsed.search = "";
  parsed.hash = "";

  return parsed.toString();
}

export function classifyResourceAccessBaseUrl(baseUrl: string): ResourceUrlExposure {
  const parsed = parseBaseUrl(baseUrl);
  const hostname = parsed.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.startsWith("127.")
  ) {
    return "localhost";
  }

  if (
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    hostname.startsWith("[fc") ||
    hostname.startsWith("[fd") ||
    hostname.startsWith("[fe80:") ||
    hostname.startsWith("169.254.")
  ) {
    return "lan";
  }

  return "public";
}

export function toResourceAccessSafeView(
  grant: ResourceAccessGrant
): ResourceAccessGrantSafeView {
  return toSafeView(grant);
}

export function createResourceAccessGrantRecord(
  input: ResourceAccessGrantInput,
  options: CreateResourceAccessGrantRecordOptions
): ResourceAccessGrant {
  const now = parseResourceAccessTimestamp(options.now, "now");
  const expiresAt = resolveExpiresAt(
    now,
    input.expiresAt,
    input.ttlMs ?? options.defaultTtlMs
  );
  const baseGrant = {
    resourceAccessId: parseNonEmpty(input.resourceAccessId, "resourceAccessId"),
    tokenHash: createResourceAccessTokenHash(options.accessId),
    sessionId: parseNonEmpty(input.sessionId, "sessionId"),
    resourceId: parseNonEmpty(input.resourceId, "resourceId"),
    participantId: parseNonEmpty(input.participantId, "participantId"),
    mode: input.mode,
    exposure: parseResourceAccessExposure(input.exposure),
    createdAt: now,
    expiresAt,
    accessCount: 0
  };

  return input.mode === "redirect"
    ? parseResourceAccessGrantRecord({
        ...baseGrant,
        mode: "redirect",
        targetUrl: parseSafeTargetUrl(input.targetUrl)
      })
    : parseResourceAccessGrantRecord({
        ...baseGrant,
        mode: "content",
        content: parseContentGrantMaterial(input.content)
      });
}

export function parseResourceAccessGrantRecord(input: unknown): ResourceAccessGrant {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ResourceAccessError(
      "invalid_resource_access_grant",
      "Resource access grant must be an object."
    );
  }

  const record = input as Record<string, unknown>;
  const mode = record.mode;
  const baseGrant = {
    resourceAccessId: parseNonEmpty(record.resourceAccessId as string, "resourceAccessId"),
    tokenHash: parseNonEmpty(record.tokenHash as string, "tokenHash"),
    sessionId: parseNonEmpty(record.sessionId as string, "sessionId"),
    resourceId: parseNonEmpty(record.resourceId as string, "resourceId"),
    participantId: parseNonEmpty(record.participantId as string, "participantId"),
    exposure: parseResourceAccessExposure(record.exposure),
    createdAt: parseResourceAccessTimestamp(record.createdAt, "createdAt"),
    expiresAt: parseResourceAccessTimestamp(record.expiresAt, "expiresAt"),
    accessCount: parseResourceAccessCount(record.accessCount, "accessCount"),
    ...(record.revokedAt !== undefined
      ? { revokedAt: parseResourceAccessTimestamp(record.revokedAt, "revokedAt") }
      : {}),
    ...(record.lastAccessedAt !== undefined
      ? {
          lastAccessedAt: parseResourceAccessTimestamp(
            record.lastAccessedAt,
            "lastAccessedAt"
          )
        }
      : {})
  };

  if (mode === "redirect") {
    return {
      ...baseGrant,
      mode: "redirect",
      targetUrl: parseSafeTargetUrl(record.targetUrl as string)
    };
  }

  if (mode === "content") {
    return {
      ...baseGrant,
      mode: "content",
      content: parseContentGrantMaterial(record.content as ResourceAccessContentReference)
    };
  }

  throw new ResourceAccessError(
    "invalid_resource_access_grant",
    "Resource access grant mode is invalid."
  );
}

export function createResourceAccessTokenHash(accessId: string): string {
  return createHash("sha256").update(parseResourceAccessId(accessId)).digest("hex");
}

export function parseResourceAccessId(value: string): string {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(value)) {
    throw new ResourceAccessError(
      "invalid_resource_access_id",
      "Resource access id is invalid."
    );
  }

  return value;
}

export function parseResourceAccessTtlMs(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0 || value > RESOURCE_ACCESS_MAX_TTL_MS) {
    throw new ResourceAccessError(
      "invalid_resource_access_ttl",
      `${name} must be a positive integer no greater than ${RESOURCE_ACCESS_MAX_TTL_MS}.`
    );
  }

  return value;
}

function resolveExpiresAt(now: number, explicitExpiresAt: number | undefined, ttlMs: number): number {
  const ttlExpiresAt = now + parseResourceAccessTtlMs(ttlMs, "ttlMs");

  if (explicitExpiresAt === undefined) {
    return ttlExpiresAt;
  }

  if (!Number.isInteger(explicitExpiresAt) || explicitExpiresAt <= now) {
    throw new ResourceAccessError(
      "invalid_resource_access_expiry",
      "Resource access expiresAt must be a future millisecond timestamp."
    );
  }

  return Math.min(explicitExpiresAt, ttlExpiresAt);
}

function parseNonEmpty(value: string, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ResourceAccessError(
      "invalid_resource_access_grant",
      `${name} must be a non-empty string.`
    );
  }

  return value.trim();
}

function parseContentGrantMaterial(input: ResourceAccessContentReference): ResourceAccessContentReference {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ResourceAccessError(
      "invalid_resource_access_grant",
      "content must be a resource content reference."
    );
  }

  const record = input as Record<string, unknown>;
  const sizeBytes = record.sizeBytes;

  if (!Number.isInteger(sizeBytes) || (sizeBytes as number) < 0) {
    throw new ResourceAccessError(
      "invalid_resource_access_grant",
      "content sizeBytes must be a nonnegative integer."
    );
  }

  return {
    dataRef: parseNonEmpty(record.dataRef as string, "content.dataRef"),
    mime: parseNonEmpty(record.mime as string, "content.mime"),
    sizeBytes: sizeBytes as number,
    hash: parseNonEmpty(record.hash as string, "content.hash")
  };
}

function parseResourceAccessExposure(value: unknown): ResourceUrlExposure {
  if (value === "localhost" || value === "lan" || value === "public") {
    return value;
  }

  throw new ResourceAccessError(
    "invalid_resource_access_grant",
    "Resource access exposure is invalid."
  );
}

function parseResourceAccessTimestamp(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new ResourceAccessError(
      "invalid_resource_access_grant",
      `${name} must be a nonnegative millisecond timestamp.`
    );
  }

  return value as number;
}

function parseResourceAccessCount(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new ResourceAccessError(
      "invalid_resource_access_grant",
      `${name} must be a nonnegative integer.`
    );
  }

  return value as number;
}

function parseBaseUrl(value: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new ResourceAccessError(
      "invalid_resource_access_base_url",
      "Resource access base URL must be a valid HTTP(S) URL."
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ResourceAccessError(
      "invalid_resource_access_base_url",
      "Resource access base URL must use HTTP(S)."
    );
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ResourceAccessError(
      "invalid_resource_access_base_url",
      "Resource access base URL must not include credentials, query, or fragment material."
    );
  }

  return parsed;
}

function parseSafeTargetUrl(value: string): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new ResourceAccessError(
      "invalid_resource_access_target",
      "Resource access target URL must be a valid HTTP(S) URL."
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ResourceAccessError(
      "invalid_resource_access_target",
      "Resource access target URL must use HTTP(S)."
    );
  }

  if (parsed.username || parsed.password) {
    throw new ResourceAccessError(
      "invalid_resource_access_target",
      "Resource access target URL must not include credentials."
    );
  }

  return parsed.toString();
}

function toSafeView(grant: ResourceAccessGrant): ResourceAccessGrantSafeView {
  return {
    resourceAccessId: grant.resourceAccessId,
    sessionId: grant.sessionId,
    resourceId: grant.resourceId,
    participantId: grant.participantId,
    mode: grant.mode,
    exposure: grant.exposure,
    createdAt: new Date(grant.createdAt).toISOString(),
    expiresAt: new Date(grant.expiresAt).toISOString(),
    ...(grant.revokedAt !== undefined
      ? { revokedAt: new Date(grant.revokedAt).toISOString() }
      : {}),
    accessCount: grant.accessCount,
    ...(grant.lastAccessedAt !== undefined
      ? { lastAccessedAt: new Date(grant.lastAccessedAt).toISOString() }
      : {}),
    ...(grant.mode === "content"
      ? {
          content: {
            mime: grant.content.mime,
            sizeBytes: grant.content.sizeBytes,
            hash: grant.content.hash
          }
        }
      : {})
  };
}

function cloneGrant(grant: ResourceAccessGrant): ResourceAccessGrant {
  return structuredClone(grant);
}

function createDefaultToken(): string {
  return randomBytes(32).toString("base64url");
}

import {
  DeliberationRunPlanSchema,
  EnvVarNameSchema,
  type DeliberationRunPlan
} from "./types";
import { RunPlanValidationError } from "./errors";

const SECRET_KEY_NAMES = new Set([
  "apikey",
  "api_key",
  "authorization",
  "authtoken",
  "auth_token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "secret",
  "clientsecret",
  "client_secret",
  "password",
  "privatekey",
  "private_key",
  "privatetoken",
  "private_token",
  "credential",
  "credentials"
]);

const SAFE_SECRET_REFERENCE_KEYS = new Set(["apiKeyEnvVar", "providerConfigId"]);

export function validateDeliberationRunPlan(input: unknown): DeliberationRunPlan {
  rejectUnsafeInlineMaterial(input);

  const parsed = DeliberationRunPlanSchema.safeParse(input);
  if (!parsed.success) {
    throw new RunPlanValidationError(
      `Run plan is invalid at ${formatIssuePaths(parsed.error.issues)}.`
    );
  }

  rejectDuplicateIds(
    parsed.data.participants.map((participant) => participant.id),
    "participants"
  );
  rejectDuplicateIds(
    parsed.data.providerConfigs.map((providerConfig) => providerConfig.id),
    "providerConfigs"
  );
  rejectMissingProviderReferences(parsed.data);
  rejectUnsafeProviderUrls(parsed.data);
  rejectDuplicateIds(parsed.data.sealedDivergence.participantIds ?? [], "sealedDivergence.participantIds");

  for (const providerConfig of parsed.data.providerConfigs) {
    if (
      providerConfig.apiKeyEnvVar !== undefined &&
      !EnvVarNameSchema.safeParse(providerConfig.apiKeyEnvVar).success
    ) {
      throw new RunPlanValidationError(
        "Run plan provider config has an invalid apiKeyEnvVar reference."
      );
    }
  }

  return structuredClone(parsed.data);
}

function rejectUnsafeInlineMaterial(input: unknown): void {
  scanValue(input, "runPlan");
}

function scanValue(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (containsSecretLikeValue(value) || looksLikePrivateLocalPath(value)) {
      throw new RunPlanValidationError(`Run plan contains unsafe inline material at ${path}.`);
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanValue(entry, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;

    if (!SAFE_SECRET_REFERENCE_KEYS.has(key) && SECRET_KEY_NAMES.has(normalizeKey(key))) {
      throw new RunPlanValidationError(
        `Run plan contains an unsafe inline credential field at ${nestedPath}.`
      );
    }

    scanValue(nestedValue, nestedPath);
  }
}

function rejectDuplicateIds(ids: readonly string[], collectionName: string): void {
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) {
      throw new RunPlanValidationError(`Run plan contains duplicate ids in ${collectionName}.`);
    }

    seen.add(id);
  }
}

function rejectMissingProviderReferences(plan: DeliberationRunPlan): void {
  const providerConfigIds = new Set(plan.providerConfigs.map((providerConfig) => providerConfig.id));

  for (const participant of plan.participants) {
    if (participant.providerConfigId && !providerConfigIds.has(participant.providerConfigId)) {
      throw new RunPlanValidationError(
        `Run participant references an unknown provider config: ${participant.id}.`
      );
    }
  }
}

function rejectUnsafeProviderUrls(plan: DeliberationRunPlan): void {
  for (const providerConfig of plan.providerConfigs) {
    if (!providerConfig.baseUrl) {
      continue;
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(providerConfig.baseUrl);
    } catch {
      throw new RunPlanValidationError("Run provider config has an invalid baseUrl.");
    }

    if (parsedUrl.username || parsedUrl.password || containsSecretLikeValue(parsedUrl.toString())) {
      throw new RunPlanValidationError("Run provider config has an unsafe baseUrl.");
    }
  }
}

function normalizeKey(key: string): string {
  return key.replace(/[-\s]/g, "").toLowerCase();
}

function containsSecretLikeValue(value: string): boolean {
  return (
    /bearer\s+[a-z0-9._~+/-]{8,}/i.test(value) ||
    /\bsk-[a-z0-9_-]{8,}\b/i.test(value) ||
    /\b(api[_-]?key|secret|access[_-]?token|private[_-]?token|authorization)=\S{4,}/i.test(
      value
    ) ||
    /\b(auth(orization)?):\s*\S{8,}/i.test(value)
  );
}

function looksLikePrivateLocalPath(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.startsWith("file:") ||
    normalized.startsWith("/users/") ||
    normalized.startsWith("/home/") ||
    normalized.startsWith("/private/") ||
    normalized.startsWith("~/.ssh/") ||
    /^[a-z]:\\users\\/i.test(value) ||
    normalized.includes("/.ssh/")
  );
}

function formatIssuePaths(issues: readonly { path: PropertyKey[] }[]): string {
  const issuePaths = issues
    .map((issue) => formatPath(issue.path))
    .filter((path, index, paths) => paths.indexOf(path) === index);

  return issuePaths.length > 0 ? issuePaths.join(", ") : "runPlan";
}

function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "runPlan";
  }

  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === "number") {
      return `${formatted}[${segment}]`;
    }

    return `${formatted}.${String(segment)}`;
  }, "runPlan");
}

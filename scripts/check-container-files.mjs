import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const findings = [];

const dockerfile = readTrackedText("Dockerfile");
const compose = readTrackedText("compose.yaml");
const containerSmoke = readTrackedText("scripts/smoke-container-local.mjs");

checkDockerfile();
checkCompose();
checkContainerSmoke();

if (findings.length > 0) {
  console.error("Container file check failed.");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exitCode = 1;
} else {
  console.log("Container file check passed.");
}

function checkDockerfile() {
  requireMatch("Dockerfile", dockerfile, /FROM node:24-bookworm-slim AS deps/, "uses the Node 24 dependency stage");
  requireMatch("Dockerfile", dockerfile, /FROM node:24-bookworm-slim AS runtime/, "uses the Node 24 runtime stage");
  requireMatch(
    "Dockerfile",
    dockerfile,
    /apt-get install -y --no-install-recommends git python3 make g\+\+/,
    "installs build-time tools needed by workspace CI"
  );
  requireMatch(
    "Dockerfile",
    dockerfile,
    /RUN pnpm exec playwright install --with-deps chromium/,
    "installs the browser needed by Web smoke checks during image build"
  );
  requireMatch(
    "Dockerfile",
    dockerfile,
    /RUN git init --quiet && git add -A && pnpm run ci && rm -rf \.git/,
    "runs workspace CI during image build without copying host git metadata to runtime"
  );
  requireMatch(
    "Dockerfile",
    dockerfile,
    /pnpm --filter @deliberum\/daemon --prod deploy --legacy \/app\/deploy/,
    "creates a production daemon deploy directory with workspace dependencies"
  );
  requireMatch(
    "Dockerfile",
    dockerfile,
    /COPY --from=build --chown=deliberum:deliberum \/app\/deploy \.\//,
    "copies the production daemon deploy directory into the runtime image"
  );
  requireMatch(
    "Dockerfile",
    dockerfile,
    /COPY --from=build --chown=deliberum:deliberum \/app\/apps\/web\/dist \.\/apps\/web\/dist/,
    "copies only the built Web shell into the runtime image"
  );
  rejectMatch(
    "Dockerfile",
    dockerfile,
    /COPY --from=build --chown=deliberum:deliberum \/app\/apps \.\/apps/,
    "must not copy the full workspace apps tree into the runtime image"
  );
  rejectMatch(
    "Dockerfile",
    dockerfile,
    /COPY --from=build --chown=deliberum:deliberum \/app\/packages \.\/packages/,
    "must not rely on workspace symlinks in the runtime image"
  );
  requireMatch("Dockerfile", dockerfile, /DELIBERUM_HOST=0\.0\.0\.0/, "binds the daemon inside the container");
  requireMatch("Dockerfile", dockerfile, /DELIBERUM_PORT=3877/, "uses the documented local port");
  requireMatch(
    "Dockerfile",
    dockerfile,
    /DELIBERUM_DAEMON_SQLITE_PATH=\/data\/deliberum\.sqlite/,
    "stores durable daemon state under /data"
  );
  requireMatch(
    "Dockerfile",
    dockerfile,
    /DELIBERUM_DAEMON_WEB_ASSETS_PATH=\/app\/apps\/web\/dist/,
    "serves the built Web shell from the daemon"
  );
  requireMatch("Dockerfile", dockerfile, /USER deliberum/, "runs as the non-root deliberum user");
  requireMatch("Dockerfile", dockerfile, /EXPOSE 3877/, "documents the daemon port");
  requireMatch("Dockerfile", dockerfile, /VOLUME \["\/data"\]/, "declares the durable data volume");
  requireMatch("Dockerfile", dockerfile, /HEALTHCHECK[\s\S]*\/health/, "keeps a daemon health check");
  requireMatch(
    "Dockerfile",
    dockerfile,
    /CMD \["node", "dist\/index\.js"\]/,
    "starts the deployed daemon"
  );
  rejectSecretLikeEntries("Dockerfile", dockerfile);
}

function checkCompose() {
  requireMatch("compose.yaml", compose, /image:\s+deliberum:local/, "uses the documented local image name");
  requireMatch(
    "compose.yaml",
    compose,
    /"127\.0\.0\.1:3877:3877"/,
    "keeps the host-side port bound to localhost"
  );
  requireMatch("compose.yaml", compose, /DELIBERUM_HOST:\s+0\.0\.0\.0/, "binds the daemon inside the container");
  requireMatch("compose.yaml", compose, /DELIBERUM_PORT:\s+3877/, "uses the documented local port");
  requireMatch(
    "compose.yaml",
    compose,
    /DELIBERUM_DAEMON_SQLITE_PATH:\s+\/data\/deliberum\.sqlite/,
    "stores durable daemon state under /data"
  );
  requireMatch(
    "compose.yaml",
    compose,
    /DELIBERUM_DAEMON_WEB_ASSETS_PATH:\s+\/app\/apps\/web\/dist/,
    "serves the built Web shell from the daemon"
  );
  requireMatch("compose.yaml", compose, /deliberum-data:\/data/, "mounts the durable data volume");
  requireMatch("compose.yaml", compose, /^volumes:\s*[\s\S]*deliberum-data:/m, "declares the durable data volume");
  rejectSecretLikeEntries("compose.yaml", compose);
}

function checkContainerSmoke() {
  requireMatch(
    "scripts/smoke-container-local.mjs",
    containerSmoke,
    /"inspect"[\s\S]*\.State\.Status/,
    "captures container state before cleanup when runtime smoke fails"
  );
  rejectMatch(
    "scripts/smoke-container-local.mjs",
    containerSmoke,
    /"run",\s*"--rm"/,
    "must keep failed smoke containers available for logs before cleanup"
  );
  rejectSecretLikeEntries("scripts/smoke-container-local.mjs", containerSmoke);
}

function readTrackedText(filePath) {
  return readFileSync(resolve(repoRoot, filePath), "utf8");
}

function requireMatch(filePath, content, pattern, expectation) {
  if (!pattern.test(content)) {
    findings.push(`${filePath}: expected ${expectation}`);
  }
}

function rejectMatch(filePath, content, pattern, expectation) {
  if (pattern.test(content)) {
    findings.push(`${filePath}: ${expectation}`);
  }
}

function rejectSecretLikeEntries(filePath, content) {
  const secretLikePattern =
    /\b(?:DELIBERUM_OPENAI_API_KEY|DELIBERUM_RELEASE_SMOKE_API_KEY|OPENAI_API_KEY|API_KEY|AUTH_TOKEN|BEARER_TOKEN|SIGNING_SECRET)\b/i;
  const matches = content.match(secretLikePattern);

  if (matches) {
    findings.push(`${filePath}: must not bake secret-like setting ${matches[0]} into container files`);
  }
}

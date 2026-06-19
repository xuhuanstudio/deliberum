import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const findings = [];

const dockerfile = readTrackedText("Dockerfile");
const compose = readTrackedText("compose.yaml");

checkDockerfile();
checkCompose();

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
    /RUN git init --quiet && git add -A && pnpm run ci && rm -rf \.git/,
    "runs workspace CI during image build without copying host git metadata to runtime"
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
    /CMD \["node", "apps\/daemon\/dist\/index\.js"\]/,
    "starts the built daemon"
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

function readTrackedText(filePath) {
  return readFileSync(resolve(repoRoot, filePath), "utf8");
}

function requireMatch(filePath, content, pattern, expectation) {
  if (!pattern.test(content)) {
    findings.push(`${filePath}: expected ${expectation}`);
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

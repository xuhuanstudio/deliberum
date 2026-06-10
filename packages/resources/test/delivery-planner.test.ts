import { describe, expect, it } from "vitest";
import {
  DeliveryPlanner,
  InMemoryResourceBroker,
  InvalidResourcePolicyError,
  resourceSensitivityFromPrivacy
} from "../src";
import * as resources from "../src";
import type { Resource, ResourceDeliveryPlan } from "../src";

function createResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: "resource-1",
    kind: "image",
    mime: "image/png",
    sizeBytes: 12,
    hash: "sha256-fixture",
    privacy: "public",
    variants: [
      {
        mode: "url",
        url: "https://resources.example/r1.png",
        exposure: "public"
      },
      {
        mode: "base64",
        mime: "image/png",
        dataRef: "content-1",
        sizeBytes: 12
      }
    ],
    ...overrides
  };
}

function createPlanner(resource = createResource(), content = "aW1hZ2UtZGF0YQ==") {
  const broker = new InMemoryResourceBroker();

  broker.registerResource({
    resource,
    contents:
      resource.variants.some((variant) => variant.mode === "base64")
        ? [
            {
              dataRef: "content-1",
              base64: content
            }
          ]
        : []
  });

  return {
    broker,
    planner: new DeliveryPlanner({ broker })
  };
}

function createBase64Plan(content: string, overrides: Partial<Resource> = {}) {
  const { planner } = createPlanner(
    createResource({
      variants: [
        {
          mode: "base64",
          mime: "text/plain",
          dataRef: "content-1",
          sizeBytes: 64
        }
      ],
      ...overrides
    }),
    content
  );

  return planner.planDelivery({
    resourceId: "resource-1",
    participantId: "participant-1",
    policy: {
      requestedMode: "base64",
      allowBase64: true,
      maxBase64SizeBytes: 64
    }
  });
}

function createUrlPlan(url: string, exposure: "localhost" | "lan" | "public" = "public") {
  const { planner } = createPlanner(
    createResource({
      variants: [
        {
          mode: "url",
          url,
          exposure
        }
      ]
    })
  );

  return planner.planDelivery({
    resourceId: "resource-1",
    participantId: "participant-1",
    policy: {
      requestedMode: "url",
      allowPublicUrl: true
    }
  });
}

function planText(plan: ResourceDeliveryPlan): string {
  return JSON.stringify(plan);
}

describe("DeliveryPlanner", () => {
  it("maps protocol private privacy to internal sensitivity", () => {
    expect(resourceSensitivityFromPrivacy("public")).toBe("public");
    expect(resourceSensitivityFromPrivacy("private")).toBe("internal");
    expect(resourceSensitivityFromPrivacy("sensitive")).toBe("sensitive");
  });

  it("defaults sensitive resources to none even when permissive policy is supplied", () => {
    const { planner } = createPlanner(
      createResource({
        privacy: "sensitive"
      })
    );

    const plan = planner.planDelivery({
      resourceId: "resource-1",
      participantId: "participant-1",
      policy: {
        allowPublicUrl: true,
        allowBase64: true,
        maxBase64SizeBytes: 100
      }
    });

    expect(plan).toMatchObject({
      resourceId: "resource-1",
      participantId: "participant-1",
      selectedMode: "none",
      allowed: false,
      reason: "Sensitive resources are not deliverable in Stage 12."
    });
    expect(plan.warnings).toContain(
      "Sensitive resource delivery requires a future explicit secure workflow."
    );
    expect(plan).not.toHaveProperty("delivery");
  });

  it("requires explicit allowPublicUrl for public URL delivery", () => {
    const { planner } = createPlanner();

    const denied = planner.planDelivery({
      resourceId: "resource-1",
      participantId: "participant-1",
      policy: {
        requestedMode: "url"
      }
    });
    const allowed = planner.planDelivery({
      resourceId: "resource-1",
      participantId: "participant-1",
      policy: {
        requestedMode: "url",
        allowPublicUrl: true
      }
    });

    expect(denied).toMatchObject({
      selectedMode: "none",
      allowed: false,
      reason: "Public URL delivery requires allowPublicUrl policy."
    });
    expect(planText(denied)).not.toContain("https://resources.example/r1.png");
    expect(allowed).toMatchObject({
      selectedMode: "url",
      allowed: true,
      delivery: {
        mode: "url",
        url: "https://resources.example/r1.png",
        exposure: "public"
      }
    });
  });

  it("does not expose public URLs by default", () => {
    const { planner } = createPlanner();

    const plan = planner.planDelivery({
      resourceId: "resource-1",
      participantId: "participant-1"
    });

    expect(plan.selectedMode).toBe("none");
    expect(plan.allowed).toBe(false);
    expect(planText(plan)).not.toContain("https://resources.example/r1.png");
  });

  it("requires explicit base64 policy and size limits", () => {
    const { planner } = createPlanner();

    const deniedWithoutPolicy = planner.planDelivery({
      resourceId: "resource-1",
      participantId: "participant-1",
      policy: {
        requestedMode: "base64"
      }
    });
    const deniedWithoutLimit = planner.planDelivery({
      resourceId: "resource-1",
      participantId: "participant-1",
      policy: {
        requestedMode: "base64",
        allowBase64: true
      }
    });
    const deniedByLimit = planner.planDelivery({
      resourceId: "resource-1",
      participantId: "participant-1",
      policy: {
        requestedMode: "base64",
        allowBase64: true,
        maxBase64SizeBytes: 4
      }
    });
    const allowed = planner.planDelivery({
      resourceId: "resource-1",
      participantId: "participant-1",
      policy: {
        requestedMode: "base64",
        allowBase64: true,
        maxBase64SizeBytes: 12
      }
    });

    expect(deniedWithoutPolicy).toMatchObject({
      selectedMode: "none",
      reason: "Base64 delivery requires allowBase64 policy."
    });
    expect(deniedWithoutLimit).toMatchObject({
      selectedMode: "none",
      reason: "Base64 delivery requires maxBase64SizeBytes policy."
    });
    expect(deniedByLimit).toMatchObject({
      selectedMode: "none",
      reason: "In-memory base64 content exceeds the configured size limit."
    });
    expect(allowed).toMatchObject({
      selectedMode: "base64",
      allowed: true,
      delivery: {
        mode: "base64",
        mime: "image/png",
        data: "aW1hZ2UtZGF0YQ==",
        sizeBytes: 10
      }
    });
  });

  it("returns none when explicit in-memory base64 content is missing", () => {
    const broker = new InMemoryResourceBroker();

    broker.registerResource({
      resource: createResource()
    });
    const planner = new DeliveryPlanner({ broker });
    const plan = planner.planDelivery({
      resourceId: "resource-1",
      participantId: "participant-1",
      policy: {
        requestedMode: "base64",
        allowBase64: true,
        maxBase64SizeBytes: 100
      }
    });

    expect(plan).toMatchObject({
      selectedMode: "none",
      allowed: false,
      reason: "No base64 variant has explicit in-memory content within the configured size limit."
    });
  });

  it("rejects invalid, base64url, whitespace, and malformed padding base64 without leaking content", () => {
    const unsafeContents = ["not base64!", "YWJj-ZA==", "YW JjZA==", "YQ="];

    for (const content of unsafeContents) {
      const plan = createBase64Plan(content);

      expect(plan).toMatchObject({
        selectedMode: "none",
        allowed: false,
        reason: "In-memory base64 content is not safe for delivery."
      });
      expect(planText(plan)).not.toContain(content);
    }
  });

  it("enforces base64 limits using decoded byte length", () => {
    const { planner } = createPlanner(
      createResource({
        variants: [
          {
            mode: "base64",
            mime: "text/plain",
            dataRef: "content-1",
            sizeBytes: 8
          }
        ]
      }),
      Buffer.from("12345").toString("base64")
    );

    const plan = planner.planDelivery({
      resourceId: "resource-1",
      participantId: "participant-1",
      policy: {
        requestedMode: "base64",
        allowBase64: true,
        maxBase64SizeBytes: 4
      }
    });

    expect(plan).toMatchObject({
      selectedMode: "none",
      allowed: false,
      reason: "In-memory base64 content exceeds the configured size limit."
    });
  });

  it("rejects decoded secret-like base64 text and declared-size mismatches without leaking content", () => {
    const secretText = "api_key=secret-value";
    const secretContent = Buffer.from(secretText).toString("base64");
    const secretPlan = createBase64Plan(secretContent);
    const mismatchPlan = createBase64Plan(Buffer.from("12345").toString("base64"), {
      variants: [
        {
          mode: "base64",
          mime: "text/plain",
          dataRef: "content-1",
          sizeBytes: 4
        }
      ]
    });

    expect(secretPlan).toMatchObject({
      selectedMode: "none",
      allowed: false,
      reason: "In-memory base64 content contains private delivery material."
    });
    expect(mismatchPlan).toMatchObject({
      selectedMode: "none",
      allowed: false,
      reason: "In-memory base64 content does not match registered resource metadata."
    });
    expect(planText(secretPlan)).not.toContain(secretContent);
    expect(planText(secretPlan)).not.toContain(secretText);
  });

  it("keeps safe base64 delivery working when explicitly allowed", () => {
    const content = Buffer.from("safe text").toString("base64");
    const plan = createBase64Plan(content);

    expect(plan).toMatchObject({
      selectedMode: "base64",
      allowed: true,
      delivery: {
        mode: "base64",
        data: content,
        sizeBytes: 9
      }
    });
  });

  it("uses participant-specific policy overrides", () => {
    const { broker } = createPlanner();
    const planner = new DeliveryPlanner({
      broker,
      defaultPolicy: {
        requestedMode: "base64",
        allowBase64: true,
        maxBase64SizeBytes: 100,
        participantOverrides: {
          "participant-url": {
            requestedMode: "url",
            allowPublicUrl: true
          }
        }
      }
    });

    const base64Plan = planner.planDelivery({
      resourceId: "resource-1",
      participantId: "participant-base64"
    });
    const urlPlan = planner.planDelivery({
      resourceId: "resource-1",
      participantId: "participant-url"
    });

    expect(base64Plan.selectedMode).toBe("base64");
    expect(urlPlan.selectedMode).toBe("url");
  });

  it("does not allow internal resources through public URL exposure", () => {
    const { planner } = createPlanner(
      createResource({
        privacy: "private"
      })
    );

    const plan = planner.planDelivery({
      resourceId: "resource-1",
      participantId: "participant-1",
      policy: {
        requestedMode: "url",
        allowPublicUrl: true
      }
    });

    expect(plan).toMatchObject({
      selectedMode: "none",
      allowed: false,
      reason: "Public URL exposure is only allowed for public resources in Stage 12."
    });
  });

  it("allows explicitly permitted localhost and LAN URL variants", () => {
    const localhostPlanner = createPlanner(
      createResource({
        variants: [
          {
            mode: "url",
            url: "http://127.0.0.1:3877/resource/r1",
            exposure: "localhost"
          }
        ]
      })
    ).planner;
    const lanPlanner = createPlanner(
      createResource({
        variants: [
          {
            mode: "url",
            url: "http://192.168.1.20/resource/r1",
            exposure: "lan"
          }
        ]
      })
    ).planner;

    expect(
      localhostPlanner.planDelivery({
        resourceId: "resource-1",
        participantId: "participant-1",
        policy: {
          requestedMode: "url",
          allowLocalhostUrl: true
        }
      })
    ).toMatchObject({
      selectedMode: "url",
      allowed: true
    });
    expect(
      lanPlanner.planDelivery({
        resourceId: "resource-1",
        participantId: "participant-1",
        policy: {
          requestedMode: "url",
          allowLanUrl: true
        }
      })
    ).toMatchObject({
      selectedMode: "url",
      allowed: true
    });
  });

  it("rejects unsafe URL path and query material without leaking the URL", () => {
    const unsafeUrls = [
      "https://resources.example/file.txt?download=private-token-value",
      "https://resources.example/file.txt?api_key=redacted",
      "https://resources.example/private-token/file.txt",
      "https://resources.example/private%2Dtoken/file.txt"
    ];

    for (const url of unsafeUrls) {
      const plan = createUrlPlan(url);

      expect(plan).toMatchObject({
        selectedMode: "none",
        allowed: false,
        reason: "Registered URL contains private delivery material."
      });
      expect(planText(plan)).not.toContain(url);
      expect(planText(plan)).not.toContain("private-token-value");
      expect(planText(plan)).not.toContain("api_key");
    }
  });

  it("rejects file URLs and local network public URLs without leaking the URL", () => {
    const fileUrl = "file:///Users/person/secret.txt";
    const localhostUrl = "http://localhost:3877/resource";
    const loopbackUrl = "http://127.0.0.1:3877/resource";
    const privateIpUrl = "http://10.0.0.12/resource";
    const privateIpv6Url = "http://[fc00::1]/resource";

    for (const plan of [
      createUrlPlan(fileUrl),
      createUrlPlan(localhostUrl),
      createUrlPlan(loopbackUrl),
      createUrlPlan(privateIpUrl),
      createUrlPlan(privateIpv6Url)
    ]) {
      expect(plan).toMatchObject({
        selectedMode: "none",
        allowed: false,
        reason: "Registered URL is not safe for delivery."
      });
      const serialized = planText(plan);
      expect(serialized).not.toContain("file://");
      expect(serialized).not.toContain("localhost");
      expect(serialized).not.toContain("127.0.0.1");
      expect(serialized).not.toContain("10.0.0.12");
      expect(serialized).not.toContain("fc00::1");
      expect(serialized).not.toContain("/Users/person/secret.txt");
    }
  });

  it("keeps safe public URL delivery working when explicitly allowed", () => {
    const plan = createUrlPlan("https://resources.example/public/file.txt");

    expect(plan).toMatchObject({
      selectedMode: "url",
      allowed: true,
      delivery: {
        mode: "url",
        url: "https://resources.example/public/file.txt"
      }
    });
  });

  it("sanitizes unsafe URLs and secret-like content from delivery plans", () => {
    const unsafeUrlPlanner = createPlanner(
      createResource({
        variants: [
          {
            mode: "url",
            url: "https://user:secret@resources.example/Users/me/private.png?token=private-token",
            exposure: "public"
          }
        ]
      })
    ).planner;
    const unsafeBase64Planner = createPlanner(createResource(), "sk-secret-token").planner;

    const unsafeUrlPlan = unsafeUrlPlanner.planDelivery({
      resourceId: "resource-1",
      participantId: "participant-1",
      policy: {
        requestedMode: "url",
        allowPublicUrl: true
      }
    });
    const unsafeBase64Plan = unsafeBase64Planner.planDelivery({
      resourceId: "resource-1",
      participantId: "participant-1",
      policy: {
        requestedMode: "base64",
        allowBase64: true,
        maxBase64SizeBytes: 100
      }
    });

    expect(unsafeUrlPlan.selectedMode).toBe("none");
    expect(unsafeBase64Plan.selectedMode).toBe("none");
    for (const plan of [unsafeUrlPlan, unsafeBase64Plan]) {
      const serialized = planText(plan);
      expect(serialized).not.toContain("secret");
      expect(serialized).not.toContain("/Users/me/private.png");
      expect(serialized).not.toContain("private-token");
      expect(serialized).not.toContain("sk-secret-token");
    }
  });

  it("rejects invalid policy limits", () => {
    const { planner } = createPlanner();

    expect(() =>
      planner.planDelivery({
        resourceId: "resource-1",
        participantId: "participant-1",
        policy: {
          allowBase64: true,
          maxBase64SizeBytes: -1
        }
      })
    ).toThrow(InvalidResourcePolicyError);
  });

  it("exports no semantic authority, adapter execution, or transport surfaces", () => {
    const exportedNames = Object.keys(resources);
    const forbiddenTerms = [
      "WebGET",
      "MCP",
      "Daemon",
      "Route",
      "WebUI",
      "CLI",
      "AdapterExecution",
      "FinalDecision",
      "Judge",
      "VoteWinner",
      "CurrentBest",
      "CentralRanker",
      "TruthSummary",
      "Ranking",
      "Voting",
      "FinalAnswer",
      "Chat"
    ];

    expect(exportedNames).toEqual(
      expect.arrayContaining([
        "DeliveryPlanner",
        "InMemoryResourceBroker",
        "resourceSensitivityFromPrivacy"
      ])
    );

    for (const exportedName of exportedNames) {
      for (const forbiddenTerm of forbiddenTerms) {
        expect(exportedName).not.toContain(forbiddenTerm);
      }
    }
  });
});

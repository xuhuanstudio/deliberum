import { describe, expect, it } from "vitest";
import {
  InMemoryResourceBroker,
  InvalidResourceRegistrationError,
  ResourceAlreadyRegisteredError
} from "../src";
import type { Resource } from "../src";

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

describe("InMemoryResourceBroker", () => {
  it("registers and retrieves resource metadata", () => {
    const broker = new InMemoryResourceBroker();
    const resource = createResource();

    const registered = broker.registerResource({
      resource,
      contents: [
        {
          dataRef: "content-1",
          base64: "aW1hZ2UtZGF0YQ=="
        }
      ]
    });

    expect(registered).toEqual(resource);
    expect(broker.getResource("resource-1")).toEqual(resource);
    expect(broker.listResources()).toEqual([resource]);
  });

  it("returns defensive metadata clones without exposing in-memory content as metadata", () => {
    const broker = new InMemoryResourceBroker();
    const resource = broker.registerResource({
      resource: createResource(),
      contents: [
        {
          dataRef: "content-1",
          base64: "aW1hZ2UtZGF0YQ=="
        }
      ]
    });
    const retrieved = broker.getResource("resource-1");

    expect(JSON.stringify(retrieved)).not.toContain("aW1hZ2UtZGF0YQ==");
    expect(broker.getExplicitInMemoryContent("content-1")).toBe("aW1hZ2UtZGF0YQ==");

    if (!retrieved) {
      throw new Error("Expected resource to be registered.");
    }

    retrieved.variants = [];
    expect(broker.getResource("resource-1")?.variants).toHaveLength(2);

    resource.variants = [];
    expect(broker.getResource("resource-1")?.variants).toHaveLength(2);
  });

  it("rejects invalid resource metadata", () => {
    const broker = new InMemoryResourceBroker();

    expect(() =>
      broker.registerResource({
        resource: {
          id: "resource-1"
        } as unknown as Resource
      })
    ).toThrow(InvalidResourceRegistrationError);
  });

  it("rejects duplicate resource ids", () => {
    const broker = new InMemoryResourceBroker();

    broker.registerResource({
      resource: createResource()
    });

    expect(() =>
      broker.registerResource({
        resource: createResource()
      })
    ).toThrow(ResourceAlreadyRegisteredError);
  });

  it("requires explicit in-memory content to match a registered base64 variant", () => {
    const broker = new InMemoryResourceBroker();

    expect(() =>
      broker.registerResource({
        resource: createResource(),
        contents: [
          {
            dataRef: "missing-content-ref",
            base64: "aW1hZ2UtZGF0YQ=="
          }
        ]
      })
    ).toThrow(InvalidResourceRegistrationError);
  });

  it("does not read local files implicitly", () => {
    const broker = new InMemoryResourceBroker();

    broker.registerResource({
      resource: createResource({
        id: "resource-local-ref",
        variants: [
          {
            mode: "base64",
            mime: "text/plain",
            dataRef: "/Users/example/private.txt",
            sizeBytes: 16
          }
        ]
      })
    });

    expect(broker.getExplicitInMemoryContent("/Users/example/private.txt")).toBeUndefined();
  });
});

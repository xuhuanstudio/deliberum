import { ResourceSchema, type Resource } from "@deliberum/protocol";
import {
  InvalidResourceRegistrationError,
  ResourceAlreadyRegisteredError
} from "./errors";
import {
  isBase64Variant,
  type InMemoryResourceContent,
  type ResourceBroker,
  type ResourceRegistration
} from "./types";

export class InMemoryResourceBroker implements ResourceBroker {
  private readonly resourcesById = new Map<string, Resource>();
  private readonly contentByDataRef = new Map<string, string>();

  registerResource(registration: ResourceRegistration): Resource {
    const resource = parseResource(registration.resource);

    if (this.resourcesById.has(resource.id)) {
      throw new ResourceAlreadyRegisteredError(resource.id);
    }

    validateContentRegistration(resource, registration.contents ?? [], this.contentByDataRef);

    this.resourcesById.set(resource.id, cloneResource(resource));

    for (const content of registration.contents ?? []) {
      this.contentByDataRef.set(content.dataRef, content.base64);
    }

    return cloneResource(resource);
  }

  getResource(resourceId: string): Resource | undefined {
    const resource = this.resourcesById.get(resourceId);

    return resource ? cloneResource(resource) : undefined;
  }

  listResources(): Resource[] {
    return [...this.resourcesById.values()].map((resource) => cloneResource(resource));
  }

  getExplicitInMemoryContent(dataRef: string): string | undefined {
    return this.contentByDataRef.get(dataRef);
  }
}

function parseResource(resource: unknown): Resource {
  const parsed = ResourceSchema.safeParse(resource);

  if (!parsed.success) {
    throw new InvalidResourceRegistrationError("Resource metadata must match the protocol schema.");
  }

  return parsed.data;
}

function validateContentRegistration(
  resource: Resource,
  contents: readonly InMemoryResourceContent[],
  existingContentByDataRef: ReadonlyMap<string, string>
): void {
  const resourceDataRefs = new Set(
    resource.variants.filter(isBase64Variant).map((variant) => variant.dataRef)
  );
  const seenDataRefs = new Set<string>();

  for (const content of contents) {
    if (typeof content.dataRef !== "string" || content.dataRef.length === 0) {
      throw new InvalidResourceRegistrationError("In-memory content requires a dataRef.");
    }

    if (typeof content.base64 !== "string") {
      throw new InvalidResourceRegistrationError("In-memory content must be a base64 string.");
    }

    if (!resourceDataRefs.has(content.dataRef)) {
      throw new InvalidResourceRegistrationError(
        "In-memory content dataRef must match a registered base64 variant."
      );
    }

    if (seenDataRefs.has(content.dataRef) || existingContentByDataRef.has(content.dataRef)) {
      throw new InvalidResourceRegistrationError("In-memory content dataRef must be unique.");
    }

    seenDataRefs.add(content.dataRef);
  }
}

function cloneResource(resource: Resource): Resource {
  return structuredClone(resource);
}

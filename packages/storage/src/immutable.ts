import type { EventEnvelope } from "@deliberum/protocol";

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer TItem)[]
    ? readonly DeepReadonly<TItem>[]
    : T extends object
      ? { readonly [TKey in keyof T]: DeepReadonly<T[TKey]> }
      : T;

export type StoredEvent<TPayload = unknown> = DeepReadonly<EventEnvelope<TPayload>>;

export function cloneEvent<TPayload>(event: EventEnvelope<TPayload>): EventEnvelope<TPayload> {
  return structuredClone(event);
}

export function cloneAndFreezeEvent<TPayload>(
  event: EventEnvelope<TPayload>
): StoredEvent<TPayload> {
  return deepFreeze(cloneEvent(event)) as StoredEvent<TPayload>;
}

export function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (typeof value !== "object" || value === null) {
    return value as DeepReadonly<T>;
  }

  for (const key of Reflect.ownKeys(value)) {
    const nested = (value as Record<PropertyKey, unknown>)[key];
    if (typeof nested === "object" && nested !== null && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }

  return Object.freeze(value) as DeepReadonly<T>;
}

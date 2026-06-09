import { describe, expect, it } from "vitest";
import type { AppendEventInput } from "../src";
import {
  DuplicateEventIdError,
  InMemoryEventStore,
  InvalidEventInputError,
  InvalidEventRangeError
} from "../src";

type TestPayload = {
  label: string;
  nested?: {
    count: number;
  };
};

function createStore() {
  let tick = 0;
  return new InMemoryEventStore({
    clock: () => `2026-06-10T00:00:${String(tick++).padStart(2, "0")}.000Z`
  });
}

function createInput(
  overrides: Partial<AppendEventInput<TestPayload>> = {}
): AppendEventInput<TestPayload> {
  return {
    id: "event-1",
    sessionId: "session-1",
    schemaVersion: "1",
    type: "test.event",
    authorId: "system",
    createdAt: "2026-06-10T00:00:00.000Z",
    basedOnEventIds: [],
    visibility: "public",
    trace: {},
    payload: {
      label: "payload"
    },
    ...overrides
  };
}

describe("InMemoryEventStore append behavior", () => {
  it("assigns monotonic sequence per session", () => {
    const store = createStore();

    const first = store.appendEvent(createInput({ id: "event-1" }));
    const second = store.appendEvent(createInput({ id: "event-2" }));
    const third = store.appendEvent(createInput({ id: "event-3" }));

    expect(first.sequence).toBe(0);
    expect(second.sequence).toBe(1);
    expect(third.sequence).toBe(2);
  });

  it("keeps sequence counters independent across sessions", () => {
    const store = createStore();

    const sessionAFirst = store.appendEvent(createInput({ id: "event-a-1", sessionId: "a" }));
    const sessionBFirst = store.appendEvent(createInput({ id: "event-b-1", sessionId: "b" }));
    const sessionASecond = store.appendEvent(createInput({ id: "event-a-2", sessionId: "a" }));

    expect(sessionAFirst.sequence).toBe(0);
    expect(sessionBFirst.sequence).toBe(0);
    expect(sessionASecond.sequence).toBe(1);
  });

  it("assigns recordedAt and rejects caller-provided sequence or recordedAt", () => {
    const store = createStore();

    const event = store.appendEvent(createInput());
    expect(event.recordedAt).toBe("2026-06-10T00:00:00.000Z");

    expect(() =>
      store.appendEvent({
        ...createInput({ id: "event-2" }),
        sequence: 99
      } as unknown as AppendEventInput<TestPayload>)
    ).toThrow(InvalidEventInputError);

    expect(() =>
      store.appendEvent({
        ...createInput({ id: "event-3" }),
        recordedAt: "2026-06-10T00:00:59.000Z"
      } as unknown as AppendEventInput<TestPayload>)
    ).toThrow(InvalidEventInputError);
  });

  it("returns immutable defensive event copies", () => {
    const store = createStore();
    const event = store.appendEvent(
      createInput({
        payload: {
          label: "original",
          nested: {
            count: 1
          }
        }
      })
    );

    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.payload)).toBe(true);
    expect(Object.isFrozen(event.payload.nested)).toBe(true);

    const mutableEvent = event as unknown as {
      payload: {
        label: string;
        nested: {
          count: number;
        };
      };
    };

    expect(() => {
      mutableEvent.payload.label = "changed";
    }).toThrow(TypeError);

    expect(() => {
      mutableEvent.payload.nested.count = 2;
    }).toThrow(TypeError);

    const storedAgain = store.getEvent<TestPayload>("event-1");
    expect(storedAgain?.payload.label).toBe("original");
    expect(storedAgain?.payload.nested?.count).toBe(1);
    expect(storedAgain).not.toBe(event);
  });

  it("returns the original event for repeated session-scoped idempotency keys", () => {
    const store = createStore();

    const first = store.appendEvent(
      createInput({
        id: "event-1",
        idempotencyKey: "logical-event"
      })
    );
    const duplicate = store.appendEvent(
      createInput({
        id: "event-2",
        idempotencyKey: "logical-event",
        payload: {
          label: "ignored duplicate"
        }
      })
    );

    expect(duplicate).toEqual(first);
    expect(duplicate).not.toBe(first);
    expect(store.listEvents("session-1")).toHaveLength(1);
  });

  it("allows the same idempotency key in different sessions", () => {
    const store = createStore();

    const first = store.appendEvent(
      createInput({
        id: "event-1",
        sessionId: "session-a",
        idempotencyKey: "logical-event"
      })
    );
    const second = store.appendEvent(
      createInput({
        id: "event-2",
        sessionId: "session-b",
        idempotencyKey: "logical-event"
      })
    );

    expect(first.sequence).toBe(0);
    expect(second.sequence).toBe(0);
    expect(store.listEvents("session-a")).toHaveLength(1);
    expect(store.listEvents("session-b")).toHaveLength(1);
  });

  it("rejects duplicate event ids for different logical events", () => {
    const store = createStore();

    store.appendEvent(createInput({ id: "event-1" }));

    expect(() => store.appendEvent(createInput({ id: "event-1" }))).toThrow(
      DuplicateEventIdError
    );
  });

  it("rejects invalid events through protocol validation", () => {
    const store = createStore();

    expect(() =>
      store.appendEvent({
        ...createInput(),
        trace: undefined
      } as unknown as AppendEventInput<TestPayload>)
    ).toThrow();
  });
});

describe("InMemoryEventStore query behavior", () => {
  it("gets events by id and lists events by session", () => {
    const store = createStore();

    const first = store.appendEvent(createInput({ id: "event-1" }));
    const second = store.appendEvent(createInput({ id: "event-2" }));
    store.appendEvent(createInput({ id: "other-session-event", sessionId: "other-session" }));

    expect(store.getEvent("event-1")).toEqual(first);
    expect(store.getEvent("missing-event")).toBeUndefined();
    expect(store.listEvents("session-1")).toEqual([first, second]);
  });

  it("lists events by inclusive sequence range", () => {
    const store = createStore();

    const first = store.appendEvent(createInput({ id: "event-1" }));
    const second = store.appendEvent(createInput({ id: "event-2" }));
    const third = store.appendEvent(createInput({ id: "event-3" }));

    expect(store.listEventsByRange("session-1", 1, 2)).toEqual([second, third]);
    expect(store.listEventsByRange("session-1", 0, 0)).toEqual([first]);
    expect(() => store.listEventsByRange("session-1", -1, 1)).toThrow(InvalidEventRangeError);
    expect(() => store.listEventsByRange("session-1", 2, 1)).toThrow(InvalidEventRangeError);
  });

  it("lists events by type", () => {
    const store = createStore();

    const first = store.appendEvent(createInput({ id: "event-1", type: "topic_contract" }));
    store.appendEvent(createInput({ id: "event-2", type: "claim" }));
    const third = store.appendEvent(createInput({ id: "event-3", type: "topic_contract" }));

    expect(store.listEventsByType("session-1", "topic_contract")).toEqual([first, third]);
  });

  it("lists events by batch id", () => {
    const store = createStore();

    const first = store.appendEvent(createInput({ id: "event-1", batchId: "batch-1" }));
    store.appendEvent(createInput({ id: "event-2", batchId: "batch-2" }));
    const third = store.appendEvent(createInput({ id: "event-3", batchId: "batch-1" }));

    expect(store.listEventsByBatch("session-1", "batch-1")).toEqual([first, third]);
  });

  it("lists events by visibility", () => {
    const store = createStore();

    const first = store.appendEvent(createInput({ id: "event-1", visibility: "sealed" }));
    store.appendEvent(createInput({ id: "event-2", visibility: "public" }));
    const third = store.appendEvent(createInput({ id: "event-3", visibility: "sealed" }));

    expect(store.listEventsByVisibility("session-1", "sealed")).toEqual([first, third]);
  });

  it("appends multiple events in order", () => {
    const store = createStore();

    const events = store.appendEvents([
      createInput({ id: "event-1" }),
      createInput({ id: "event-2" })
    ]);

    expect(events.map((event) => event.sequence)).toEqual([0, 1]);
    expect(store.listEvents("session-1")).toEqual(events);
  });
});

describe("InMemoryEventStore mutation surface", () => {
  it("does not expose update or delete mutation APIs", () => {
    const store = new InMemoryEventStore() as unknown as Record<string, unknown>;

    expect(store.updateEvent).toBeUndefined();
    expect(store.deleteEvent).toBeUndefined();
    expect(store.removeEvent).toBeUndefined();
    expect(store.replaceEvent).toBeUndefined();
  });
});

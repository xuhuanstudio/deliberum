import type { StoredEvent } from "@deliberum/storage";

export type DaemonEventListener = (event: StoredEvent) => void | Promise<void>;
export type DaemonEventUnsubscribe = () => void;

export class DaemonEventBus {
  private readonly listenersBySession = new Map<string, Set<DaemonEventListener>>();

  subscribe(sessionId: string, listener: DaemonEventListener): DaemonEventUnsubscribe {
    const listeners = this.listenersBySession.get(sessionId) ?? new Set<DaemonEventListener>();
    listeners.add(listener);
    this.listenersBySession.set(sessionId, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listenersBySession.delete(sessionId);
      }
    };
  }

  publish(event: StoredEvent): void {
    const listeners = this.listenersBySession.get(event.sessionId);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      void Promise.resolve(listener(event)).catch(() => {
        // A failed listener must not stop publishing to other subscribers.
      });
    }
  }

  listenerCount(sessionId: string): number {
    return this.listenersBySession.get(sessionId)?.size ?? 0;
  }
}

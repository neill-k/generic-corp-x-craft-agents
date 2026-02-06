type Handler<T> = (payload: T) => void;
type Unsubscribe = () => void;

export class EventBus<EventMap extends { [key: string]: unknown }> {
  private readonly handlers = new Map<keyof EventMap, Set<Handler<unknown>>>();

  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): Unsubscribe {
    const existing = this.handlers.get(event) ?? new Set<Handler<unknown>>();
    existing.add(handler as Handler<unknown>);
    this.handlers.set(event, existing);

    return () => {
      const set = this.handlers.get(event);
      if (!set) return;
      set.delete(handler as Handler<unknown>);
      if (set.size === 0) this.handlers.delete(event);
    };
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      handler(payload);
    }
  }

  removeAllListeners(): void {
    this.handlers.clear();
  }
}

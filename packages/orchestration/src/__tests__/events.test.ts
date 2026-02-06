import { describe, it, expect } from "bun:test"
import { EventBus } from "../events.ts"

type TestEventMap = {
  foo: { value: number }
  bar: { name: string }
}

describe("EventBus", () => {
  it("on/emit delivers payload to handler", () => {
    const bus = new EventBus<TestEventMap>()
    const received: Array<{ value: number }> = []
    bus.on("foo", (payload) => received.push(payload))
    bus.emit("foo", { value: 42 })
    expect(received).toEqual([{ value: 42 }])
  })

  it("unsubscribe stops handler from receiving events", () => {
    const bus = new EventBus<TestEventMap>()
    const received: number[] = []
    const unsub = bus.on("foo", (p) => received.push(p.value))

    bus.emit("foo", { value: 1 })
    unsub()
    bus.emit("foo", { value: 2 })

    expect(received).toEqual([1])
  })

  it("multiple handlers on same event all fire", () => {
    const bus = new EventBus<TestEventMap>()
    const a: number[] = []
    const b: number[] = []
    bus.on("foo", (p) => a.push(p.value))
    bus.on("foo", (p) => b.push(p.value))
    bus.emit("foo", { value: 10 })
    expect(a).toEqual([10])
    expect(b).toEqual([10])
  })

  it("handlers on different events are independent", () => {
    const bus = new EventBus<TestEventMap>()
    const foos: number[] = []
    const bars: string[] = []
    bus.on("foo", (p) => foos.push(p.value))
    bus.on("bar", (p) => bars.push(p.name))

    bus.emit("foo", { value: 1 })
    bus.emit("bar", { name: "hi" })

    expect(foos).toEqual([1])
    expect(bars).toEqual(["hi"])
  })

  it("removeAllListeners clears everything", () => {
    const bus = new EventBus<TestEventMap>()
    const received: number[] = []
    bus.on("foo", (p) => received.push(p.value))
    bus.on("bar", () => {})

    bus.removeAllListeners()
    bus.emit("foo", { value: 99 })

    expect(received).toEqual([])
  })

  it("emit with no listeners is a no-op", () => {
    const bus = new EventBus<TestEventMap>()
    // Should not throw
    bus.emit("foo", { value: 1 })
  })
})

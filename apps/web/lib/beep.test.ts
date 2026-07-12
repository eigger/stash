import { afterEach, describe, expect, it, vi } from "vitest";
import { playBeep, unlockBeepAudio } from "./beep";

class MockOscillator {
  type = "";
  frequency = { value: 0 };
  start = vi.fn();
  stop = vi.fn();
  connect = vi.fn();
}

class MockGain {
  gain = { setValueAtTime: vi.fn() };
  connect = vi.fn();
}

class MockAudioContext {
  state: "suspended" | "running" = "suspended";
  currentTime = 0;
  resume = vi.fn(() => {
    this.state = "running";
    return Promise.resolve();
  });
  createOscillator = vi.fn(() => new MockOscillator());
  createGain = vi.fn(() => new MockGain());
  destination = {};
}

describe("beep", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing when the browser has no AudioContext", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(() => playBeep()).not.toThrow();
    expect(() => unlockBeepAudio()).not.toThrow();
  });

  it("creates an oscillator and plays a short tone when AudioContext is available", () => {
    vi.stubGlobal("AudioContext", MockAudioContext);
    expect(() => playBeep()).not.toThrow();
  });

  it("resumes a suspended context on unlock", () => {
    vi.stubGlobal("AudioContext", MockAudioContext);
    expect(() => unlockBeepAudio()).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { isComputerDevice, isComputerUserAgent } from "@/lib/exam-device";

const windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

describe("exam device rule", () => {
  it("allows Windows and Mac computers with a mouse or touchpad", () => {
    expect(isComputerDevice({ userAgent: windows, maxTouchPoints: 0, finePointer: true })).toBe(true);
    expect(isComputerDevice({ userAgent: mac, maxTouchPoints: 0, finePointer: true })).toBe(true);
    // Touchscreen laptops still have a touchpad.
    expect(isComputerDevice({ userAgent: windows, maxTouchPoints: 10, finePointer: true })).toBe(true);
  });

  it("blocks phones and tablets, including iPads posing as a Mac", () => {
    expect(isComputerDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148" })).toBe(false);
    expect(isComputerDevice({ userAgent: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130.0 Safari/537.36" })).toBe(false);
    expect(isComputerDevice({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)" })).toBe(false);
    expect(isComputerDevice({ userAgent: mac, maxTouchPoints: 5, finePointer: true })).toBe(false);
    expect(isComputerDevice({ userAgent: windows, uaMobile: true })).toBe(false);
    expect(isComputerDevice({ userAgent: windows, maxTouchPoints: 10, finePointer: false })).toBe(false);
  });

  it("checks the server-side user agent", () => {
    expect(isComputerUserAgent(windows)).toBe(true);
    expect(isComputerUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36")).toBe(false);
  });
});

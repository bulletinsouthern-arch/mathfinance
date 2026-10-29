// GED-style device rule: proctored quizzes and exams run only on a desktop
// or laptop computer (Windows, macOS, Linux, ChromeOS), never a phone or tablet.
export const EXAM_DEVICE_MESSAGE =
  "Quizzes and exams can only be taken on a desktop or laptop computer with a webcam. Phones and tablets, including iPads and Android tablets, are not allowed. Open this page on a Windows, Mac or other computer to continue.";

const MOBILE_OR_TABLET = /android|iphone|ipad|ipod|mobile|tablet|silk|kindle|playbook|bb10|blackberry|windows phone|iemobile|opera mini|webos|kfapwi/i;

export type DeviceInfo = {
  userAgent: string;
  /** navigator.userAgentData?.mobile, when the browser exposes it. */
  uaMobile?: boolean | undefined;
  maxTouchPoints?: number | undefined;
  /** matchMedia("(any-pointer: fine)").matches — a mouse or touchpad is present. */
  finePointer?: boolean | undefined;
};

export function isComputerDevice(info: DeviceInfo): boolean {
  if (info.uaMobile) return false;
  if (MOBILE_OR_TABLET.test(info.userAgent)) return false;
  // iPadOS reports a desktop Mac user agent; real Macs have no touch points.
  if (/macintosh/i.test(info.userAgent) && (info.maxTouchPoints ?? 0) > 1) return false;
  // Touch-only devices (tablets, Windows tablets without keyboard/touchpad).
  if (info.finePointer === false) return false;
  return true;
}

// Server-side check uses only the User-Agent header, so it catches phones and
// most tablets; the browser check above also catches iPads in desktop mode.
export function isComputerUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return isComputerDevice({ userAgent });
}

export function currentDeviceInfo(): DeviceInfo {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return {
    userAgent: nav.userAgent,
    uaMobile: nav.userAgentData?.mobile,
    maxTouchPoints: nav.maxTouchPoints,
    finePointer: typeof window.matchMedia === "function" ? window.matchMedia("(any-pointer: fine)").matches : undefined,
  };
}

export type KioskCommand = "PING" | "START" | "STATUS" | "FINISH" | "CANCEL";
export function kioskCommand(type: KioskCommand, detail: {title?:string;answered?:number;total?:number} = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error("Math & Finance Kiosk is not connected. Install our extension, reload this page, and check the connection.")); }, 4000);
    function cleanup() { clearTimeout(timeout); window.removeEventListener("message", receive); }
    function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== location.origin || event.data?.source !== "mfp-kiosk" || event.data.id !== id) return;
      cleanup();
      if (event.data.ok) resolve();
      else reject(new Error(event.data.error || "Kiosk connection failed. Ask your proctor for help."));
    }
    window.addEventListener("message", receive);
    window.postMessage({source:"mfp-website",id,type,...detail}, location.origin);
  });
}

// This bridge sends only kiosk commands and progress, never answers or credentials.
window.addEventListener('message', async event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'mfp-website') return;
  const { id, type, title, answered, total } = event.data;
  if (typeof id !== 'string' || !['PING', 'START', 'STATUS', 'FINISH', 'CANCEL'].includes(type)) return;
  let response;
  try { response = await chrome.runtime.sendMessage({ type, title, answered, total }); }
  catch { response = { ok: false, error: 'Extension disconnected. Reload before starting an assessment.' }; }
  window.postMessage({ source: 'mfp-kiosk', id, ...response }, location.origin);
});

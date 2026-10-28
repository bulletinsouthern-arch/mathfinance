const SITE = 'https://mathfinance.netlify.app';
const ORIGINS = [SITE, 'https://main--mathfinance.netlify.app'];
const dashboardUrl = chrome.runtime.getURL('dashboard.html');
const read = async () => (await chrome.storage.session.get('session')).session;
const write = async session => chrome.storage.session.set({ session });
function website(url) {
  try { return ORIGINS.includes(new URL(url).origin); } catch { return false; }
}
async function focus(session) {
  try {
    await chrome.tabs.update(session.tabId, { active: true });
    await chrome.windows.update(session.windowId, { focused: true, state: 'fullscreen' });
  } catch { await chrome.storage.session.remove('session'); }
}
async function openDashboard() {
  const session = await read();
  if (session?.active) return focus(session);
  const tabs = await chrome.tabs.query({ url: dashboardUrl });
  if (tabs[0]) return focus({ tabId: tabs[0].id, windowId: tabs[0].windowId });
  await chrome.windows.create({ url: dashboardUrl, type: 'popup', state: 'fullscreen' });
}
chrome.action.onClicked.addListener(() => { void openDashboard(); });
let commands = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const task = commands.then(async () => {
    const internal = sender.id === chrome.runtime.id && sender.url === dashboardUrl;
    if (internal) {
      if (message.type === 'DASHBOARD_STATUS') return { ok: true, session: await read() || null };
      if (message.type === 'OPEN_WEBSITE') {
        const session = await read();
        if (session?.active) { await focus(session); return { ok: true }; }
        await chrome.tabs.create({ windowId: sender.tab.windowId, url: SITE + '/courses' });
        return { ok: true };
      }
      if (message.type === 'RESUME') {
        const session = await read();
        if (session) await focus(session);
        return { ok: true };
      }
      if (message.type === 'CLOSE_DASHBOARD') {
        if ((await read())?.active) throw new Error('Finish your assessment first.');
        await chrome.tabs.remove(sender.tab.id);
        return { ok: true };
      }
    }
    if (!sender.tab || sender.frameId !== 0 || !website(sender.url)) throw new Error('Unsupported page.');
    if (message.type === 'PING') return { ok: true, version: chrome.runtime.getManifest().version };
    const session = await read();
    if (message.type === 'START') {
      if (!/^\/exam\/[^/]+\/?$/.test(new URL(sender.url).pathname)) throw new Error('Open an assessment first.');
      if (session?.active && session.tabId !== sender.tab.id) throw new Error('An assessment is already active.');
      const next = { tabId: sender.tab.id, windowId: sender.tab.windowId, url: sender.url, title: String(message.title || 'Assessment').slice(0, 160), active: true, phase: 'Starting', answered: 0, total: 0, updatedAt: Date.now() };
      await write(next);
      await focus(next);
      return { ok: true };
    }
    if (!session || session.tabId !== sender.tab.id || new URL(session.url).pathname !== new URL(sender.url).pathname) throw new Error('No matching kiosk session.');
    if (message.type === 'STATUS' && session.active) {
      await write({ ...session, phase: 'In progress', answered: Math.max(0, Number(message.answered) || 0), total: Math.max(0, Number(message.total) || 0), updatedAt: Date.now() });
      return { ok: true };
    }
    if (message.type === 'FINISH' || (message.type === 'CANCEL' && session.phase === 'Starting')) {
      await write({ ...session, active: false, phase: message.type === 'FINISH' ? 'Result saved' : 'Start cancelled', updatedAt: Date.now() });
      return { ok: true };
    }
    throw new Error('Unsupported kiosk command.');
  });
  commands = task.then(() => {}, () => {});
  task.then(respond, () => respond({ ok: false, error: 'Kiosk command failed. Reopen the extension or ask your proctor.' }));
  return true;
});
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  const session = await read();
  if (session?.active && tabId !== session.tabId && windowId === session.windowId) await focus(session);
});
chrome.windows.onFocusChanged.addListener(async windowId => {
  const session = await read();
  if (session?.active && windowId !== session.windowId && windowId !== chrome.windows.WINDOW_ID_NONE) await focus(session);
});
async function guard(details) {
  if (details.frameId !== 0) return;
  const session = await read();
  if (session?.active && details.tabId === session.tabId && details.url !== session.url) {
    await chrome.tabs.update(session.tabId, { url: session.url });
  }
}
chrome.webNavigation.onCommitted.addListener(guard);
chrome.webNavigation.onHistoryStateUpdated.addListener(guard);
chrome.tabs.onRemoved.addListener(async tabId => {
  if ((await read())?.tabId === tabId) await chrome.storage.session.remove('session');
});

const byId = id => document.getElementById(id);
async function command(type) {
  byId('error').textContent = '';
  try {
    const response = await chrome.runtime.sendMessage({ type });
    if (!response?.ok) throw new Error(response?.error || 'Could not connect. Reopen the extension.');
    return response;
  } catch (error) { byId('error').textContent = error.message; }
}
byId('open').onclick = () => command('OPEN_WEBSITE');
byId('resume').onclick = () => command('RESUME');
byId('close').onclick = () => command('CLOSE_DASHBOARD');
async function refresh() {
  const response = await command('DASHBOARD_STATUS');
  if (!response) return;
  const session = response.session;
  byId('session-title').textContent = session?.title || 'No active assessment';
  byId('phase').textContent = session?.phase || 'Open a course and choose an exam or quiz.';
  byId('progress').textContent = session ? `${session.answered} of ${session.total} questions answered` : 'Progress appears when your assessment starts.';
  byId('bar').style.width = `${session?.total ? Math.min(100, session.answered / session.total * 100) : 0}%`;
  byId('updated').textContent = session ? `Last synced ${new Date(session.updatedAt).toLocaleTimeString()}` : 'Waiting for website connection';
  byId('resume').hidden = !session?.active;
  byId('close').disabled = !!session?.active;
}
chrome.storage.onChanged.addListener(() => { void refresh(); });
void refresh();

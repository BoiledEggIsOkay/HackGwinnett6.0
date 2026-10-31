/* A configured server connects AI automatically. A saved off choice is respected. */
(function (window) {
  'use strict';
  let available = false;
  let consent = true;
  let consentVersion = 0;
  let checking = false;
  let connection = 'checking';
  let checkPromise;
  const activeRequests = new Set();
  try { consent = window.localStorage.getItem('care-ai-enabled') !== 'false'; } catch { /* This visit still works. */ }

  function statusText() {
    if (checking) return 'Checking the AI connection…';
    if (available) return consent ?
      'AI enabled automatically. Text you submit is sent to OpenAI.' :
      'AI is off by your choice. The local tools are available.';
    if (connection === 'file') return 'AI needs the Care Compass server. Open the localhost site instead of this file. Local tools are available.';
    if (connection === 'missing-key') return 'AI needs a server API key. Local tools are available; see AI connection help.';
    if (connection === 'server') return 'This preview does not provide the AI connection. Run the Care Compass server. Local tools are available.';
    return 'The AI connection could not be reached. Check the server and retry. Local tools are available.';
  }

  function helpText() {
    if (connection === 'file') return 'Opening index.html directly cannot connect to AI. Start the project server and use its localhost address.';
    if (connection === 'missing-key') return 'The Care Compass server is running, but it has no API key configured. The site owner needs to add one before AI can be enabled.';
    if (connection === 'server') return 'A static preview such as Live Server serves the pages but cannot run the AI service. Start this project with npm start.';
    return 'The connection check failed or timed out. Make sure the project server is running, then choose Check connection to try again.';
  }

  function notify() {
    window.dispatchEvent?.(new window.CustomEvent('care-ai-change', {
      detail: { enabled: consent && available, available, checking }
    }));
  }

  function render(detail) {
    const checkbox = window.document.querySelector('#ai-enabled');
    if (checkbox) {
      checkbox.checked = consent && available;
      checkbox.disabled = checking;
      checkbox.onchange = () => {
        if (checkbox.checked && !available) {
          checkbox.checked = false;
          void connect();
        } else setEnabled(checkbox.checked);
      };
    }
    const settings = window.document.querySelector('#settings-ai');
    if (settings) {
      if (settings.dataset.aiEdited !== 'true' || !available) settings.checked = consent && available;
      settings.disabled = checking;
    }
    for (const prefix of ['ai', 'settings-ai']) {
      const status = window.document.querySelector(`#${prefix}-status`);
      if (status) status.textContent = detail || statusText();
      const retry = window.document.querySelector(`#${prefix}-retry`);
      if (retry) {
        retry.hidden = available;
        retry.disabled = checking;
        retry.textContent = checking ? 'Checking connection…' : 'Check connection';
        retry.onclick = () => { void refresh(); };
      }
      const help = window.document.querySelector(`#${prefix}-connection-help`);
      if (help) help.hidden = available || checking;
      const guidance = window.document.querySelector(`#${prefix}-connection-guidance`);
      if (guidance) guidance.textContent = helpText();
    }
  }

  function setEnabled(value) {
    // A missing connection is not a choice to opt out.
    if (value && !available) { render(); return false; }
    const next = Boolean(value) && available;
    if (consent !== next || !next) consentVersion++;
    consent = next;
    if (!consent) activeRequests.forEach(controller => controller.abort());
    try { window.localStorage.setItem('care-ai-enabled', String(consent)); } catch { /* Keep this choice for this visit. */ }
    render();
    notify();
    return consent && available;
  }

  function refresh() {
    if (checkPromise) return checkPromise;
    checking = true;
    render();
    notify();
    checkPromise = (async () => {
      // Defer even the file:// branch so concurrent checks share one promise.
      await Promise.resolve();
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 4000);
      try {
        if (window.location?.protocol === 'file:') {
          available = false;
          connection = 'file';
          return false;
        }
        const response = await window.fetch('/api/ai/status', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) {
          available = false;
          connection = response.status === 404 || response.status === 405 ? 'server' : 'offline';
          return false;
        }
        let result;
        try { result = await response.json(); }
        catch { available = false; connection = 'server'; return false; }
        available = result?.available === true;
        connection = typeof result?.available !== 'boolean' ? 'server' : available ? 'connected' : 'missing-key';
        return available;
      } catch {
        available = false;
        connection = 'offline';
        return false;
      } finally {
        window.clearTimeout(timeout);
        checking = false;
        checkPromise = null;
        render();
        notify();
      }
    })();
    return checkPromise;
  }

  async function connect() {
    const version = consentVersion;
    if (!await refresh()) {
      for (const selector of ['#ai-connection-help', '#settings-ai-connection-help']) {
        const help = window.document.querySelector(selector);
        if (help) { help.hidden = false; help.open = true; }
      }
      return false;
    }
    // A later off choice takes precedence over a pending connection attempt.
    return version === consentVersion ? setEnabled(true) : consent && available;
  }

  async function request(tool, { text = '', context = {} } = {}) {
    await ready;
    if (!available || !consent) throw new Error('AI is off. The local tools are available.');
    const version = consentVersion;
    const controller = new AbortController();
    activeRequests.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await window.fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, text, context }),
        signal: controller.signal
      });
      const result = await response.json();
      if (!consent || version !== consentVersion) throw new Error('AI was turned off. The local tools are available.');
      if (!response.ok) throw new Error(result.error || 'AI could not respond. Please try again.');
      if (tool === 'voice') {
        if (typeof result.command !== 'string' || typeof result.confidence !== 'number' ||
            typeof result.relevant !== 'boolean') throw new Error('AI could not understand that command.');
      } else if (typeof result.text !== 'string') throw new Error('AI returned an incomplete answer.');
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(!consent || version !== consentVersion ?
        'AI was turned off. The local tools are available.' : 'AI took too long. The local tools are still available.');
      throw error;
    } finally { window.clearTimeout(timeout); activeRequests.delete(controller); }
  }

  const ready = refresh();

  window.CareAI = {
    ready, request, setEnabled, render, refresh, connect,
    get available() { return available; },
    get enabled() { return available && consent; },
    get checking() { return checking; }
  };
})(window);

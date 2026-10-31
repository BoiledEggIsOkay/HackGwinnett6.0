/* A configured server connects AI automatically. A saved off choice is respected. */
(function (window) {
  'use strict';
  let available = false;
  let consent = true;
  let consentVersion = 0;
  const activeRequests = new Set();
  try { consent = window.localStorage.getItem('care-ai-enabled') !== 'false'; } catch { /* This visit still works. */ }

  function render(detail) {
    const checkbox = window.document.querySelector('#ai-enabled');
    const status = window.document.querySelector('#ai-status');
    if (checkbox) {
      checkbox.checked = consent && available;
      checkbox.disabled = !available;
      checkbox.onchange = () => setEnabled(checkbox.checked);
    }
    if (status) {
      status.textContent = detail || (available ?
        (consent ? 'AI enabled automatically. Text you submit is sent to OpenAI.' : 'AI is off by your choice. The local tools are available.') :
        'Using local tools. AI will connect automatically when the server is configured.');
    }
  }

  function setEnabled(value) {
    const next = Boolean(value) && available;
    if (consent !== next) consentVersion++;
    consent = next;
    if (!consent) activeRequests.forEach(controller => controller.abort());
    try { window.localStorage.setItem('care-ai-enabled', String(consent)); } catch { /* Keep this choice for this visit. */ }
    render();
    window.dispatchEvent?.(new window.CustomEvent('care-ai-change', { detail: { enabled: consent && available } }));
    return consent && available;
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

  const ready = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    try {
      const response = await window.fetch('/api/ai/status', { signal: controller.signal });
      const result = await response.json();
      available = response.ok && result.available === true;
    } catch { available = false; }
    finally { window.clearTimeout(timeout); render(); }
    return available;
  })();

  window.CareAI = {
    ready, request, setEnabled, render,
    get available() { return available; },
    get enabled() { return available && consent; }
  };
  render('Checking the automatic AI connection…');
})(window);

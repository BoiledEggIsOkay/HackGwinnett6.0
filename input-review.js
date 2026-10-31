(function (window) {
  'use strict';
  let callbacks = {};
  let current = null;
  const $ = selector => window.document.querySelector(selector);

  function finish(confirmed, editing = false) {
    if (!current) return;
    const previous = current;
    current = null;
    if ($('#review-dialog').open) $('#review-dialog').close();
    callbacks.onFinish?.();
    previous.resolve(confirmed);
    if (editing) {
      previous.config.field?.focus();
      callbacks.onEdit?.(previous.config);
    }
  }
  function repeat() {
    if (current) callbacks.onPrompt?.(current.prompt);
  }
  function request(config) {
    if (!config.always && !callbacks.isEnabled?.()) return Promise.resolve(true);
    finish(false);
    const prompt = `Please check your input. ${String(config.summary).slice(0, 900)}${String(config.summary).length > 900 ? '… The full input is displayed for review.' : ''} Say confirm to ${config.actionLabel || 'continue'}, change to edit, or cancel.`;
    $('#review-title').textContent = config.title || 'Check your input';
    $('#review-summary').textContent = config.summary;
    $('#review-confirm').textContent = config.actionLabel || 'Confirm';
    return new Promise(resolve => {
      current = { config, resolve, prompt };
      $('#review-dialog').showModal();
      callbacks.onPrompt?.(prompt);
    });
  }
  function init(options) {
    callbacks = options;
    $('#review-confirm').onclick = () => finish(true);
    $('#review-edit').onclick = () => finish(false, true);
    $('#review-cancel').onclick = () => finish(false);
    $('#review-dialog').addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    $('#review-dialog').addEventListener('close', () => {
      if (!$('#review-dialog').open && current) finish(false);
    });
  }
  window.CareReview = {
    init, request, repeat,
    confirm: () => finish(true),
    edit: () => finish(false, true),
    cancel: () => finish(false),
    get active() { return Boolean(current); }
  };
})(window);

'use strict';

const icons = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  heart: '<path d="M20.8 4.7a5.4 5.4 0 0 0-7.6 0L12 6l-1.2-1.3a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.7a5.4 5.4 0 0 0 0-7.6Z"/>',
  chat: '<path d="M21 11.5a9 9 0 0 1-9 9H4l-3 2 2-6a9 9 0 1 1 18-5Z"/><path d="M7 11h.01M12 11h.01M17 11h.01"/>',
  sprout: '<path d="M12 21V11M12 15C3 15 3 8 3 8s9-1 9 7ZM12 11c0-8 9-8 9-8s1 8-9 8Z"/>',
  access: '<circle cx="12" cy="4" r="2"/><path d="m4 8 8 2 8-2M12 10v5m0 0-5 6m5-6 5 6"/>',
  audio: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2"/>',
  arrow: '<path d="M4 12h16m-5-5 5 5-5 5"/>',
  scan: '<path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m13-5v4a1 1 0 0 0-1 1h-4M8 8h8M8 12h8M8 16h5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11h6M9 15h6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>'
};
const $ = selector => document.querySelector(selector);
document.querySelectorAll('[data-icon]').forEach(element => {
  element.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[element.dataset.icon] || ''}</svg>`);
});

// Private browsing, local files, or invalid saved data must not break startup.
function load(key, fallback, valid = () => true) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value !== null && valid(value) ? value : fallback;
  } catch { return fallback; }
}
let storageWarningShown = false;
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch {
    if (!storageWarningShown) {
      toast('Changes work for this visit, but this browser could not save them.');
      storageWarningShown = true;
    }
  }
}
const names = {
  dashboard: 'Overview', decoder: 'Medical decoder', specialists: 'Find a specialist',
  plan: 'My care plan', assistant: 'Care assistant'
};
let currentPage = 'dashboard';
let pendingInput = null;
let voice;
let toastTimer;
const dialog = $('#settings-dialog');
let careToolsReady = false;
let voiceEpoch = 0;
let transcriptTimer;
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').style.display = 'none'; }, 5000);
}
function speak(text) { voice?.speak(text); }
function respond(text, spokenText = text) {
  speak(spokenText);
  $('#voice-hint').textContent = text;
}
function ask(kind, prompt, extra = {}) {
  pendingInput = { kind, ...extra };
  respond(prompt);
}
function cancelInput() { pendingInput = null; }
function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
function navigate(page, { announce = true } = {}) {
  if (!names[page]) return;
  voiceEpoch++;
  cancelInput();
  if (dialog.open) dialog.close();
  currentPage = page;
  document.querySelectorAll('.page').forEach(element => element.classList.toggle('active', element.id === page));
  document.querySelectorAll('[data-page]').forEach(element => {
    const active = element.dataset.page === page;
    element.classList.toggle('active', active);
    if (active) element.setAttribute('aria-current', 'page');
    else element.removeAttribute('aria-current');
  });
  $('#breadcrumb').textContent = names[page];
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  const heading = $(`#${page} h1`);
  heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
  if (announce) speak(names[page]);
}
document.querySelectorAll('[data-page],[data-go]').forEach(element => {
  element.onclick = () => navigate(element.dataset.page || element.dataset.go);
});
$('.brand').onclick = event => { event.preventDefault(); navigate('dashboard'); };
$('.dialog-close').onclick = () => dialog.close();
dialog.onclick = event => { if (event.target === dialog) dialog.close(); };
dialog.addEventListener('close', () => {
  // close fires asynchronously; do not cancel a new prompt opened after
  // navigating away from the dialog.
  if (!dialog.open && pendingInput?.inDialog) cancelInput();
});
function modal(title, html) {
  voiceEpoch++;
  cancelInput();
  $('#dialog-title').textContent = title;
  $('#dialog-content').innerHTML = html;
  if (!dialog.open) dialog.showModal();
}

const preferences = load('care-preferences', { large: false, contrast: false }, value =>
  typeof value === 'object' && typeof value.large === 'boolean' && typeof value.contrast === 'boolean');
function applyPreferences() {
  document.body.classList.toggle('large-text', preferences.large);
  document.body.classList.toggle('high-contrast', preferences.contrast);
  save('care-preferences', preferences);
}
applyPreferences();
function accessibility() {
  modal('Care that works for you.', `
    <label class="setting-row">Voice control and read-aloud<input type="checkbox" id="tts" ${voice?.enabled ? 'checked' : ''}></label>
    <label class="setting-row">Wake phrase while voice is off<input type="checkbox" id="wake-setting" ${voice?.wakeListening ? 'checked' : ''}></label>
    <label class="setting-row">Larger text<input type="checkbox" id="large" ${preferences.large ? 'checked' : ''}></label>
    <label class="setting-row">Higher contrast<input type="checkbox" id="contrast" ${preferences.contrast ? 'checked' : ''}></label>
    <p class="fine-print">Use Tab to navigate and Enter to select. You can also say “larger text on,” “higher contrast on,” or “save preferences.”</p>
    <button class="primary" id="save-access">Save preferences</button>`);
  $('#save-access').onclick = () => {
    const wantsVoice = $('#tts').checked;
    const wantsWake = $('#wake-setting').checked;
    preferences.large = $('#large').checked;
    preferences.contrast = $('#contrast').checked;
    applyPreferences();
    setWakeListening(wantsWake);
    setVoiceEnabled(wantsVoice);
    dialog.close();
    toast('Accessibility preferences updated');
  };
}
$('#accessibility').onclick = accessibility;
const conditionOptions = window.CareMedical.conditionNames();
const savedConditions = load('conditions', conditionOptions.slice(0, 2), value =>
  Array.isArray(value) && value.every(condition => typeof condition === 'string'));
let conditions = [...new Set(savedConditions.flatMap(name => conditionOptions.includes(name) ?
  [name] : window.CareMedical.matchConditions(name).slice(0, 1).map(condition => condition.name)))];
function renderConditions() {
  const holder = $('#condition-chips');
  holder.querySelectorAll('span').forEach(element => element.remove());
  conditions.forEach(condition => {
    const element = document.createElement('span');
    element.textContent = `♧  ${condition}`;
    holder.insertBefore(element, $('#add-condition'));
  });
}
function profile() {
  modal('What are you navigating?', `
    <p class="fine-print">Choose the conditions you’d like reflected in your care space. You can update this any time.</p>
    <label for="profile-search">Search conditions</label><input id="profile-search" type="search" placeholder="Search your condition">
    ${conditionOptions.map((condition, index) => `<label class="condition-option"><input type="checkbox" value="${index}" ${conditions.includes(condition) ? 'checked' : ''}>${condition}</label>`).join('')}
    <button class="primary" id="save-profile">Save my profile</button>`);
  $('#profile-search').oninput = event => {
    const query = event.target.value.toLowerCase().trim();
    dialog.querySelectorAll('.condition-option').forEach(label => { label.hidden = !label.textContent.toLowerCase().includes(query); });
  };
  $('#save-profile').onclick = () => {
    conditions = [...dialog.querySelectorAll('.condition-option input:checked')].map(input => conditionOptions[input.value]);
    save('conditions', conditions);
    renderConditions();
    dialog.close();
    toast('Your care profile has been updated');
    respond('Your care profile has been updated.');
  };
}
renderConditions();
['#profile', '#edit-profile', '#add-condition'].forEach(selector => { $(selector).onclick = profile; });
function about() {
  modal('Every condition. Every person.', '<p class="promise-copy">Care Compass helps people with under-recognized conditions find clarity and prepare for care. We believe your experiences deserve to be heard.</p><p class="fine-print">Your profile and checklist stay in your browser on this device. AI tools are optional. Enabling them sends submitted text and relevant profile details to the AI service. Medical notes and conversations are not saved by this app.</p>');
}
$('#about').onclick = about;
$('#notifications').onclick = () => toast('You’re all caught up. Take your next step at your own pace.');
const dateLabel = $('.date');
if (dateLabel) {
  const dateText = document.createElement('span');
  dateText.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  [...dateLabel.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).forEach(node => node.remove());
  dateLabel.append(dateText);
}

function glossaryMatches(text) { return window.CareMedical.glossaryMatches(text); }
function decode() { return window.CareMedical.decode(); }
function renderDirectory() { return window.CareMedical.renderDirectory(); }
const defaultTasks = [
  { text: 'Write down my symptoms and when they happen', done: false },
  { text: 'Bring my current medications and supplements', done: false },
  { text: 'Ask what could be causing my symptoms', done: false },
  { text: 'Discuss my options and next steps', done: false },
  { text: 'Share my accessibility needs', done: false }
];
let tasks = load('tasks', defaultTasks, value => Array.isArray(value) &&
  value.every(task => task && typeof task.text === 'string' && typeof task.done === 'boolean'));
function renderTasks() {
  $('#checklist').replaceChildren();
  if (!tasks.length) {
    const empty = document.createElement('p');
    empty.textContent = 'Your checklist is empty. Add your first question or reminder below.';
    $('#checklist').append(empty);
  }
  tasks.forEach((task, index) => {
    const row = document.createElement('div');
    row.className = 'task';
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = task.done;
    input.onchange = () => { task.done = input.checked; save('tasks', tasks); if (careToolsReady) window.CareTools.renderProgress(); };
    const text = document.createElement('span');
    text.textContent = `${index + 1}. ${task.text}`;
    label.append(input, text);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${task.text}`);
    remove.onclick = () => { tasks.splice(index, 1); save('tasks', tasks); renderTasks(); };
    row.append(label, remove);
    $('#checklist').append(row);
  });
  if (careToolsReady) window.CareTools.renderProgress();
}
function addTask(text) {
  text = String(text).trim().slice(0, 500);
  if (!text) return;
  tasks.push({ text, done: false });
  save('tasks', tasks);
  renderTasks();
}
renderTasks();
$('#add-task').onsubmit = event => {
  event.preventDefault();
  const text = $('#task-text').value.trim();
  if (!text) return;
  addTask(text);
  $('#task-text').value = '';
  speak(`Added to your checklist: ${text}`);
};
function readChecklist() {
  if (!tasks.length) {
    respond('Your checklist is empty. Say add a task to create a reminder.', 'Your checklist is empty. You can add a reminder.');
    return;
  }
  respond(tasks.map((task, index) => `Item ${index + 1}. ${task.text}. ${task.done ? 'Completed' : 'Still to do'}.`).join(' '));
}
window.CareMedical.init({
  toast, speak: text => { if (['decoder', 'specialists'].includes(currentPage)) speak(text); }, addTask,
  ai: (tool, payload) => window.CareAI?.enabled && window.CareAI?.available ? window.CareAI.request(tool, payload) : Promise.resolve(null)
});
window.CareTools.init({ load, save, toast, speak: text => { if (currentPage === 'assistant') speak(text); }, addTask, getTasks: () => tasks, getConditions: () => conditions });
careToolsReady = true;
function chat(text) { return window.CareTools.chat(text); }
$('#chat-form').onsubmit = event => {
  event.preventDefault();
  const text = $('#chat-input').value.trim();
  if (text) { chat(text); $('#chat-input').value = ''; }
};
document.querySelectorAll('.suggestions button').forEach(button => { button.onclick = () => chat(button.textContent); });

const voiceHelpText = 'Voice assistance understands several ways to ask for a section, explain notes, find specialist resources, or manage your checklist. Listening pauses during spoken replies. Use the Interrupt button to stop a reply. With wake listening enabled, say voice assistant on to enable assistance. While off, all other commands are ignored.';
function voiceHelp() {
  modal('What would you like to do?', `
    <p>Start voice assistance when you want help, then speak while it is listening. Use the Interrupt button to stop a spoken reply and resume listening.</p>
    <ul class="voice-command-list">
      <li>“Take me home,” “help me understand my lab results,” or “I need a doctor for diabetes”</li><li>“Go to overview / medical decoder / find a specialist / my care plan / care assistant”</li>
      <li>“Decode my notes” → dictate the notes when asked</li>
      <li>“Find a specialist for POTS” or choose a condition when asked</li>
      <li>“Add a task” → say your question or reminder</li>
      <li>“Read my checklist,” “complete item two,” “remove item three”</li>
      <li>“Ask a question” → say your question</li>
      <li>“Edit profile” → choose conditions, then “save profile”</li>
      <li>“Accessibility settings,” “larger text on,” “higher contrast off”</li>
      <li>“Read this page,” “notifications,” “our promise,” “close dialog”</li>
      <li>“Prepare my checklist,” “download my care plan,” or “track my symptoms”</li><li>“Cancel,” “turn off voice assistant,” or “voice assistant on” (with wake listening enabled)</li>
    </ul>
    <p class="fine-print">Allow microphone access when your browser asks. Your browser’s speech service may process audio. The microphone pauses during spoken replies to avoid hearing its own voice. Quiet surroundings and headphones can improve recognition. Unrelated speech and low-confidence recognition are ignored. Uploading a file uses the file chooser; you can dictate notes instead.</p>`);
  speak(voiceHelpText);
}
$('#voice-help').onclick = voiceHelp;
function normalized(text) {
  return text.toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim();
}
function matchedConditions(text) {
  return window.CareMedical.matchConditions(text).map(condition => conditionOptions.indexOf(condition.name)).filter(index => index >= 0);
}
function isExpectedVoiceInput(text) {
  // A spoken choice can also appear in the assistant's prompt. Allow exact
  // short answers through the engine's echo filter, while still excluding
  // the full prompt or arbitrary text containing a condition name.
  if (['specialty', 'profile'].includes(pendingInput?.kind)) {
    const answer = normalized(text).replace(/^(?:select|add|remove|deselect|uncheck|no)\s+/, '');
    const choices = window.CareMedical.conditions.flatMap(condition => [condition.name, ...condition.aliases]).map(normalized);
    return answer.split(/\s+and\s+/).every(choice => choices.includes(choice));
  }
  if (pendingInput?.kind === 'task-choice') {
    const answer = normalized(text).replace(/^(?:item|task|number)\s+/, '');
    return answer.split(' ').length === 1 && taskIndex(text) >= 0;
  }
  return false;
}
function chooseSpecialty(text) {
  if (!window.CareMedical.chooseSpecialty(text)) return false;
  cancelInput();
  const entry = window.CareMedical.currentDirectory();
  respond(`For ${$('#specialty').selectedOptions[0].textContent}, try ${entry.name}. ${entry.description} Say open directory to visit it.`);
  return true;
}
function guidedPage(page) {
  navigate(page, { announce: false });
  if (page === 'decoder') ask('notes', 'Medical decoder. What medical notes would you like explained? Say the notes, and I will explain the terms I recognize.');
  else if (page === 'specialists') ask('specialty', 'Find a specialist. What condition are you navigating? Say the name of your condition, such as POTS, migraine, diabetes, or asthma.');
  else if (page === 'assistant') ask('chat', 'Care assistant. What question would you like to ask?');
  else if (page === 'plan') respond('My care plan. Say add a task to dictate a reminder, read my checklist, or complete an item by number.',
    'My care plan. You can add a reminder, hear your checklist, or mark items complete by number.');
  else respond('Overview. Say medical decoder, find a specialist, my care plan, care assistant, or edit profile.',
    'Overview. You can understand medical words, explore clinician resources, prepare for appointments, or ask for care guidance. Which part would you like to open?');
}
function taskIndex(text) {
  const value = normalized(text).replace(/^(?:item|task|number|the)\s+/, '');
  const numbers = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const spokenIndex = numbers.indexOf(value);
  if (spokenIndex >= 0) return spokenIndex < tasks.length ? spokenIndex : -1;
  if (/^\d+$/.test(value)) return Number(value) > 0 && Number(value) <= tasks.length ? Number(value) - 1 : -1;
  const matches = tasks.flatMap((task, index) => normalized(task.text).includes(value) ? [index] : []);
  return value && matches.length === 1 ? matches[0] : -1;
}
function updateTask(text, action) {
  const index = taskIndex(text);
  if (index < 0) {
    ask('task-choice', `Which checklist item should I ${action === 'remove' ? 'remove' : action === 'undo' ? 'mark incomplete' : 'mark complete'}? Tell me its number. You can also ask to hear the checklist.`, { action });
    return;
  }
  const name = tasks[index].text;
  if (action === 'remove') tasks.splice(index, 1);
  else tasks[index].done = action !== 'undo';
  save('tasks', tasks);
  renderTasks();
  cancelInput();
  respond(`${action === 'remove' ? 'Removed' : action === 'undo' ? 'Marked incomplete' : 'Completed'}: ${name}`);
}

// Global commands take priority over pending dictation, so "turn off voice
// assistant" can never accidentally become a new checklist item.
function handleVoiceCommand(transcript) {
  const text = transcript.trim();
  const command = normalized(text).replace(/^(?:(?:please|can you|could you)\s+)+/, '').replace(/\s+please$/, '');
  if (!command) return;
  $('#voice-transcript').textContent = `You said: ${text}`;
  if (window.CareIntents.isWake(command)) { setVoiceEnabled(true); return; }
  if (/^(?:(?:please|can you|could you)\s+)*(?:turn|switch)\s+(?:off\s+(?:the\s+)?(?:voice\s+)?(?:assistant|assistance|control)|(?:the\s+)?(?:voice\s+)?(?:assistant|assistance|control)\s+off)$/.test(command) ||
      /^(?:(?:please|can you|could you)\s+)*(?:disable|stop|pause)\s+(?:(?:the|my)\s+)?(?:voice(?:\s+(?:assistant|assistance|control))?|listening|microphone)$/.test(command)) {
    cancelInput();
    setVoiceEnabled(false);
    toast('Voice assistance turned off');
    return;
  }
  if (/^(?:please\s+)?(?:stop(?: speaking| talking| reading)?|be quiet|silence|interrupt)$/.test(command)) {
    voice?.interrupt();
    $('#voice-hint').textContent = 'Speech stopped. Listening for your next command.';
    return;
  }
  if (/^(?:cancel|cancel input|never mind|nevermind)$/.test(command)) {
    cancelInput();
    respond('Cancelled. What would you like to do next?');
    return;
  }
  if (/^(?:close(?: the)?(?: dialog| window| settings)?|dismiss|go back)$/.test(command)) {
    if (dialog.open) dialog.close();
    cancelInput();
    respond('Ready for your next command.');
    return;
  }
  if (/^(?:help(?: me)?(?: with)?(?: voice commands)?|what can (?:i|you) (?:say|do)|voice commands)$/.test(command)) {
    voiceHelp();
    return;
  }
  if (/^(?:read(?: aloud)?(?: this| the)? page|read this section)$/.test(command)) {
    speak((dialog.open ? $('#dialog-content') : $(`#${currentPage}`)).innerText);
    return;
  }
  if (/^(?:read|show|open|go to)(?: my| the)? (?:checklist|visit checklist)$/.test(command)) {
    if (currentPage !== 'plan') navigate('plan', { announce: false });
    readChecklist();
    return;
  }
  if (/^(?:read|show)(?: my| the)? (?:results|explanation)$/.test(command)) {
    if (currentPage !== 'decoder') navigate('decoder', { announce: false });
    if ($('#decode-result').innerText) respond($('#decode-result').innerText);
    else respond('There are no results yet. Say decode my notes to get started.',
      'There are no results yet. You can dictate medical notes to get started.');
    return;
  }
  if (/^(?:open|go to|edit|show|update|add)(?: my| a| the)? (?:health profile|profile|condition|conditions)$/.test(command) ||
      /^(?:my |health )?profile$/.test(command)) {
    profile();
    ask('profile', 'Which conditions would you like selected? Say their names, or say remove followed by a condition to deselect it. Say save profile when ready.', { inDialog: true });
    return;
  }
  if (/^(?:save(?: my| the)? profile|save conditions)$/.test(command)) {
    if ($('#save-profile') && dialog.open) $('#save-profile').click();
    else respond('Say edit profile to choose your conditions first.');
    return;
  }
  if (/^(?:(?:open|show|go to) )?(?:accessibility(?: settings)?|preferences|settings)$/.test(command)) {
    accessibility();
    respond('Accessibility settings. Say larger text on or off, higher contrast on or off, or save preferences.',
      'Accessibility settings. You can change text size and contrast, then save your preferences. Which preference would you like to change?');
    return;
  }
  const preferenceMatch = command.match(/^(?:(?:turn|switch|enable|disable) )?(larger text|large text|higher contrast|high contrast)(?: (on|off))?$/);
  if (preferenceMatch) {
    const key = /text/.test(preferenceMatch[1]) ? 'large' : 'contrast';
    const enabled = preferenceMatch[2] ? preferenceMatch[2] === 'on' : !command.startsWith('disable');
    preferences[key] = enabled;
    applyPreferences();
    if (dialog.open && $(`#${key}`)) $(`#${key}`).checked = enabled;
    respond(`${preferenceMatch[1]} ${enabled ? 'on' : 'off'}.`);
    return;
  }
  if (/^save(?: accessibility)? preferences$/.test(command)) {
    if (dialog.open && $('#save-access')) $('#save-access').click();
    else respond('Your accessibility preferences are already saved.');
    return;
  }
  if (/^(?:(?:open|read|show) )?(?:our promise|about|about care compass)$/.test(command)) {
    about();
    speak($('#dialog-content').innerText);
    return;
  }
  if (/^(?:(?:open|read|show|check) )?(?:my )?notifications$/.test(command)) {
    respond('You’re all caught up. Take your next step at your own pace.');
    return;
  }
  if (/^(?:open|visit)(?: the)? (?:directory|specialist directory|website)$/.test(command)) {
    if (currentPage === 'specialists') window.location.assign(window.CareMedical.currentDirectory().url);
    else guidedPage('specialists');
    return;
  }
  const specialistMatch = command.match(/^(?:find|search for|look for)(?: me| a)? (?:specialist|specialists|doctor)(?: for| with)?(?: (.+))?$/);
  if (specialistMatch) {
    navigate('specialists', { announce: false });
    if (!specialistMatch[1] || !chooseSpecialty(specialistMatch[1])) {
      ask('specialty', 'What condition are you navigating? Say the name of your condition, such as POTS, migraine, diabetes, or asthma.');
    }
    return;
  }
  const destinations = {
    overview: 'dashboard', home: 'dashboard', dashboard: 'dashboard',
    'medical decoder': 'decoder', decoder: 'decoder', 'medical words': 'decoder',
    'find a specialist': 'specialists', specialists: 'specialists',
    'my care plan': 'plan', 'care plan': 'plan', plan: 'plan',
    'care assistant': 'assistant', assistant: 'assistant'
  };
  const destination = command.replace(/^(?:please )?(?:go to|take me to|navigate to|open|show)(?: the)? /, '');
  if (destinations[destination]) { guidedPage(destinations[destination]); return; }
  const addMatch = text.match(/^(?:please\s+)?add(?:\s+(?:a|new))?\s+(?:task|question|reminder|checklist item)(?:\s+(?:to (?:my|the) (?:care plan|checklist)|that says))?(?:\s*[:,-]?\s+(.+))?$/i);
  const addToListMatch = text.match(/^add\s+(.+?)\s+to\s+(?:my|the)\s+(?:checklist|care plan)$/i);
  if (addMatch || addToListMatch) {
    navigate('plan', { announce: false });
    const item = (addMatch?.[1] || addToListMatch?.[1] || '').trim();
    if (item) { addTask(item); respond(`Added to your checklist: ${item}`); }
    else ask('task', 'What question or reminder would you like to add to your checklist?');
    return;
  }
  // Removing a condition while editing a profile is different from removing
  // a numbered checklist item.
  if (pendingInput?.kind === 'profile' && /^(?:remove|deselect|uncheck|no)\b/.test(command) &&
      matchedConditions(text).length) {
    const matches = matchedConditions(text);
    matches.forEach(index => { $(`.condition-option input[value="${index}"]`).checked = false; });
    respond(`Deselected ${matches.map(index => conditionOptions[index]).join(' and ')}. Say another condition, or save profile.`);
    return;
  }
  const taskMatch = command.match(/^(complete|check off|mark complete|mark incomplete|uncheck|remove|delete)(?: (?:item|task|number))?(?: (.+))?$/);
  if (taskMatch) {
    navigate('plan', { announce: false });
    const action = /remove|delete/.test(taskMatch[1]) ? 'remove' : /incomplete|uncheck/.test(taskMatch[1]) ? 'undo' : 'complete';
    updateTask(taskMatch[2] || '', action);
    return;
  }
  if (/^(?:decode(?: my| the)?(?: medical)? notes|dictate(?: my| the)?(?: medical)? notes|explain(?: my| the)? notes|decode a document|upload(?: a| my)? document)$/.test(command)) {
    navigate('decoder', { announce: false });
    if (/^explain/.test(command) && $('#medical-text').value.trim()) decode();
    else ask('notes', 'What medical notes would you like explained? Dictate your notes now. You can also choose a text file using Add your clinical notes.');
    return;
  }
  if (/^(?:add|dictate)(?: some)? more notes$/.test(command)) {
    navigate('decoder', { announce: false });
    ask('notes', 'What would you like to add to your medical notes?', { append: true });
    return;
  }
  if (/^(?:ask(?: a)? question|i have a question|talk to(?: the)?(?: care)? assistant)$/.test(command)) {
    guidedPage('assistant');
    return;
  }
  if (/^(?:prepare|build|generate)(?: my| a)? (?:checklist|care plan)$/.test(command)) {
    navigate('plan', { announce: false });
    window.CareTools.buildPlan();
    return;
  }
  if (/^(?:download|export)(?: my| the)? care plan$/.test(command)) {
    window.CareTools.exportPlan();
    return;
  }
  if (/^(?:track|record|log)(?: my| a)? symptoms?$/.test(command)) {
    navigate('plan', { announce: false });
    $('#symptom-name').focus();
    respond('Use the symptom record to add a symptom, date, severity, and any triggers.');
    return;
  }
  if (pendingInput) {
    const pending = pendingInput;
    if (pending.kind === 'notes') {
      $('#medical-text').value = pending.append ? `${$('#medical-text').value}\n${text}`.trim() : text;
      cancelInput();
      decode();
    } else if (pending.kind === 'specialty') {
      if (!chooseSpecialty(text)) respond('Try another condition name or use the condition search. Say cancel to leave this input.');
    } else if (pending.kind === 'task') {
      addTask(text);
      cancelInput();
      respond(`Added to your checklist: ${text}`);
    } else if (pending.kind === 'task-choice') {
      updateTask(text, pending.action);
    } else if (pending.kind === 'profile') {
      const matches = matchedConditions(text);
      if (!matches.length) {
        respond('Say a condition from the condition library, or use the profile search. Say save profile when ready.');
      } else {
        const selected = !/^(?:remove|deselect|uncheck|no)\b/.test(command);
        matches.forEach(index => { $(`.condition-option input[value="${index}"]`).checked = selected; });
        respond(`${selected ? 'Selected' : 'Deselected'} ${matches.map(index => conditionOptions[index]).join(' and ')}. Say another condition, or save profile.`);
      }
    } else if (pending.kind === 'chat') { cancelInput(); chat(text); }
    return;
  }
  if (window.CareIntents.isRelevant(text, { page: currentPage })) {
    if (currentPage !== 'assistant') navigate('assistant', { announce: false });
    cancelInput();
    chat(text);
    return;
  }
  respond('I did not recognize that command. Say help with voice commands, or say the section you want to open.',
    'I did not recognize that command. You can request a list of voice controls or ask to navigate to a section.');
}

function clearTranscript() {
  clearTimeout(transcriptTimer);
  $('#voice-transcript').textContent = '';
}
async function receiveVoiceTranscript(text, metadata = {}) {
  if (!voice?.enabled) return;
  const context = { page: currentPage, pending: pendingInput };
  if (!window.CareIntents.isRelevant(text, context)) { clearTranscript(); return; }
  if (metadata.confidence > 0 && metadata.confidence < 0.55) { clearTranscript(); return; }
  const epoch = ++voiceEpoch;
  const local = window.CareIntents.parse(text, context);
  let command = local?.command || text;
  try {
    const wantsAction = !local || /\b(?:open|take me|bring me|go to|navigate|page|tab|section|add|save|remove|delete|check off|turn|switch|read)\b/i.test(text);
    if (!pendingInput && (!local || local.confidence < 0.9) && wantsAction && window.CareAI?.enabled) {
      $('#voice-hint').textContent = 'Understanding your request…';
      const result = await window.CareAI.request('voice', { text, context: { page: currentPage } });
      if (epoch !== voiceEpoch || !voice.enabled) return;
      if (!result.relevant || result.confidence < 0.8) { clearTranscript(); return; }
      const parsed = window.CareIntents.parse(result.command, context);
      if (parsed && parsed.confidence >= 0.9) command = parsed.command;
    }
  } catch {
    // Known controls and care guidance remain available if AI cannot connect.
  }
  if (epoch !== voiceEpoch || !voice.enabled) return;
  try { handleVoiceCommand(command); }
  finally {
    clearTimeout(transcriptTimer);
    transcriptTimer = setTimeout(clearTranscript, 1200);
  }
}
const stateLabels = {
  listening: 'Listening for your command', speaking: 'Speaking · microphone paused',
  starting: 'Starting microphone…', paused: 'Microphone paused',
  standby: 'Voice assistance off · wake phrase only', off: 'Voice assistance off',
  unavailable: 'Voice input unavailable', permission: 'Microphone permission needed'
};
function updateVoiceState(state, detail) {
  $('#voice').dataset.state = state;
  $('#voice').setAttribute('aria-pressed', String(voice?.enabled || false));
  $('#voice').setAttribute('aria-label', voice?.enabled ? 'Turn off voice assistance' : 'Turn on voice assistance');
  $('#voice-status').textContent = stateLabels[state] || 'Voice assistance';
  $('#voice-interrupt').disabled = !voice?.enabled;
  if (detail) $('#voice-hint').textContent = detail;
  else if (state === 'listening' && !pendingInput) $('#voice-hint').textContent = 'Say what you need, such as “help me understand my notes” or “find a doctor for migraine.”';
  else if (state === 'off') $('#voice-hint').textContent = 'Choose Voice assistance to start. Your microphone is off.';
  else if (state === 'standby') $('#voice-hint').textContent = 'Only “voice assistant on” can activate assistance. Other speech is ignored.';
  else if (state === 'permission') $('#voice-hint').textContent = 'Allow microphone access in your browser, then choose Retry microphone.';
  $('#voice-retry').hidden = !(['permission', 'paused'].includes(state) || (state === 'unavailable' && voice?.supported));
}
function setWakeListening(enabled) {
  save('voice-wake-enabled', enabled);
  $('#voice-wake').checked = enabled;
  if (dialog.open && $('#wake-setting')) $('#wake-setting').checked = enabled;
  voice.setWakeListening(enabled);
}
function setVoiceEnabled(enabled) {
  voiceEpoch++;
  clearTranscript();
  save('voice-enabled', enabled);
  if (enabled) voice.enable();
  else { cancelInput(); voice.disable(); }
  if (dialog.open && $('#tts')) $('#tts').checked = enabled;
}
voice = window.CareVoice.create({
  onTranscript: receiveVoiceTranscript,
  onWake() { setVoiceEnabled(true); toast('Voice assistance enabled. Listening for your command.'); },
  onClear: clearTranscript,
  isExpectedInput: isExpectedVoiceInput,
  onState: updateVoiceState,
  onError(message) { $('#voice-hint').textContent = message; toast(message); }
});
$('#voice').onclick = () => {
  setVoiceEnabled(!voice.enabled);
  if (voice.enabled) $('#voice-hint').textContent = 'Voice assistance enabled. Say what you would like to do.';
};
$('#voice-wake').onchange = event => setWakeListening(event.target.checked);
$('#voice-interrupt').onclick = () => {
  voice.interrupt();
  clearTranscript();
  $('#voice-hint').textContent = pendingInput ? 'Listening for your answer. Say cancel to cancel this input.' : 'Listening. What would you like to do?';
};
$('#voice-retry').onclick = () => {
  if (voice.enabled) voice.enable();
  else if (voice.wakeListening) voice.setWakeListening(true);
  else setVoiceEnabled(true);
};
// A first visit is quiet and does not request microphone access. Saved explicit
// opt-ins can resume listening; no greeting or response plays at startup.
voice.disable();
setWakeListening(load('voice-wake-enabled', false, value => typeof value === 'boolean'));
if (load('voice-enabled', false, value => typeof value === 'boolean')) voice.enable();

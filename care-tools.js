(function (window) {
  'use strict';
  const $ = selector => document.querySelector(selector);
  let options;
  let symptoms = [];
  let visit = {};
  let history = [];
  let chatVersion = 0;
  let planVersion = 0;
  let proposedTasks = [];

  const templates = {
    general: [
      'Describe my top concern and how it affects my daily life',
      'Bring my medication and supplement list, including doses',
      'Ask which tests or referrals are needed and why',
      'Ask when and how I will receive results',
      'Confirm follow-up steps and who to contact with questions'
    ],
    diagnosis: [
      'Bring a timeline of symptoms, triggers, and prior test results',
      'Ask which possible explanations are being considered',
      'Ask what a test can and cannot tell us',
      'Ask whether a specialist referral would help',
      'Ask what changes should prompt urgent care'
    ],
    medication: [
      'Bring the names, doses, timing, and purpose of all my medicines',
      'Describe any side effects or difficulty taking my medicines',
      'Ask about interactions with supplements and other medicines',
      'Ask what to do if I miss a dose',
      'Confirm a written medication plan with my clinician'
    ],
    chronic: [
      'Bring my symptom and activity record',
      'Describe changes in pain, fatigue, sleep, and everyday function',
      'Ask about pacing, support services, and accessibility needs',
      'Discuss my care goals and what progress would look like',
      'Agree on a follow-up date and when to contact the care team'
    ]
  };

  function paragraph(text, className = '') {
    const node = document.createElement('p');
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function aiReady() {
    return Boolean(window.CareAI?.enabled && window.CareAI?.available);
  }

  function renderProgress() {
    const tasks = options.getTasks();
    const completed = tasks.filter(task => task.done).length;
    $('#plan-progress').textContent = `${completed} of ${tasks.length} items complete`;
    $('#plan-meter').max = tasks.length || 1;
    $('#plan-meter').value = completed;
  }

  function renderSymptoms() {
    const holder = $('#symptom-log');
    holder.replaceChildren();
    if (!symptoms.length) holder.append(paragraph('No symptoms recorded yet. A short record can help you describe patterns at your next visit.', 'fine-print'));
    symptoms.slice().reverse().forEach(entry => {
      const row = document.createElement('div');
      row.className = 'symptom-entry';
      const copy = document.createElement('div');
      const label = document.createElement('strong');
      label.textContent = entry.symptom;
      const detail = document.createElement('small');
      detail.textContent = `${entry.date} · severity ${entry.severity}/10${entry.notes ? ` · ${entry.notes}` : ''}`;
      copy.append(label, detail);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove symptom entry: ${entry.symptom}`);
      remove.onclick = () => {
        symptoms = symptoms.filter(item => item.id !== entry.id);
        options.save('care-symptoms', symptoms);
        renderSymptoms();
      };
      row.append(copy, remove);
      holder.append(row);
    });
  }

  function exportPlan() {
    const tasks = options.getTasks();
    const text = [
      'CARE COMPASS · VISIT PREPARATION',
      `Created: ${new Date().toLocaleDateString()}`,
      `Conditions in my profile: ${options.getConditions().join(', ') || 'None selected'}`,
      `Appointment: ${visit.date || 'Not set'}${visit.clinician ? ` · ${visit.clinician}` : ''}`,
      '',
      'MY CHECKLIST',
      ...tasks.map(task => `[${task.done ? 'x' : ' '}] ${task.text}`),
      '',
      'MY SYMPTOM RECORD',
      ...symptoms.map(entry => `${entry.date}: ${entry.symptom} (${entry.severity}/10)${entry.notes ? ` — ${entry.notes}` : ''}`),
      '',
      'This is a personal preparation record. Review medical decisions with a qualified clinician.'
    ].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'my-care-plan.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    options.toast('Your checklist and symptom record have been downloaded.');
  }

  function renderProposedTasks(items, source) {
    proposedTasks = items;
    const result = $('#plan-suggestions');
    result.replaceChildren(paragraph(source, 'tool-source'));
    items.forEach(text => {
      const row = document.createElement('label');
      row.className = 'suggested-task';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      row.append(input, document.createTextNode(text));
      result.append(row);
    });
    $('#plan-apply').hidden = items.length === 0;
  }

  async function buildPlan() {
    const version = ++planVersion;
    const button = $('#plan-build');
    const template = $('#plan-template').value;
    const concern = $('#plan-concern').value.trim();
    if (options.review && !await options.review({ title: 'Prepare this visit checklist?', summary: `Visit focus: ${$('#plan-template').selectedOptions[0].textContent}\nMain concern: ${concern || 'No extra concern entered'}`, actionLabel: 'Prepare checklist', field: $('#plan-concern') })) return;
    if (version !== planVersion || $('#plan-concern').value.trim() !== concern || $('#plan-template').value !== template) return;
    let items = [...(templates[template] || templates.general)];
    if (concern) items.unshift(`Discuss my main concern: ${concern}`);
    button.disabled = true;
    button.textContent = 'Preparing questions…';
    $('#plan-suggestions').replaceChildren(paragraph('Preparing your checklist…', 'tool-source'));
    $('#plan-apply').hidden = true;
    let source = 'Visit preparation template · review the questions you want to add.';
    try {
      if (aiReady()) {
        const result = await window.CareAI.request('plan', {
          text: concern || `Prepare for a ${template} appointment`,
          context: { template, conditions: options.getConditions() }
        });
        const lines = result.text.split('\n').map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
          .filter(line => line.length > 12 && line.length <= 500 && !/^#{1,6}\s/.test(line));
        if (lines.length) {
          items = lines.slice(0, 8);
          source = 'AI suggested visit questions · review each item before adding.';
        }
      }
    } catch {
      source = 'AI could not connect. These visit preparation questions are available now.';
    } finally {
      if (version === planVersion) {
        renderProposedTasks(items, source);
        button.disabled = false;
        button.textContent = 'Prepare my checklist';
      }
    }
  }

  function localReply(text) {
    if (/\b(?:chest pain|severe trouble breathing|cannot breathe|can't breathe|stroke|suicid(?:e|al)|kill myself|overdose)\b/i.test(text)) {
      return 'If this is happening now, contact local emergency services right away. New severe chest pain, severe breathing difficulty, signs of stroke, or an overdose need urgent evaluation. If you may harm yourself, contact emergency services or a crisis service now; in the U.S., call or text 988. This assistant cannot assess an emergency.';
    }
    if (/\b(?:symptom|track|diary|journal|record)\b/i.test(text)) {
      return 'Use the symptom record in My care plan to note what happened, when it happened, its severity, and any triggers. Include how it affected your daily activities. Patterns can help your clinician ask better questions, but a symptom record alone cannot identify the cause.';
    }
    if (/\b(?:medicine|medication|drug|dose|prescription|side effect|interaction)\b/i.test(text)) {
      return 'Make a list of every medicine and supplement, with its dose, timing, and purpose. Ask your pharmacist or clinician about side effects, interactions, and missed doses. Do not start, stop, or change a prescription based on this assistant. Choose Medication review in My care plan to prepare questions.';
    }
    if (/\b(?:insurance|cost|bill|coverage|afford)\b/i.test(text)) {
      return 'Ask your insurer whether the clinician, facility, and any planned tests are in network. Ask the office about referral requirements, prior authorization, and an estimated cost. If costs are a barrier, ask about financial assistance, payment plans, or community health centers. Directory listings do not confirm coverage.';
    }
    if (/\b(?:accommodation|accessibility|wheelchair|sensory|autism|accessible)\b/i.test(text)) {
      return 'Before your visit, ask for the accommodations that help you: a quiet waiting area, step-free access, written instructions, an interpreter, a support person, breaks, or a longer appointment. Add those requests to your checklist and confirm them with the office when booking.';
    }
    const conditions = window.CareMedical.matchConditions(text);
    if (conditions.length && !/\b(?:specialist|find|doctor|refer)\b/i.test(text)) {
      return conditions.map(condition => `${condition.name}: ${condition.summary} Clinicians who may help include ${condition.specialties.join(', ')}.`).join('\n\n') +
        '\n\nAsk your clinician how this information applies to you. I can also help you find condition resources or prepare questions.';
    }
    if (/\b(?:specialist|doctor|find|referral)\b/i.test(text) && !/\b(?:visit|prepare|appointment)\b/i.test(text)) {
      return conditions.length ?
        `For ${conditions[0].name}, relevant specialties can include ${conditions[0].specialties.join(', ')}. Find a specialist has condition resources and clinician directories. Ask about experience, referral requirements, insurance, accessibility, and wait times before booking.` :
        'Find a specialist includes a searchable condition library, specialty suggestions, trusted resources, and clinician directory links. Ask your primary care clinician which specialty fits your concern. Confirm the provider’s experience, availability, insurance, and accessibility directly with the office.';
    }
    if (/\b(?:visit|prepare|appointment|question|checklist)\b/i.test(text)) {
      return 'Start with the concern you most want addressed. Write down when symptoms began, what makes them better or worse, and how they affect daily life. Bring medicines, previous results, and accessibility requests. In My care plan, choose a visit template to create a checklist. Ask: What are the possible causes? What is the next step? When should I follow up?';
    }
    const matches = window.CareMedical.glossaryMatches(text);
    if (matches.length) return matches.map(([term, meaning]) => `${term}: ${meaning}`).join('\n\n') + '\n\nFor a full note, use Medical decoder. Your clinician can explain findings in context.';
    return 'I can help explain medical terms and conditions, find specialist resources, prepare visit questions, organize a medication review, or track symptoms. Tell me which part you need help with. For a personal diagnosis or treatment decision, contact your healthcare team.';
  }

  async function chat(text) {
    if (!text?.trim()) return;
    const version = chatVersion;
    $('#chat-input').value = text;
    if (options.review && !await options.review({ title: 'Send this prompt to your care assistant?', summary: text, actionLabel: 'Send prompt', field: $('#chat-input') })) return;
    if (version !== chatVersion || $('#chat-input').value !== text) return;
    $('#chat-input').value = '';
    const user = document.createElement('div');
    user.className = 'chat-message user';
    user.textContent = text;
    const bot = document.createElement('div');
    bot.className = 'chat-message bot';
    bot.textContent = 'Preparing your guidance…';
    $('#chat-messages').append(user, bot);
    const emergency = /\b(?:chest pain|severe trouble breathing|cannot breathe|can't breathe|stroke|suicid(?:e|al)|kill myself|overdose)\b/i.test(text);
    let reply = localReply(text);
    let source = 'Care navigation library';
    const priorMessages = history.slice(-6).map(message => ({ ...message, content: message.content.slice(0, 1500) }));
    history.push({ role: 'user', content: text });
    try {
      if (aiReady() && !emergency) {
        const response = await window.CareAI.request('assistant', {
          text,
          context: { conditions: options.getConditions(), messages: priorMessages }
        });
        reply = response.text;
        source = 'AI guidance · review with your care team';
      }
    } catch {
      source = 'Care navigation library · AI could not connect';
    }
    if (version !== chatVersion) return;
    bot.replaceChildren(paragraph(reply));
    const label = document.createElement('small');
    label.className = 'tool-source';
    label.textContent = source;
    bot.append(label);
    if (/\b(?:prepare|visit|appointment|medication|accessibility|specialist)\b/i.test(text) && !emergency) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'secondary chat-action';
      action.textContent = 'Add this question to my checklist';
      action.onclick = async () => {
        if (options.review && !await options.review({ title: 'Save this visit question?', summary: text, actionLabel: 'Save question' })) return;
        if (version !== chatVersion || action.disabled) return;
        options.addTask(`Ask my care team: ${text.slice(0, 400)}`);
        action.disabled = true;
        action.textContent = 'Added to my care plan';
        options.toast('Question added to your care plan.');
      };
      bot.append(action);
    }
    history.push({ role: 'assistant', content: reply });
    history = history.slice(-10);
    bot.scrollIntoView({ behavior: window.CareSettings?.preferences.motion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    options.speak(reply);
  }

  function init(callbacks) {
    options = callbacks;
    symptoms = options.load('care-symptoms', [], value => Array.isArray(value) && value.every(entry =>
      entry && typeof entry.id === 'string' && typeof entry.date === 'string' &&
      typeof entry.symptom === 'string' && Number.isFinite(Number(entry.severity)) &&
      typeof entry.notes === 'string'));
    visit = options.load('care-visit', {}, value => value && typeof value === 'object' &&
      (!value.date || typeof value.date === 'string') && (!value.clinician || typeof value.clinician === 'string'));
    $('#visit-date').value = visit.date || '';
    $('#visit-clinician').value = visit.clinician || '';
    const date = new Date();
    $('#symptom-date').value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    $('#visit-form').onsubmit = async event => {
      event.preventDefault();
      const details = { date: $('#visit-date').value, clinician: $('#visit-clinician').value.trim() };
      if (options.review && !await options.review({ title: 'Save these appointment details?', summary: `${details.date || 'No date entered'} · ${details.clinician || 'No office entered'}`, actionLabel: 'Save appointment', field: $('#visit-clinician') })) return;
      if ($('#visit-date').value !== details.date || $('#visit-clinician').value.trim() !== details.clinician) return;
      visit = details;
      options.save('care-visit', visit);
      $('#visit-saved').textContent = 'Appointment details saved on this device.';
      options.toast('Appointment details saved.');
    };
    $('#symptom-form').onsubmit = async event => {
      event.preventDefault();
      const symptom = $('#symptom-name').value.trim();
      if (!symptom || !$('#symptom-date').value) return;
      const severity = Number($('#symptom-severity').value);
      if (!Number.isFinite(severity) || severity < 0 || severity > 10) return;
      const date = $('#symptom-date').value;
      const notes = $('#symptom-notes').value.trim();
      if (options.review && !await options.review({ title: 'Save this symptom record?', summary: `${symptom}\n${date} · severity ${severity}/10\n${notes || 'No triggers or impact entered'}`, actionLabel: 'Save record', field: $('#symptom-name') })) return;
      if ($('#symptom-name').value.trim() !== symptom || $('#symptom-date').value !== date || Number($('#symptom-severity').value) !== severity || $('#symptom-notes').value.trim() !== notes) return;
      symptoms.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        date,
        symptom,
        severity,
        notes
      });
      options.save('care-symptoms', symptoms);
      $('#symptom-name').value = '';
      $('#symptom-notes').value = '';
      renderSymptoms();
      options.toast('Symptom added to your record.');
    };
    $('#plan-build').onclick = buildPlan;
    $('#plan-apply').onclick = async () => {
      const selected = [...$('#plan-suggestions').querySelectorAll('input')];
      const chosen = proposedTasks.filter((_, index) => selected[index]?.checked);
      const version = planVersion;
      if (options.review && !await options.review({ title: 'Save these checklist questions?', summary: chosen.join('\n') || 'No questions selected', actionLabel: 'Save questions' })) return;
      if (version !== planVersion) return;
      let count = 0;
      chosen.forEach(text => {
        if (!options.getTasks().some(task => task.text === text)) {
          options.addTask(text);
          count++;
        }
      });
      options.toast(count ? `${count} questions added to your checklist.` : 'Those questions are already in your checklist.');
      $('#plan-apply').hidden = true;
    };
    $('#plan-export').onclick = exportPlan;
    $('#chat-clear').onclick = () => {
      chatVersion++;
      history = [];
      $('#chat-messages').replaceChildren();
      const greeting = document.createElement('div');
      greeting.className = 'chat-message bot';
      greeting.textContent = 'Conversation cleared. I can help with medical words, condition resources, symptom tracking, and visit preparation.';
      $('#chat-messages').append(greeting);
      options.toast('Conversation cleared.');
    };
    renderSymptoms();
    renderProgress();
  }

  window.CareTools = { init, chat, renderProgress, exportPlan, buildPlan, localReply };
})(window);

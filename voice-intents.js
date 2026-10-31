/* Local intent matching keeps common phrasing quick and prevents unrelated
   speech from reaching either app actions or the optional AI service. */
(function (window) {
  'use strict';
  const normalize = text => String(text || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9/\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const health = /\b(?:medical|health|care|doctor|clinician|physician|specialist|appointment|visit|symptom|symptoms|medication|medications|medicine|prescription|pharmacy|treatment|diagnosis|diagnosed|condition|conditions|disease|lab|labs|blood|pressure|heart|pulse|pain|fatigue|tired|exhausted|exhaustion|dizzy|dizziness|faint|breathing|nausea|swelling|sleep|insurance|referral|accessibility|accommodation|accommodations|wheelchair|telehealth|virtual|hospital|emergency|checklist|reminder|notes|results|report|test|tests|potassium|sodium|glucose|creatinine|hemoglobin|haemoglobin|hematocrit|hba1c|a1c|tsh|ldl|hdl|cholesterol|edema|oedema|tachycardia|bradycardia|hypertension|hypotension|anemia|anaemia|orthostatic|dysautonomia|pots|eds|hsd|ehlers|danlos|fibromyalgia|covid|mcas|mast cell|sjogrens|hashimotos|graves|addisons|cushings|sickle cell|thalassemia|scoliosis|narcolepsy|apnea|lichen|lyme|celiac|coeliac|bipolar|ptsd|dementia|alzheimers|hiv|hepatitis|gastritis|gerd|reflux|gout|ferritin|bilirubin|albumin|platelets?|wbc|rbc|cbc|cmp|bun|egfr|alt|ast|crp|esr|ecg|ekg|mri|ct|ultrasound|migraines?|diabetes|asthma|copd|arthritis|lupus|cancer|epilepsy|seizures?|parkinsons|multiple sclerosis|sclerosis|crohns?|colitis|ibs|ibd|celiac|coeliac|thyroid|endometriosis|pcos|kidney|renal|cardiology|cardiologist|neurology|neurologist|rheumatology|rheumatologist|dermatology|dermatologist|gastroenterology|gastroenterologist|allergy|allergies|immunology|oncology|oncologist|endocrinology|endocrinologist|nephrology|nephrologist|pulmonology|pulmonologist|urology|urologist|gynecology|gynecologist|obgyn|depression|anxiety|adhd|autism|osteoporosis|eczema|psoriasis|hypermobile|hypermobility|benign|chronic|inflammation|infection|oxygen|rest|pacing|energy|mmhg|mg\/dl|g\/dl|mmol|bpm|records?|reports?|transportation|interpreter|identification|copay|forms?|exercise|hydration|follow-up|diet|support person)\b|\b(?:me\/?cfs|m e c f s|chronic fatigue syndrome)\b/;
  const unrelated = /\b(?:minecraft|roblox|fortnite|pokemon|playstation|xbox|video games?|gaming|creeper|diamonds?|football|basketball|baseball|soccer|stock market|bitcoin|crypto|weather|politics|election|movie|movies|netflix|homework|recipe|recipes)\b/;
  const polite = text => normalize(text).replace(/^(?:(?:hey|okay|ok|please|care compass|compass|assistant|can you|could you|would you|will you|i would like you to|id like you to)\s+)+/, '').replace(/\s+(?:please|for me)$/, '').trim();
  function medicallyRelevant(text) {
    if (health.test(normalize(text))) return true;
    // Use the shared medical library as it grows, including aliases and terms
    // that do not need to be duplicated in this small intent vocabulary.
    try {
      return Boolean(window.CareMedical?.matchConditions?.(text)?.length ||
        window.CareMedical?.glossaryMatches?.(text)?.length);
    } catch { return false; }
  }
  function isWake(text) {
    const value = polite(text);
    return /^(?:(?:turn|switch) on (?:the |my )?voice (?:assistant|assistance)|(?:turn|switch) (?:the |my )?voice (?:assistant|assistance) on|voice (?:assistant|assistance) on|(?:enable|activate|start|wake up) (?:the |my )?voice (?:assistant|assistance))$/.test(value);
  }
  function parse(text, context = {}) {
    const raw = String(text || '').trim();
    const value = polite(raw);
    if (!value || unrelated.test(value)) return null;
    const result = (command, confidence = 0.97) => ({ command, confidence });
    const pending = typeof context.pending === 'string' ? context.pending : context.pending?.kind;
    if (pending === 'confirmation') {
      if (/^(?:yes|yeah|yep|okay|ok|confirm|send|save|submit|go ahead|that(?:s| is) (?:right|correct)|looks (?:right|good))(?: (?:please|it|this|that|send it|save it|submit it|and send it|and save it))?$/.test(value)) return result('confirm');
      if (/^(?:no|nope|change|edit|change it|edit it|change input|edit input|let me (?:change|edit)(?: it)?|dont (?:send|save|submit)(?: it)?)$/.test(value)) return result('change');
      if (/^(?:repeat|repeat it|read it again|read (?:the )?(?:input|preview)|what did (?:i|you) (?:say|hear))$/.test(value)) return result('repeat');
    }
    if (isWake(raw)) return result('voice assistant on');
    if (/^(?:(?:turn|switch) off (?:the |my )?voice (?:assistant|assistance|control)|(?:turn|switch) (?:the |my )?voice (?:assistant|assistance|control) off|voice (?:assistant|assistance|control) off|(?:disable|deactivate|stop|pause) (?:the |my )?(?:voice(?: assistant| assistance| control)?|listening|microphone))$/.test(value)) return result('turn off voice assistant');
    if (/^(?:stop(?: speaking| talking| reading)?|quiet|be quiet|silence|mute|pause speech|interrupt)$/.test(value)) return result('stop speaking');
    if (/^(?:cancel(?: input| that)?|never mind|nevermind|forget that)$/.test(value)) return result('cancel');
    if (/^(?:close(?: the)?(?: dialog| window| settings)?|dismiss|go back)$/.test(value)) return result('close dialog');
    if (/^(?:help(?: me)?(?: with)?(?: voice commands)?|voice commands|what can (?:i|you) (?:say|do)|show me (?:the )?commands)$/.test(value)) return result('help with voice commands');
    if (/^(?:read(?: aloud)?(?: this| the)? (?:page|section)|read this section|read it to me)$/.test(value)) return result('read this page');
    if (/^(?:(?:read|show|open|go to)(?: my| the)? (?:visit )?checklist|read my list|what(?:s| is) on my checklist)$/.test(value)) return result('read my checklist');
    if (/^(?:read|show)(?: my| the)? (?:results|explanation)$/.test(value)) return result('read results');
    if (/^(?:(?:open|show|change|edit|update) (?:my |the )?)?(?:accessibility(?: settings)?|preferences|settings)$/.test(value)) return result('accessibility settings');
    if (/^(?:(?:turn|switch|enable|disable) )?(?:larger text|large text|higher contrast|high contrast)(?: (?:on|off))?$/.test(value)) return result(value);
    if (/^(?:(?:turn|switch|enable|disable) )?(?:dark mode|dyslexia(?: mode)?|reduced motion|reduce motion)(?: (?:on|off))?$/.test(value)) {
      return result(value.replace(/\bdyslexia\b(?! mode)/, 'dyslexia mode').replace(/\breduce motion\b/, 'reduced motion'));
    }
    if (/^(?:make (?:the )?text (?:bigger|larger)|increase (?:the )?font size)$/.test(value)) return result('larger text on');
    if (/^save(?: accessibility)? preferences$/.test(value)) return result('save preferences');
    if (/^(?:(?:open|go to|edit|show|update|add)(?: my| a| the)? )?(?:health profile|profile|condition|conditions)$/.test(value)) return result('edit profile');
    if (/^(?:save(?: my| the)? profile|save conditions)$/.test(value)) return result('save profile');
    if (/^(?:(?:open|read|show) )?(?:our promise|about|about care compass)$/.test(value)) return result('our promise');
    if (/^(?:(?:open|read|show|check) )?(?:my )?notifications$/.test(value)) return result('notifications');
    if (/^(?:open|visit)(?: the)? (?:directory|specialist directory|website)$/.test(value)) return result('open directory');
    if (/^(?:ask(?: a)? question|i have a question|talk to(?: the)?(?: care)? assistant)$/.test(value)) return result('ask a question');
    if (/^(?:prepare|build|generate|create)(?: my| a| the)? (?:visit |appointment )?(?:checklist|care plan)$/.test(value)) return result('prepare my checklist');
    if (/^(?:download|export|save a copy of)(?: my| the)? care plan$/.test(value)) return result('download my care plan');
    if (/^(?:track|record|log|add)(?: my| a| the)? symptoms?$/.test(value)) return result('track my symptoms');

    const destinations = [
      ['overview', /^(?:(?:go|take me|bring me|get me|navigate|return) (?:back )?to |(?:open|show(?: me)?|visit) (?:the )?|go )?(?:the )?(?:home|overview|dashboard|home page|start screen|start page|landing page)$/],
      ['medical decoder', /^(?:(?:go|take me|bring me|navigate) to |(?:open|show(?: me)?|visit) (?:the )?)?(?:medical decoder|decoder|medical words|decode page)$/],
      ['find a specialist', /^(?:(?:go|take me|bring me|navigate) to |(?:open|show(?: me)?|visit) (?:the )?)?(?:find a specialist|specialists?|specialist finder|find specialist page)$/],
      ['my care plan', /^(?:(?:go|take me|bring me|navigate) to |(?:open|show(?: me)?|visit) (?:the )?)?(?:my )?(?:care plan|plan|visit preparation|visit checklist)$/],
      ['care assistant', /^(?:(?:go|take me|bring me|navigate) to |(?:open|show(?: me)?|visit) (?:the )?)?(?:care assistant|assistant|chat|chat page)$/]
    ];
    for (const [command, pattern] of destinations) if (pattern.test(value)) return result(command);
    if (/^(?:id like to |i want to |i need to )?(?:understand|decode|explain|simplify|translate|make sense of)(?: my| the| these| this)?(?: medical| clinical| lab)? (?:notes|results|report|document|medical words)(?: (?:in|into) (?:plain english|everyday language|simple words))?$/.test(value) ||
        /^(?:what do(?:es)? (?:my|these|this) (?:medical |lab )?(?:notes|results|report) mean|help me understand (?:my |these |the )?(?:medical |lab )?(?:notes|results|report))$/.test(value)) return result('explain my notes');
    if (/^(?:dictate(?: my| the)?(?: medical)? notes|decode a document|upload(?: a| my)? document)$/.test(value)) return result('decode my notes');
    if (context.page === 'decoder' && /^(?:explain (?:this|it|these)(?: in (?:everyday language|plain english|simple words))?|make (?:this|it) easier to understand|simplify (?:this|it)|explain in everyday language)$/.test(value)) return result('explain my notes');
    if (/^(?:add|dictate)(?: some)? more notes$/.test(value)) return result('add more notes');
    if (/^(?:help me|i want to|i need to|lets) (?:get ready|prepare)(?: for)? (?:my |the |a |an |next )?(?:doctor(?:s)? )?(?:visit|appointment)$/.test(value)) return result('my care plan');

    const specialist = value.match(/^(?:(?:find|search for|look for|help me find)(?: me| a)?|i (?:need|want)(?: to find)?(?: a)?|id like(?: to find)?(?: a)?) (?:specialist|specialists|doctor|clinician|physician)(?: (?:for|with|who (?:treats|knows|understands)))?(?: (.+))?$/);
    if (specialist) return result(specialist[1] ? `find a specialist for ${specialist[1]}` : 'find a specialist');
    const conditionSpecialist = value.match(/^(?:(?:find|help me find|look for)(?: me)?|i (?:need|want))(?: a| an)? (.+?) (?:doctor|specialist)$/);
    if (conditionSpecialist && medicallyRelevant(conditionSpecialist[1])) return result(`find a specialist for ${conditionSpecialist[1]}`);
    const conditionFirst = value.match(/^(?:i have|im navigating|im dealing with) (.+?) and (?:need|want|would like)(?: to find)? (?:a )?(?:doctor|specialist)$/);
    if (conditionFirst && medicallyRelevant(conditionFirst[1])) return result(`find a specialist for ${conditionFirst[1]}`);
    const add = raw.match(/^(?:(?:please|can you|could you)\s+)?(?:add|put|save)(?:\s+(?:a|new))?\s+(?:task|question|reminder|checklist item)(?:\s+(?:to (?:my|the) (?:care plan|checklist)|that says))?(?:\s*[:,-]?\s+(.+))?$/i);
    if (add) return result(add[1] ? `add a task ${add[1]}` : 'add a task');
    const addToList = raw.match(/^(?:please\s+)?(?:add|put|save)\s+(.+?)\s+(?:to|on|in)\s+(?:my|the)\s+(?:checklist|care plan|list)$/i);
    if (addToList) return result(`add ${addToList[1]} to my checklist`);
    const remember = raw.match(/^(?:please\s+)?(?:remind me to|help me remember to|make a note to)\s+(.+)$/i);
    if (remember && medicallyRelevant(remember[1])) return result(`add a task ${remember[1]}`);
    const task = value.match(/^(complete|check off|mark complete|mark incomplete|uncheck|remove|delete|finish)(?: (?:item|task|number))?(?: (.+))?$/);
    if (task) return result(`${task[1] === 'finish' ? 'complete' : task[1]} item${task[2] ? ` ${task[2]}` : ''}`);
    if (context.pending && medicallyRelevant(raw)) return result(raw, 0.85);
    if (/^(?:what(?:s)?|why|how|can i|should i|do i|is|are|does|tell me|explain|help me)\b/.test(value) && medicallyRelevant(raw)) return result(raw, 0.88);
    return null;
  }
  function isRelevant(text, context = {}) {
    const value = normalize(text);
    if (!value || value.length > 12000 || unrelated.test(value)) return false;
    if (parse(text, context)) return true;
    const directed = polite(text);
    if (/^(?:open|show|take me|bring me|get me|go|navigate|return|switch)\b/.test(directed) && /\b(?:page|screen|tab|section|website)\b/.test(directed)) return true;
    const pending = typeof context.pending === 'string' ? context.pending : context.pending?.kind;
    if (pending === 'task' && /\b(?:id|photo identification|ride|transportation|records?|interpreter|forms?|copay|support person)\b/.test(value)) return true;
    if (pending === 'task-choice') return /^(?:(?:item|task|number) )?(?:[1-9]\d?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)$/.test(value);
    if (['profile', 'specialty'].includes(pending) && /\b(?:other|undiagnosed|exploring a diagnosis)\b/.test(value)) return true;
    return medicallyRelevant(text);
  }
  window.CareIntents = { parse, isRelevant, isWake };
})(window);

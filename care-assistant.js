/* Local educational replies. These rules do not diagnose or replace connected AI. */
(function (window) {
  'use strict';
  const normalize = text => String(text || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9/\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const emergency = /\b(?:chest (?:pain|pressure|tightness)|(?:severe )?(?:trouble|difficulty) breathing|(?:cannot|cant|can not|unable to) breathe|struggling to breathe|hard to breathe|stroke|suicid(?:e|al)|(?:kill|hurt|harm)(?:ing)? myself|end my life|overdose|(?:took|taken) too many (?:pills|tablets|medicines?|medications?))\b/;
  const intents = {
    medication: /\b(?:medicines?|medications?|meds|pills?|tablets?|prescriptions?|drugs?|doses?|dosages?|side effects?|interactions?|supplements?|pharmacist)\b|\b(?:can|should|may) i (?:take|stop|combine|change|increase|decrease)\b/,
    costs: /\b(?:insurance|insurer|costs?|bills?|billing|coverage|afford|copays?|co pay|in network|out of network|financial|paying|payment|prior authorization)\b|\bpay for (?:my |medical |health )?(?:care|treatment|visit)/,
    accessibility: /\b(?:accommodations?|accessibility|accessible|wheelchair|sensory|interpreter|step free|written instructions|quiet waiting|hearing impaired)\b/,
    tracking: /\b(?:track|tracking|record|recording|diary|journal|log|logging|monitor|monitoring)\b/,
    visit: /\b(?:appointments?|visits?|checkups?|check up|consultation|booking|book|schedule|checklist|prepare|preparing)\b|\b(?:get ready|getting ready|what should i (?:ask|bring)|what to (?:ask|bring)|see my doctor|ask (?:my|a|the) (?:doctor|clinician))\b|\bquestions?\b.{0,60}\b(?:doctor|clinician|visit|appointment|ask)\b/,
    specialist: /\b(?:specialists?|referrals?|refer|cardiologist|neurologist|dermatologist)\b|\b(?:what|which|kind of|type of) (?:doctor|clinician)|\bwho (?:should|can) i see|\b(?:find|need|looking for) (?:a |an |my )?(?:doctor|clinician)\b/,
    wellbeing: /\b(?:stressed|stress|worried|worry|scared|overwhelmed|lonely|feeling down)\b/
  };
  const symptoms = [
    ['fatigue', /\b(?:tired|fatigue|exhausted|exhaustion|low energy|no energy|worn out)\b/, 'tiredness or fatigue', 'sleep, activity, and any medicines you take', 'How long have you felt this tired, and how is it affecting your day?'],
    ['headache', /\b(?:headaches?|head (?:hurts|aches)|aching head)\b/, 'headache', 'when it started, its intensity, and any changes in vision or other symptoms', 'When did the headache start, and is this a new or unusual pattern for you?'],
    ['dizziness', /\b(?:dizzy|dizziness|lightheaded|light headed|faint|fainting|woozy)\b/, 'dizziness', 'whether it happens standing up, after meals, or during activity', 'When does the dizziness happen, and have you fainted?'],
    ['sleep', /\b(?:sleep|sleeping|insomnia|cant sleep|cannot sleep|unrefreshing)\b/, 'sleep difficulty', 'bedtime, waking times, and how rested you feel', 'Is the difficulty falling asleep, staying asleep, or feeling rested?'],
    ['stomach', /\b(?:stomach|belly|abdominal|nausea|nauseous|vomit|vomiting|diarrhea|constipation)\b/, 'digestive symptoms', 'timing, foods, bowel changes, and other symptoms', 'What are you noticing, and how long has it been happening?'],
    ['skin', /\b(?:rash|itch|itchy|itching|skin irritation)\b/, 'skin symptoms', 'where they occur and any new products or medicines', 'Where is the skin affected, and when did it start?'],
    ['pain', /\b(?:pain|hurts|ache|aches|aching|sore|soreness)\b/, 'pain', 'where it is, when it began, and what changes it', 'Where is the pain, and how long has it been happening?']
  ];
  const isEmergency = text => emergency.test(normalize(text));
  const unrelated = /\b(?:minecraft|roblox|fortnite|gaming|football|movies?|politics|weather|recipes?)\b/;
  const isFollowUp = text => /\b(?:that|this|it|those|these|more|else|next|about them|what (?:doctor|should i ask)|which (?:doctor|specialist)|who should i see)\b/.test(text);
  const genericFollowUp = text => /^(?:please )?(?:tell me more(?: about (?:it|that|this))?|explain (?:it|that|this)(?: again)?|(?:can|could) you explain (?:it|that|this)|what does (?:it|that|this) mean|what (?:else|next)|more(?: please)?)$/.test(text);
  const introducesSubject = text => /\b(?:for|about|handles|treats)\s+(?!(?:it|this|that|those|these|them)\b)/.test(text);
  const isGreeting = text => /^(?:hi|hello|hey|good (?:morning|afternoon|evening)|thanks|thank you|thank you so much|okay|ok)[.! ]*$/.test(text);
  const knowledge = text => ({
    conditions: Array.from(window.CareMedical?.matchConditions(text) || []),
    terms: Array.from(window.CareMedical?.glossaryMatches(text) || [])
  });

  function analyze(text) {
    const value = normalize(text);
    const found = knowledge(text);
    // A current care task takes precedence over a condition mentioned as context.
    const intent = Object.keys(intents).find(topic => intents[topic].test(value));
    const symptom = symptoms.find(([, pattern]) => pattern.test(value));
    const explaining = /^(?:what (?:is|are|does)|define|explain|tell me about|what do you mean by)\b/.test(value);
    const topic = explaining && found.conditions.length ? 'condition' :
      intent || symptom?.[0] || (found.conditions.length ? 'condition' : '') ||
      (found.terms.length ? 'term' : /\b(?:labs?|blood tests?|bloodwork|blood work|results?|reports?|low iron)\b/.test(value) ? 'term' : '');
    return { topic, ...found, symptom, value };
  }

  function previousSubject(messages) {
    const previous = messages.filter(message => message?.role === 'user' && typeof message.content === 'string').slice(-3);
    for (let index = previous.length - 1; index >= 0; index -= 1) {
      const text = previous[index].content;
      if (isGreeting(normalize(text))) continue;
      const subject = analyze(text);
      if (unrelated.test(subject.value) && !subject.conditions.length && !subject.symptom && !subject.terms.length) break;
      if (subject.conditions.length || subject.symptom || subject.topic && (!isFollowUp(subject.value) || introducesSubject(subject.value))) return subject;
      // An unrelated or unfamiliar new subject should not resurrect an older condition.
      if (!genericFollowUp(subject.value) && !subject.topic) break;
    }
    return null;
  }

  function respond(text, { messages = [], conditions = [] } = {}) {
    const input = String(text || '').trim();
    const value = normalize(input);
    const result = (reply, topic) => ({ text: reply, topic, emergency: false });
    if (isEmergency(input)) {
      return {
        text: 'If this is happening now, contact local emergency services right away. New severe chest pain, severe breathing difficulty, stroke signs, or an overdose need urgent evaluation. If you may harm yourself, contact emergency services or a crisis service now; in the U.S., call or text 988. This assistant cannot assess an emergency.',
        topic: 'emergency', emergency: true
      };
    }
    if (!value || isGreeting(value)) {
      return result(/\bthank/.test(value) ? 'You’re welcome. What would you like help with next?' : 'Hi! What health question or care step is on your mind?', 'greeting');
    }
    if (/\b(?:my (?:health )?profile|my selected conditions|conditions in my profile)\b/.test(value)) {
      const selected = [...new Set(conditions.filter(condition => typeof condition === 'string'))].slice(0, 6);
      return result(selected.length ?
        `Your profile lists ${selected.join(', ')} as care navigation context. This does not confirm a diagnosis. Which one would you like to discuss?` :
        'Your profile has no selected conditions. Which condition or care concern would you like to discuss?', 'profile');
    }
    const current = analyze(input);
    if (unrelated.test(value) && !current.conditions.length && !current.symptom && !current.terms.length) {
      return result('This assistant focuses on health and care navigation. What health question would you like to work on?', 'clarification');
    }
    const turns = Array.isArray(messages) ? messages : [];
    const referringBack = genericFollowUp(value) || current.topic && isFollowUp(value) && !introducesSubject(value);
    const previous = referringBack ? previousSubject(turns) : null;
    if (!current.topic && /^(?:(?:since|for|about) )?(?:today|yesterday|last night|this morning|(?:a|an|one|two|three|four|five|six|seven|\d+) (?:minutes?|hours?|days?|weeks?|months?|years?))(?: ago)?$/.test(value)) {
      const recent = previousSubject(turns);
      const lastReply = turns.filter(message => message?.role === 'assistant' && typeof message.content === 'string').at(-1);
      if (recent?.symptom && lastReply && normalize(lastReply.content).includes(normalize(recent.symptom[4]))) {
        return result(`You said “${input}” in response to the question about ${recent.symptom[2]}. Keep that timing with a record of severity, triggers, and impact on daily life. Discuss new, persistent, or worsening symptoms with a clinician. Has it changed since it began?`, recent.symptom[0]);
      }
    }
    const subject = current.topic ? current : previous || current;
    // Follow-up care logistics can reference a named condition from the conversation,
    // but medication, costs, and new symptom topics never inherit a diagnosis.
    const named = current.conditions.length ? current.conditions :
      previous && ['specialist', 'visit', 'tracking', 'condition', 'term', ''].includes(current.topic) && !current.symptom ? previous.conditions : [];
    const names = named.map(condition => condition.name).join(' and ');

    if (subject.topic === 'medication') {
      const dosing = /\b(?:how (?:much|many)|dosage|dose|stop|increase|decrease|combine|change)\b/.test(value);
      return result(`${dosing ? 'I cannot choose a dose or tell you to start, stop, combine, or change medicines. ' : ''}For a medication review, write down each medicine or supplement, its dose, when you take it, and any concerns. Ask your pharmacist or clinician about its purpose, side effects, interactions, and missed doses. Which medicine or medication question would you like help wording?`, 'medication');
    }
    if (subject.topic === 'costs') {
      return result('For costs or coverage, ask your insurer whether the clinician, facility, and tests are in network and whether a referral or prior authorization is required. Ask the office for an estimated cost and about financial assistance or payment plans. What part is causing trouble: coverage, a bill, or paying for a visit?', 'costs');
    }
    if (subject.topic === 'accessibility') {
      return result('Tell the office what would help you participate: written instructions, an interpreter, step-free access, a quieter waiting space, breaks, or a support person. Ask before booking and confirm what they can provide. What accommodation would make your visit easier?', 'accessibility');
    }
    if (subject.topic === 'specialist') {
      if (named.length) {
        return result(`${named.map(condition => `For questions about ${condition.name}, relevant specialties can include ${condition.specialties.join(', ')}.`).join(' ')} Find a specialist has public resources and directory links. Ask the office about condition experience, referrals, insurance, availability, and accessibility before booking.`, 'specialist');
      }
      const symptom = current.symptom || previous?.symptom;
      if (symptom) {
        return result(`A primary care clinician is a starting point for discussing ${symptom[2]} and deciding whether a specialist referral is appropriate. Describe when it happens and how it affects you. Symptoms alone do not identify the right specialty or establish a diagnosis.`, 'specialist');
      }
      return result('The appropriate specialty depends on the condition or concern. A primary care clinician can help choose a referral, and Find a specialist lets you search public condition resources. What condition or concern are you seeking care for?', 'specialist');
    }
    if (subject.topic === 'visit') {
      const focus = names ? `For a visit about ${names}, ` : 'For your visit, ';
      return result(`${focus}bring your symptom timeline, medication list, previous results, and the concern you most want addressed. Useful questions are: What could explain this? What tests or referrals would help and why? What changes need urgent attention? When should I follow up? My care plan can save these questions. What would you most like addressed at the visit?`, 'visit');
    }
    if (subject.topic === 'tracking') {
      return result(`In My care plan, use the symptom record to note ${names ? `concerns you want to discuss about ${names}` : 'what happened'}, the date, severity, triggers, and impact on daily activities. Keep observations separate from guesses about the cause. What symptom or pattern would you like to record?`, 'tracking');
    }
    if (subject.topic === 'condition' && named.length) {
      return result(named.slice(0, 3).map(condition => `${condition.name}: ${condition.summary} Relevant specialties can include ${condition.specialties.join(', ')}. Public information is available from ${condition.resources.map(resource => resource.name).join(', ')}.`).join('\n\n') +
        '\n\nThis explains the condition name and does not establish a diagnosis. Would you like help finding care or preparing questions about it?', 'condition');
    }
    if (subject.symptom) {
      const [, , label, details, question] = subject.symptom;
      return result(`For ${label}, write down ${details}, how often it happens, and how it affects daily life. Several things can cause similar symptoms, so this description alone cannot identify the cause. Discuss new, persistent, or worsening symptoms with a clinician. ${question}`, subject.topic);
    }
    if (subject.topic === 'wellbeing') {
      return result('Feeling worried or overwhelmed can make navigating care harder. Write down one concern to discuss with your care team, and ask a trusted person for practical support if that would help. What part feels hardest right now?', 'wellbeing');
    }
    if (subject.topic === 'term') {
      const definitions = (current.terms.length ? current.terms : subject.terms).slice(0, 4);
      if (definitions.length) {
        return result(definitions.map(([term, meaning]) => `${term}: ${meaning}`).join('\n\n') +
          (/\d/.test(input) ? '\n\nA number needs its units, the lab’s reference range, and clinical context; I cannot diagnose from an isolated value.' : '') +
          '\n\nWhat exact sentence or result would you like help understanding?', 'term');
      }
      return result('To explain a result accurately, I need the exact test name or wording. Include the units and reference range for a lab number, and leave identifying details out. What does the report say?', 'term');
    }
    const excerpt = input.length > 160 ? `${input.slice(0, 160)}…` : input;
    return result(`I do not have a reliable local answer for “${excerpt}” yet. What specific symptom, medical word, or care step would you like help with?`, 'clarification');
  }

  window.CareAssistant = { respond, isEmergency };
})(window);

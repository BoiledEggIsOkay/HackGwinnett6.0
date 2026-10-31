(function (window) {
  'use strict';
  let options;
  const updated = '<p class="fine-print">Last updated October 31, 2026 · Care Compass prototype</p>';
  const pages = {
    terms: {
      title: 'Terms of use',
      html: `${updated}<h3>What this service provides</h3><p>Care Compass is a HackGwinnett educational prototype for explaining medical wording, exploring public care resources, and preparing questions. Using it does not create a clinician–patient relationship. It is not a diagnostic, prescribing, or emergency service.</p><h3>Your decisions and information</h3><p>Review important information with a qualified clinician. Do not change treatment based on this website. You are responsible for the information you choose to enter; avoid identifying information or other people’s private records.</p><h3>AI and external resources</h3><p>AI can make mistakes, miss context, or provide incomplete answers. Public directory links do not guarantee expertise, availability, insurance coverage, or an endorsement. External websites have their own terms and policies.</p><h3>Availability and appropriate use</h3><p>This prototype is provided as available, without a promise of uninterrupted service or medical accuracy. Do not use it to harm others, submit unlawful material, or disrupt the service. Features and these terms may change as the prototype develops.</p><h3>Urgent situations</h3><p>For severe or sudden symptoms, contact local emergency services. In the U.S., call 911 for an emergency or call or text 988 for a mental health crisis.</p><h3>Questions</h3><p>Use Help &amp; feedback for usage guidance and the project’s issue tracker. Do not include medical records or personal details in a public issue.</p>`
    },
    privacy: {
      title: 'Privacy policy',
      html: `${updated}<h3>Data stored on your device</h3><p>Your selected conditions, checklist, symptom record, appointment details, and settings are kept in this browser’s local storage. They are not encrypted by the app and may be visible to someone using the same browser profile. Clear them in Settings with “Clear my data from this device.”</p><h3>Notes and conversations</h3><p>Medical notes, uploaded file text, and chat messages are used for the current visit and are not saved to local storage by the app. Uploads are read in your browser. When connected AI is enabled, the text needed for the requested tool is sent to the service through our server.</p><h3>AI processing</h3><p>AI connects automatically when the operator configures a provider key. You can switch AI off before submitting anything. Submitted text, relevant selected conditions, and recent chat context may be sent to OpenAI. The app’s server does not persist or log that medical input. It requests responses with storage disabled; provider processing and retention policies still apply.</p><p><a href="https://openai.com/policies/privacy-policy/" target="_blank" rel="noopener noreferrer">Read OpenAI’s privacy policy ↗</a></p><h3>Microphone and spoken guidance</h3><p>Microphone access starts only after you enable voice assistance or wake listening. Browser speech recognition may send audio to the browser’s speech provider. The app does not record or retain audio. Wake listening continues to use the microphone while voice assistance is off if you enabled that setting. Other commands are ignored in that mode.</p><h3>Tracking and external websites</h3><p>This prototype does not include advertising, analytics trackers, or marketing cookies. It uses local storage for the features described above. Hosting providers may process ordinary connection information such as IP addresses. Clicking an external resource takes you to another site with its own data practices.</p><h3>Your choices</h3><p>Turn off AI, voice, and wake listening in Settings, revoke microphone permission in your browser, or clear this device’s app data. Clearing local data does not delete information already processed by an external provider.</p>`
    },
    accessibility: {
      title: 'Accessibility and support',
      html: `${updated}<p>Care Compass aims to support keyboard navigation, readable text, clear focus indicators, and optional voice guidance. The prototype has not had a formal accessibility audit.</p><h3>Choose what works for you</h3><p>Settings includes larger text, light or dark themes, higher contrast, reading font and spacing, reduced animation, speaking voice and speed, and optional spoken replies. All main tools also work without a microphone.</p><h3>Keyboard controls</h3><p>Use Tab and Shift+Tab to move, Enter or Space to activate controls, and Escape to close dialogs. The “Skip to content” link moves to the main page. File uploads support keyboard access.</p><h3>Voice input</h3><p>Chrome and Edge generally offer the best speech recognition support. Browser permissions, device voices, language support, and internet access affect voice features. Listening pauses during spoken replies; use Interrupt to resume sooner.</p><p>Report barriers through Help &amp; feedback. Include the affected feature and browser, and avoid sharing private medical information.</p>`
    },
    help: {
      title: 'Help & feedback',
      html: `<h3>Getting started</h3><p>Use Medical decoder for wording and abbreviations, Find a specialist for condition and clinician specialty resources, My care plan for visit preparation and symptom records, and Care assistant for questions.</p><h3>Microphone permission</h3><p>Use a stable localhost or HTTPS address and choose the browser’s persistent microphone permission when offered. If voice is blocked, check the microphone setting beside the address bar. Temporary permissions and some embedded previews can prompt again; the app cannot override that browser choice.</p><h3>Review before sending</h3><p>With voice assistance on, say or type your input, then review it. Say “confirm” to send or save, “change” to edit, or “cancel” to discard the action. With voice off, ordinary Send and Save buttons work directly.</p><h3>AI connection</h3><p>The service connects automatically when configured by the site operator. If it cannot connect, the local library remains available. You can switch AI off in Settings.</p><h3>Report a problem</h3><p><a href="https://github.com/BoiledEggIsOkay/HackGwinnett6.0/issues" target="_blank" rel="noopener noreferrer">Open the project issue tracker ↗</a></p><p>Include the browser and steps to reproduce the problem. Public issues can be read by others; keep health records, passwords, and API keys out of your report.</p>`
    }
  };
  function open(kind) {
    if (!pages[kind]) return;
    options.modal(pages[kind].title, `<article class="policy-copy">${pages[kind].html}</article>`);
  }
  function init(config) {
    options = config;
    document.querySelectorAll('[data-policy]').forEach(link => {
      link.onclick = event => { event.preventDefault(); open(link.dataset.policy); };
    });
    const initial = window.location.hash.slice(1);
    if (pages[initial]) open(initial);
  }
  window.CarePolicies = { init, open };
})(window);

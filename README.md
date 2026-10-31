# Care Compass · HackGwinnett 6.0

## Elevator pitch

Care Compass helps people turn confusing medical notes into clear next steps,
find trusted specialist resources, and feel prepared for care. With accessible
voice guidance, a personal care plan, and connected AI tools, it gives people
navigating chronic or overlooked conditions a clearer way to advocate for themselves.

This educational prototype includes a medical decoder, specialist resources,
visit preparation, symptom tracking, and a care assistant. It supports informed
conversations with clinicians and does not diagnose or prescribe.

## Run locally

Install Node.js 18 or newer, then run these commands from the **whole project
folder**:

```sh
cd /Workshop/HackGwinnett6.0
npm start
```

On your Mac, use the path where you downloaded or cloned this folder instead of
`/Workshop/HackGwinnett6.0`. Open **http://localhost:3000** in Chrome or Edge.
There are no application dependencies to install.

Opening `index.html` directly uses a `file://` address. Browsers can ask for
microphone permission again for each new recognition session on local files.
Voice input is disabled in that mode to prevent repeated permission dialogs;
run `npm start` and open the localhost address above to use it.

Keep the whole project folder together, including all JavaScript modules.
Opening an HTML-only copy or a preview that does not serve the other files
will lose the formatting and scripts. If you see an unformatted white page,
confirm you are visiting the localhost URL, restart the server, and refresh
with **Command + Shift + R** on a Mac. In Chrome's Network panel, `style.css?v=6`
should return `200` with a `text/css` content type.

The stylesheet uses local system fonts and needs no Google Fonts request.
The local server sends fresh asset headers, and the HTML includes versioned
asset URLs to refresh older cached files.

## Voice assistance and settings

Voice assistance defaults to **off**. A first visit starts without requesting a
microphone or playing a greeting. Choose **Voice assistance** when you want
spoken input guidance. Page announcements and responses only play while voice
is on.

When you open a section that needs input, the assistant explains what to enter.
In Care assistant, dictate or type a prompt; the assistant reviews it and asks
you to confirm before sending. The same review step applies to notes and saved
care information while voice assistance is enabled. Say **confirm**, **send**,
or **save** to continue, **change** to edit, or **cancel** to discard the action.
The visible confirmation controls also work without speaking.

The app keeps an approved recognition session open through spoken replies
instead of requesting a new microphone session after every response. It checks
saved permission without opening a separate audio stream. If recognition ends,
it reconnects automatically only when the browser reports a saved grant.
Temporary or unsupported permission status pauses capture until you choose
**Retry microphone**, preventing automatic permission-request loops. Saved
voice preferences also resume capture on later visits only with a saved grant.

Use **HTTPS** or **localhost** and choose a persistent microphone permission in
the browser's site settings when offered. If access is denied, allow it there,
then choose **Retry microphone**.

**Listen for “voice assistant on”** is separate and optional. While voice is
off, it uses the microphone only to recognize a wake phrase and ignores other
commands. Uncheck this option to stop wake listening when assistance is off.

Examples:

| Say | Result |
| --- | --- |
| “Take me to the medical decoder” | Opens notes input and explains what to enter |
| “Help me understand my notes” | Captures notes for review before explaining |
| “I need a doctor for diabetes” | Opens related condition and specialty resources |
| “Add a task” | Captures a reminder and asks you to verify before saving |
| “Read my checklist” / “complete item two” | Reads or manages numbered items |
| “Care assistant” | Asks for your prompt, then reviews it before sending |
| “Confirm” / “change” / “cancel” | Sends, edits, or discards the current review |
| “Settings” / “larger text on” | Opens or updates accessibility preferences |
| “Turn off voice assistant” | Stops normal commands and spoken responses |

Voice input is ignored during spoken replies and a short cooldown to prevent
self-transcription. The microphone stays active through those replies so the
approved session can continue. Turn off both voice assistance and wake listening
to release it. Use **Interrupt / give a command** to stop a reply. Recognition
confidence and relevance checks filter unrelated discussion, and transcripts
clear between commands. Background filtering is best effort; browser speech
recognition cannot reliably separate nearby speakers or guarantee acoustic
noise cancellation. A quiet room or headset can help.

Settings include voice selection and speaking speed, dark mode, larger text,
high contrast, a reading layout for dyslexia, and reduced motion. Available
voices depend on your browser and device. The app saves preferences locally.
Speech recognition varies by browser and generally requires an internet
connection; audio may be processed by the browser's recognition provider.

## Automatic AI connection

The server loads an ignored `.env` file automatically when it starts. Add a
server API key once:

```sh
cp .env.example .env
```

Open `.env` and fill in `OPENAI_API_KEY`, then run `npm start`. There is no need
to export variables on every visit or switch AI on in the website. When the
server has a configured key, the site connects AI automatically. A previously
saved choice to turn AI off is respected; the AI control lets you opt out.
Hosting environment variables take precedence over `.env` values.

A real API key must come from the server operator's OpenAI account; the app
cannot create one automatically. Without a key, or if AI fails, the site uses
its local educational tools and clearly labels that mode. The default model is
`gpt-5.6-terra`; `OPENAI_MODEL` can select another model your account supports.
Keep the key on the server. `.env` files are ignored by Git and are not served
to the browser.

When AI is active, submitting a tool sends the relevant text and context to
OpenAI: notes, questions, selected conditions, and recent chat messages needed
for the answer. Keep identifying details out of your input. Audio is handled
by the browser's speech service and is not sent to this AI endpoint.

The server uses the Responses API with structured output and `store: false`.
It does not save or log submitted medical text. Provider processing still
applies; `store: false` is not a promise of zero provider retention. Requests
have size limits, timeouts, rate limits, and browser origin checks.

Implementation references:

- [Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)

## Care tools

- **Medical decoder:** recognizes a wider glossary, abbreviations and condition
  names. Paste notes or upload/drop a `.txt`, `.md`, or `.csv` file up to 1 MB.
  PDF, images and Word files require copying their text into the notes field.
  Clear notes, try an example, or save follow-up questions to your checklist.
  Unknown inputs receive an explanation of what could and could not be matched.
- **Find a specialist:** search conditions or specialties using aliases,
  common clinician names, and flexible wording; see trusted resources and save
  booking questions. Location input has been removed because the prototype does
  not verify specific local doctors. Resource links do not confirm availability
  or insurance coverage.
- **My care plan:** review checklist templates, choose suggested questions,
  track completion, save an appointment and symptom record, and download a text
  copy to bring to a visit. AI suggestions are reviewed before being added.
- **Care assistant:** explains terms and conditions, helps prepare visits and
  medication reviews, and discusses insurance or accessibility questions.
  Type your own question; presets are optional. Local guidance understands
  everyday symptom wording and follow-up questions about the current topic.
  It asks for clarification when the local library cannot answer, and the chat
  shows whether a reply comes from AI or the local library. A configured AI
  connection is checked before sending the first question.
  With voice on, entering the page prompts for your question and asks you to
  verify it before sending. Save a question to your checklist or clear the
  conversation at any time. It cannot diagnose, prescribe, or assess emergencies.

Profile conditions, checklist items, symptoms, appointment details and
preferences stay in browser storage on that device. Medical notes and chat are
not saved by this app. The browser's speech recognition provider may process
audio; browser voice input is not an offline audio service.

## Policies and data controls

The site footer links to Terms of Use, Privacy Policy, accessibility information,
and help. These describe this prototype's educational role, browser storage,
AI and speech-provider processing, and limitations of external resource links.
Data controls let you remove saved information from this browser. There are no
user accounts, advertising cookies, analytics, or background document uploads.
Downloading a care plan creates a file on your device; clearing browser data
does not delete that downloaded copy.

## Verification

```sh
npm test
```

The dependency-free tests cover voice lifecycle, speaker echo suppression,
wake-only standby, relevance filtering, local medical matching, static asset
delivery, automatic AI connection, environment loading, saved opt-outs, and
server validation. AI tests use a local mock provider and never send medical
data or make paid API requests.

Optional Chromium UI checks require a separately installed Playwright and its
Chromium browser:

```sh
npm run test:browser
npm run test:browser:ai
npm run test:browser:assistant
```

If Playwright is installed outside this project, set `CARE_COMPASS_PLAYWRIGHT`
to its module directory when running those commands. Browser checks use simulated
speech events. The AI browser check intercepts provider responses locally and
verifies all five tool routes, automatic connection, safe text rendering, fallback,
input review, and turning AI off during a request. Test the actual microphone and
audio on your Mac as well.


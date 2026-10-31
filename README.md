# Care Compass · HackGwinnett 6.0

A browser prototype for understanding medical notes, finding specialist
resources, preparing appointments, tracking symptoms, and getting care navigation
guidance. All five sections work with local resources. An optional server-side
OpenAI connection adds natural-language voice intent and personalized educational
guidance across the decoder, specialist finder, care plan, and care assistant.

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

Keep the whole project folder together, including all JavaScript modules.
Opening an HTML-only copy or a preview that does not serve the other files
will lose the formatting and scripts. If you see an unformatted white page,
confirm you are visiting the localhost URL, restart the server, and refresh
with **Command + Shift + R** on a Mac. In Chrome's Network panel, `style.css?v=3`
should return `200` with a `text/css` content type.

The stylesheet uses local system fonts and needs no Google Fonts request.
The local server sends fresh asset headers, and the HTML includes versioned
asset URLs to refresh older cached files.

## Voice assistance

Voice assistance defaults to **off**. The app does not ask for microphone access
or play a greeting on arrival. Use **Voice assistance** to enable it; your saved
choice is respected on later visits. Allow microphone access when the browser
asks. A denial cannot be bypassed; allow the microphone in site settings, then
choose **Retry microphone**.

**Listen for “voice assistant on”** is a separate, optional setting. It requires
microphone permission and keeps recognition active while the assistant is off,
but accepts only wake phrases such as “voice assistant on” or “turn on voice
assistant.” Other speech does not run commands or reach the AI service in that
mode. Uncheck it to stop wake listening and release the microphone when voice
assistance is off.

Examples:

| Say | Result |
| --- | --- |
| “Go to overview / medical decoder / find a specialist / my care plan / care assistant” | Opens the section and guides you through relevant input |
| “Can you take me to my care plan?” / “Help me understand my notes” | Recognizes common alternative phrasing |
| “Decode my notes” | Asks for notes, accepts spoken input, and explains known terms |
| “Find a specialist for POTS” | Selects the condition's public directory |
| “Add a task” | Asks what reminder to add and saves your spoken answer |
| “Read my checklist” / “complete item two” / “remove item three” | Reads or updates numbered checklist items |
| “Ask a question” | Asks for your question and gives local or optional AI guidance |
| “Edit profile” / “remove POTS” / “save profile” | Updates profile conditions |
| “Accessibility settings” / “larger text on” / “higher contrast off” | Changes saved accessibility preferences |
| “Read this page” / “notifications” / “our promise” | Reads content or opens the corresponding feature |
| “Stop speaking” | Interrupts speech and keeps listening |
| “Turn off voice assistant” | Stops speech and regular commands; optional wake listening remains |
| “Cancel” | Cancels the current input |

The microphone pauses while the app speaks and resumes after a short cooldown,
so its own spoken responses do not become commands. Use **Interrupt / give a
command** to stop a spoken response and resume listening. Transcripts clear
between commands. Recognition confidence and website relevance checks ignore
low-confidence speech and unrelated discussion such as Minecraft.

Background filtering is best effort. Browser speech recognition cannot reliably
separate nearby speakers or guarantee acoustic noise cancellation. Use a quiet
room or a headset for better recognition. The app only acts on finalized speech,
and a local phrase parser works without an AI key.
Speech recognition support and microphone behavior vary by browser and platform;
Chrome's recognition service generally also requires an internet connection.
For hosted microphone access, serve the site over HTTPS. Localhost works for local
development. A file picker still requires direct interaction; dictation is the
voice alternative for medical notes.

## Optional AI setup

The website works without a key. To connect AI, set these environment variables
on the machine running `server.js`, then restart the server:

```sh
export OPENAI_API_KEY="your-server-api-key"
export OPENAI_MODEL="gpt-5.6-terra"
npm start
```

`.env.example` is a configuration template; this dependency-free server does not
automatically load `.env` files. Never put a real key into browser JavaScript or
commit it. `.env` files are ignored by Git.

After connecting the server, enable **Use AI tools** in the website. This choice
defaults to off. When enabled, submitted text and relevant context are sent to
OpenAI, including notes, questions, selected conditions, and recent chat messages
needed for the requested tool. Keep identifying details out of your input.
Audio itself is handled by the browser's speech service, not this AI endpoint.

The server uses the Responses API with JSON Schema output and `store: false`.
It does not store or log medical input or expose the API key. Provider processing
still applies; `store: false` is not a promise of zero provider retention.
Requests have size limits, timeouts, per-client rate limits, and browser origin
checks. If AI is unavailable or fails, local tools remain available.

The default model is configurable. Its account availability depends on your
OpenAI access. Official implementation references:

- [Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)

## Care tools

- **Medical decoder:** recognizes a wider glossary, abbreviations and condition
  names. Paste notes or upload/drop a `.txt`, `.md`, or `.csv` file up to 1 MB.
  PDF, images and Word files require copying their text into the notes field.
  Clear notes, try an example, or save follow-up questions to your checklist.
  Unknown inputs receive an explanation of what could and could not be matched.
- **Find a specialist:** search the condition library, see suggested specialties
  and trusted resource links, add a location for map searches, and save booking
  questions. Links are searches and public directories, not verified available
  appointments or insurance matches.
- **My care plan:** review checklist templates, choose suggested questions,
  track completion, save an appointment and symptom record, and download a text
  copy to bring to a visit. AI suggestions are reviewed before being added.
- **Care assistant:** explains terms and conditions, helps prepare visits and
  medication reviews, and discusses insurance or accessibility questions.
  Save a question to your visit checklist or clear the conversation at any time.
  It provides educational guidance, not diagnosis, prescriptions or emergency
  assessment.

Profile conditions, checklist items, symptoms, appointment details and
preferences stay in browser storage on that device. Medical notes and chat are
not saved by this app. The browser's speech recognition provider may process
audio; browser voice input is not an offline audio service.

## Verification

```sh
npm test
```

The dependency-free tests cover voice lifecycle, speaker echo suppression,
wake-only standby, relevance filtering, local medical matching, static asset
delivery, and AI opt-in and server validation. AI tests use a local mock provider
and never send medical data or make paid API requests.

Optional Chromium UI checks require a separately installed Playwright and its
Chromium browser:

```sh
npm run test:browser
npm run test:browser:ai
```

If Playwright is installed outside this project, set `CARE_COMPASS_PLAYWRIGHT`
to its module directory when running those commands. Browser checks use simulated
speech events. The AI browser check intercepts provider responses locally and
verifies all five tool routes, opt-in, safe text rendering, fallback and
turning AI off during a request. Test the actual microphone and audio on your
Mac as well.


# Care Compass · HackGwinnett 6.0

A browser prototype for understanding medical terms, finding public specialist
directories, preparing a visit checklist, and getting care navigation guidance.
The prototype uses **Guest User** and prepared responses, rather than a medical AI service.

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

Keep `index.html`, `style.css`, `app.js`, and `voice-assistant.js` together.
Opening an HTML-only copy or a preview that does not serve the other files
will lose the formatting and scripts. If you see an unformatted white page,
confirm you are visiting the localhost URL, restart the server, and refresh
with **Command + Shift + R** on a Mac. In Chrome's Network panel, `style.css?v=2`
should return `200` with a `text/css` content type.

The stylesheet uses local system fonts and needs no Google Fonts request.
The local server sends fresh asset headers, and the HTML includes versioned
asset URLs to refresh older cached files.

## Voice assistance

Voice assistance defaults to **on** for a new guest and asks for microphone
access. Allow that permission in the browser. Chrome may require a first click
or key press before playing speech. A browser permission denial cannot be
bypassed; allow the microphone in site settings, then choose **Retry microphone**.
A saved choice to turn voice off is respected on later visits.

Examples:

| Say | Result |
| --- | --- |
| “Go to overview / medical decoder / find a specialist / my care plan / care assistant” | Opens the section and guides you through relevant input |
| “Decode my notes” | Asks for notes, accepts spoken input, and explains known terms |
| “Find a specialist for POTS” | Selects the condition's public directory |
| “Add a task” | Asks what reminder to add and saves your spoken answer |
| “Read my checklist” / “complete item two” / “remove item three” | Reads or updates numbered checklist items |
| “Ask a question” | Asks for your question and gives prepared guidance |
| “Edit profile” / “remove POTS” / “save profile” | Updates profile conditions |
| “Accessibility settings” / “larger text on” / “higher contrast off” | Changes saved accessibility preferences |
| “Read this page” / “notifications” / “our promise” | Reads content or opens the corresponding feature |
| “Stop speaking” | Interrupts speech and keeps listening |
| “Turn off voice assistant” | Stops speech and microphone listening |
| “Cancel” | Cancels the current input |

Listening resumes after the browser ends a recognition session. You can speak
over a response to interrupt it, or use **Interrupt / give a command**.
Headphones can help if the microphone hears the site's own speech.
Speech recognition support and microphone behavior vary by browser and platform;
Chrome's recognition service generally also requires an internet connection.
For hosted microphone access, serve the site over HTTPS. Localhost works for local
development. A file picker still requires direct interaction; dictation is the
voice alternative for medical notes.

Profile conditions, checklist items, and preferences stay in browser storage on
that device. Medical notes and chat are not saved by this app. The browser's
speech recognition provider may process audio; browser voice input is not an
offline audio service.

## Verification

```sh
npm test
```

The dependency-free tests cover voice lifecycle, interruption, shutdown,
permission handling, and static asset delivery.

Optional Chromium UI checks require a separately installed Playwright and its
Chromium browser:

```sh
npm run test:browser
```

If Playwright is installed outside this project, set `CARE_COMPASS_PLAYWRIGHT`
to its module directory when running that command. Browser checks use simulated
speech events. Test the actual microphone and audio on your Mac as well.


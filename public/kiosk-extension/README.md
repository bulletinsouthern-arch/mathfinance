# Math & Finance Kiosk

Our Chrome Manifest V3 extension opens a fullscreen dashboard and uses the live Math & Finance website for account login, courses, exams, quizzes, and saved results. No separate account or copy of course data is needed. Progress is sent from the website to the extension while an assessment is active. Admin results and deletion controls remain on the website.

## Install

1. Download mathfinance-kiosk.zip from an assessment page and extract it.
2. Open chrome://extensions in desktop Chrome and enable Developer mode.
3. Click Load unpacked and select the extracted folder containing manifest.json.
4. Pin Math & Finance Kiosk, then click its toolbar icon.
5. Choose Open my courses. Sign in on the website and choose an assessment.
6. Reload any website tabs opened before installation. Click Check kiosk connection, enable your webcam/microphone, then start in full screen.

Only https://mathfinance.netlify.app and https://main--mathfinance.netlify.app are supported. Other domains need a reviewed change to host_permissions, content_scripts matches, and the background origin allowlist. The package is not a Chrome Web Store listing; Chrome requires manual installation or managed administrator deployment.

## During an assessment

The website requires the extension handshake before the normal start flow. The extension focuses the assessment tab and redirects navigation back to its assessment URL. The website's camera, microphone, fullscreen and departure rules still apply. The dashboard receives only title, answered count and total count, never answers, student identities, passwords, camera or microphone. Current browser session metadata is temporary in chrome.storage.session; saved results remain in the website database. Nothing is sent to third-party servers by the extension.

After the website saves a result it sends FINISH, releasing focus controls. If saving fails, retry submission; if release fails, use Finish kiosk session after reconnecting the extension. On reload or browser restart, an interrupted website attempt requires administrator-approved retake. Chrome restart clears extension session state. Closing the exam tab clears focus controls to avoid trapping the browser; it does not grant another attempt.

## Proctor recovery and limits

This is browser focus assistance, not an unexitable device lock. Escape, F11, Chrome shutdown, removing extensions and OS shortcuts remain browser/device controls. For device-level restrictions, administrators must configure managed Chrome and operating-system kiosk policies. The website bridge is not tamper-proof device attestation, and modified clients can imitate it. The main website remains responsible for authentication, authorization, attempt eligibility and grading.

If a page becomes unresponsive, a proctor can disable the extension from chrome://extensions or close Chrome. Re-enable it and reload the website before a new attempt. Never share administrator credentials with students.

## Source

manifest.json: Chrome MV3 configuration. background.js: dashboard launcher and focus session. content.js: restricted website bridge. dashboard.html/css/js: local extension UI. No remote scripts, build step or extra dependencies.

After editing source files, regenerate the downloadable package with `python3 scripts/package-kiosk.py`. Keep the ZIP and source together in each release.

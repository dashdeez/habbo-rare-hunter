# Bi0z Rare Hunter
Web-based Habbo username checker.

## Deploy on Render
1. Push this folder to a GitHub repository.
2. In Render choose New > Web Service and connect the repository (or use the included `render.yaml`).
3. Build: `pip install -r requirements.txt`
4. Start: `gunicorn app:app`

The app deliberately labels a missing public Habbo profile as **unverified**, not guaranteed available.

## Runtime behavior and tests

Hunts use at most five shared lookup workers and return within a 20-second
lookup budget, below Gunicorn's default 30-second timeout. Unfinished checks
are marked `unknown` with a retry explanation; they are never called available.
Habbo may also rate-limit checks, which is reported as `unknown`.
API input/server errors return JSON. The browser also handles HTML, empty,
malformed, and failed responses from hosting proxies without losing prior results.

Run backend regression tests with `python -m unittest discover -s tests -v`.
With Playwright installed (`npm install --no-save playwright` and
`npx playwright install webkit`), start the app on port 8765 using
`gunicorn app:app --bind 127.0.0.1:8765`, then run `node tests/browser.cjs`.
The browser test defaults to WebKit; set `BROWSER=chromium` for Chromium or
`TEST_URL` for a different test server.

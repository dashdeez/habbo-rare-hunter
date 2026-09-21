# Bi0z Rare Hunter
Web-based Habbo username checker.

## Deploy on Render
1. Push this folder to a GitHub repository.
2. In Render choose New > Web Service and connect the repository (or use the included `render.yaml`).
3. Build: `pip install -r requirements.txt`
4. Start: `gunicorn app:app`

The app deliberately labels a missing public Habbo profile as **unverified**, not guaranteed available.

## Runtime behavior and tests

The browser generates candidates with `POST /api/hunt` and `generate_only: true`,
then checks one name at a time through `/api/check`, showing progress as results
arrive. Large hunts take longer but no longer have to fit in one web request.
PAUSE and RESUME keep the remaining queue in the current page (refreshing loses it).

One shared lookup worker spaces outbound requests at least 1.5 seconds apart.
Habbo HTTP 429 responses pause all new lookups for at least 60 seconds, respecting
longer Retry-After values. The page stops and offers Resume after the countdown.
Only found/missing profiles are cached; rate limits and transient failures are not.
The legacy bulk API retains a 20-second safety budget and may return unfinished
checks as unknown; browser hunts do not use that bulk path.

API errors return JSON; the page also handles failed or non-JSON proxy responses
and preserves its queue for Resume. HTML is not cached and the script URL has a
content version so refreshing loads the deployed client.

Run backend regression tests with `python -m unittest discover -s tests -v`.
Run JavaScript regression tests with `node tests/frontend.cjs`.
With Playwright installed (`npm install --no-save playwright` and
`npx playwright install webkit`), start the app on port 8765 using
`gunicorn app:app --bind 127.0.0.1:8765`, then run `node tests/browser.cjs`.
The browser test defaults to WebKit; set `BROWSER=chromium` for Chromium or
`TEST_URL` for a different test server.

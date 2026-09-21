// Run with Node and Playwright available: node tests/browser.cjs
const playwright = require('playwright');
const engine = process.env.BROWSER || 'webkit';
const assert = require('node:assert/strict');
(async () => {
    const browser = await playwright[engine].launch({headless: true, ...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const alerts = [];
        page.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.accept(); });
        await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765');
        // Reproduce the misleading parser message against the original HTML error.
        console.log(engine + ' original JSON error:', await page.evaluate(() => {
            try { JSON.parse('<html><h1>Internal Server Error</h1></html>'); }
            catch (error) { return error.message; }
        }));
        let requested;
        await page.route('**/api/hunt', async route => {
            requested = route.request();
            await route.fulfill({json: {results: [{name:'ace', kind:'word', score:100, status:'taken', detail:'Found'}]}});
        });
        await page.evaluate(() => {
            const base = document.createElement('base');
            base.href = 'https://example.org/unrelated/'; document.head.append(base);
        });
        await page.click('#hunt');
        await page.waitForFunction(() => document.querySelector('#total').textContent === '1');
        assert.equal(new URL(requested.url()).pathname, '/api/hunt');
        assert.deepEqual(requested.postDataJSON(), {categories:['words','names','three','four','clean'],limit:100,minimum:60});
        assert.equal(alerts.length, 0);
        for (const failure of [
            {status:500,contentType:'text/html',body:'<h1>Internal Server Error</h1>',expected:/HTTP 500.*non-JSON/},
            {status:502,contentType:'text/plain',body:'Bad Gateway',expected:/HTTP 502.*non-JSON/},
            {status:503,contentType:'text/plain',body:'',expected:/HTTP 503.*empty response/},
            {status:400,contentType:'application/json',body:'{"error":"limit must be an integer"}',expected:/HTTP 400: limit must be an integer/},
            {status:200,contentType:'application/json',body:'{}',expected:/missing a results list/},
            {status:200,contentType:'application/json',body:'broken',expected:/HTTP 200.*non-JSON/}
        ]) {
            await page.unroute('**/api/hunt');
            await page.route('**/api/hunt', route => route.fulfill({status:failure.status,contentType:failure.contentType,body:failure.body}));
            await page.click('#hunt');
            await page.waitForFunction(() => !document.querySelector('#hunt').disabled);
            assert.match(alerts.pop(), failure.expected);
            assert.equal(await page.locator('#total').textContent(), '1');
        }
        await page.unroute('**/api/hunt');
        await page.route('**/api/hunt', route => route.abort());
        await page.click('#hunt');
        await page.waitForFunction(() => !document.querySelector('#hunt').disabled);
        assert.match(alerts.pop(), /Could not reach the server/);
        await page.route('**/api/check', route => route.fulfill({json:{results:[]}}));
        await page.locator('summary').click();
        await page.fill('#names', 'ace');
        await page.click('#check');
        await page.waitForFunction(() => document.querySelector('#total').textContent === '0');
        assert.deepEqual(errors, []);
        console.log(engine + ' START HUNT, manual check, URL construction, HTTP/JSON/network errors, result preservation and button recovery: PASS');
    } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});

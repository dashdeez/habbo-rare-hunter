// Requires a running server, Node and Playwright. Defaults to WebKit.
const playwright=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
    const browser=await playwright[process.env.BROWSER||'webkit'].launch({headless:true});
    try {
        const page=await browser.newPage();
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(process.env.TEST_URL||'http://127.0.0.1:8765');
        const candidates=Array.from({length:100},(_,i)=>({name:`name${i}`,kind:'word',score:90}));
        await page.route('**/api/hunt',async route=>{
            assert.equal(route.request().postDataJSON().generate_only,true);
            await route.fulfill({json:{results:candidates}});
        });
        let checks=0, rateLimit=true;
        await page.route('**/api/check',async route=>{
            const names=route.request().postDataJSON().names;
            assert.equal(names.length,1);checks++;
            await route.fulfill({json:{results:[rateLimit?{name:names[0],status:'unknown',retry_after:1}:{name:names[0],kind:'manual',score:50,status:'unverified',detail:'No public profile'}]}});
        });
        await page.click('#hunt');
        await page.waitForFunction(()=>document.querySelector('#progress').textContent.includes('rate limit'));
        assert.equal(checks,1);
        rateLimit=false;
        await page.click('#resume');
        await page.waitForFunction(()=>document.querySelector('#total').textContent==='100');
        assert.equal(checks,101);
        assert.match(await page.locator('#progress').textContent(),/Finished: 100/);
        assert.match(await page.locator('#results').textContent(),/word/);
        await page.unroute('**/api/check');
        await page.route('**/api/check',route=>route.fulfill({status:502,contentType:'text/html',body:'<h1>Bad Gateway</h1>'}));
        await page.click('#hunt');
        await page.waitForFunction(()=>document.querySelector('#progress').textContent.includes('HTTP 502'));
        assert.equal(await page.locator('#resume').isVisible(),true);
        assert.deepEqual(errors,[]);
        console.log('PASS: browser batching, rate-limit pause/resume, 100 results, gateway recovery');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

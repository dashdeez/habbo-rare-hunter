const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const elements = new Map();
const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {value:'',textContent:'',disabled:false,innerHTML:'',hidden:false});
    return elements.get(selector);
};
let response, requests=[], now=0;
const context = vm.createContext({URL,JSON,console,Date:{now:()=>now},setTimeout:()=>1,clearTimeout:()=>{},
    window:{location:{href:'https://bi0z-rare-hunter.onrender.com/?source=test'}},
    document:{querySelector:element,querySelectorAll:()=>['words','names','three','four','clean'].map(value=>({value}))},
    fetch:async(url,options)=>{
        const body=JSON.parse(options.body);requests.push({url,body});
        if(response instanceof Error)throw response;
        return typeof response==='function'?response(url,body):response;
    }
});
vm.runInContext(fs.readFileSync('static/app.js','utf8'),context);
function reply(status,body,type='application/json') {
    return {status,ok:status>=200&&status<300,statusText:'Server error',text:async()=>body,headers:{get:()=>type}};
}
const json = obj=>reply(200,JSON.stringify(obj));
const candidates=Array.from({length:100},(_,i)=>({name:`name${i}`,kind:'word',score:90}));
const result=name=>({name,kind:'manual',score:50,status:name==='name0'?'taken':'unverified',detail:'Checked'});
(async()=>{
    element('#limit').value='100';element('#minimum').value='60';
    response=(url,body)=>url.endsWith('/api/hunt')?json({results:candidates}):json({results:[result(body.names[0])]});
    await element('#hunt').onclick();
    assert.equal(requests.length,101);
    assert.deepEqual(requests[0].body,{categories:['words','names','three','four','clean'],limit:100,minimum:60,generate_only:true});
    assert.equal(requests[0].url,'https://bi0z-rare-hunter.onrender.com/api/hunt');
    assert.ok(requests.slice(1).every(r=>r.body.names.length===1));
    assert.equal(element('#total').textContent,100);
    assert.doesNotMatch(element('#results').innerHTML,/>name0</);
    assert.match(element('#results').innerHTML,/>word</);
    assert.match(element('#progress').textContent,/Finished: 100/);
    // Stop at a rate limit without consuming the failed name, then resume it.
    let attempts=0;
    response=(url,body)=>url.endsWith('/api/hunt')?json({results:candidates.slice(0,3)}):json({results:[++attempts===2?{name:body.names[0],status:'unknown',retry_after:60}:result(body.names[0])]});
    await element('#hunt').onclick();
    assert.equal(attempts,2);assert.equal(element('#total').textContent,1);
    assert.match(element('#progress').textContent,/rate limit/);
    assert.equal(element('#resume').disabled,true);
    await element('#resume').onclick();assert.equal(attempts,2);
    now=61000;
    await element('#resume').onclick();
    assert.equal(element('#total').textContent,3);assert.equal(attempts,4);
    // Pause and retain all pending names on failed hosting/network responses.
    for(const failure of [
        reply(500,'<h1>Error</h1>','text/html'),reply(502,'Bad Gateway','text/plain'),
        reply(503,'','text/plain'),reply(400,'{"error":"invalid request"}'),
        reply(200,'{}'),reply(200,'broken'),new Error('Network failure')
    ]) {
        response=(url,body)=>{
            if(url.endsWith('/api/hunt'))return json({results:candidates.slice(0,1)});
            if(failure instanceof Error)throw failure;
            return failure;
        };
        await element('#hunt').onclick();
        assert.match(element('#progress').textContent,/Paused:/);
        assert.equal(element('#hunt').disabled,false);
        assert.equal(element('#resume').hidden,false);
        response=(url,body)=>json({results:[result(body.names[0])]});
        await element('#resume').onclick();assert.equal(element('#total').textContent,1);
    }
    // User pause keeps the remainder; manual checking uses the same small requests.
    response=(url,body)=>{
        if(url.endsWith('/api/hunt'))return json({results:candidates.slice(0,3)});
        element('#pause').onclick();return json({results:[result(body.names[0])]});
    };
    await element('#hunt').onclick();assert.equal(element('#total').textContent,1);
    assert.match(element('#progress').textContent,/Paused: 1 checked; 2/);
    response=(url,body)=>json({results:[result(body.names[0])]});
    element('#names').value='ace, ACE\nfoo';await element('#check').onclick();
    assert.equal(element('#total').textContent,2);
    console.log('PASS: 100-name batching, rate-limit cooldown/resume, no lost names, HTTP/JSON/network recovery, user pause, manual checks');
})().catch(error=>{console.error(error);process.exitCode=1;});

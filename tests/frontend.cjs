const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const elements = new Map();
const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {value:'',textContent:'START HUNT',disabled:false,innerHTML:''});
    return elements.get(selector);
};
const alerts = [];
let response;
let request;
const context = vm.createContext({URL,JSON,console,
    window:{location:{href:'https://bi0z-rare-hunter.onrender.com/?source=test'}},
    document:{querySelector:element,querySelectorAll:()=>['words','names','three','four','clean'].map(value=>({value}))},
    alert:message=>alerts.push(message),
    fetch:async (url,options)=>{request={url,options};if(response instanceof Error)throw response;return response;}
});
vm.runInContext(fs.readFileSync('static/app.js','utf8'),context);
function reply(status,body,type='application/json') {
    response={status,ok:status>=200&&status<300,statusText:'Server error',text:async()=>body,headers:{get:()=>type}};
}
(async()=>{
    element('#limit').value='100';element('#minimum').value='60';
    reply(200,JSON.stringify({results:[{name:'ace',kind:'word',score:100,status:'taken',detail:'Found'}]}));
    await element('#hunt').onclick();
    assert.equal(request.url,'https://bi0z-rare-hunter.onrender.com/api/hunt');
    assert.deepEqual(JSON.parse(request.options.body),{categories:['words','names','three','four','clean'],limit:100,minimum:60});
    assert.equal(element('#total').textContent,1);
    for(const [status,body,type,pattern] of [
        [500,'<h1>Internal Server Error</h1>','text/html',/HTTP 500.*non-JSON/],
        [502,'Bad Gateway','text/plain',/HTTP 502.*non-JSON/],
        [503,'','text/plain',/HTTP 503.*empty response/],
        [400,'{"error":"limit must be an integer"}','application/json',/HTTP 400: limit must be an integer/],
        [200,'{}','application/json',/missing a results list/],
        [200,'null','application/json',/missing a results list/],
        [200,'bad','application/json',/HTTP 200.*non-JSON/]
    ]) {
        reply(status,body,type);await element('#hunt').onclick();
        assert.match(alerts.pop(),pattern);
        assert.equal(element('#hunt').disabled,false);
        assert.equal(element('#hunt').textContent,'START HUNT');
        assert.equal(element('#total').textContent,1);
    }
    response=new Error('The string did not match the expected pattern.');
    await element('#hunt').onclick();assert.match(alerts.pop(),/Could not reach the server/);
    reply(200,'{"results":[]}');await element('#check').onclick();
    assert.equal(request.url,'https://bi0z-rare-hunter.onrender.com/api/check');
    assert.equal(element('#total').textContent,0);
    assert.equal(alerts.length,0);
    console.log('Frontend: hunt payload, absolute URL, manual check, HTTP/JSON/network failures, preserved results, and button recovery PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});

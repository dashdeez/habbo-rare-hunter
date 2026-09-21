let data=[];const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const notTaken = () => data.filter(x => x.status !== 'taken');
function render(){let q=$('#filter').value.toLowerCase();let rows=notTaken().filter(x=>x.name.toLowerCase().includes(q));$('#results').innerHTML=rows.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.kind)}</td><td><span class="status ${x.status}">${esc(x.status.toUpperCase())}</span></td><td>${x.score}</td><td class="detail">${esc(x.detail||'')}</td></tr>`).join('');$('#total').textContent=data.length;$('#unverified').textContent=data.filter(x=>x.status==='unverified').length;$('#taken').textContent=data.filter(x=>x.status==='taken').length;$('#unknown').textContent=data.filter(x=>!['taken','unverified'].includes(x.status)).length}
async function requestJSON(path, body) {
    // Use the page URL, not document.baseURI (which a <base> tag can change).
    let url;
    try { url = new URL(path, window.location.href); }
    catch (error) { throw new Error('Could not build the request URL. Open this app from its Render address.'); }
    let response;
    try {
        response = await fetch(url.href, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
            body: JSON.stringify(body)
        });
    } catch (error) {
        throw new Error('Could not reach the server. Check your connection and try again.');
    }
    let text;
    try { text = await response.text(); }
    catch (error) { throw new Error(`HTTP ${response.status}: response was interrupted. Please resume the check.`); }
    let payload;
    try {
        payload = JSON.parse(text);
    } catch (error) {
        const type = response.headers.get('content-type') || 'unknown content type';
        throw new Error(`HTTP ${response.status}: server returned ${text.trim() ? 'non-JSON' : 'an empty response'} (${type}). It may be restarting or timed out; please try again.`);
    }
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${payload && typeof payload.error === 'string' ? payload.error : response.statusText || 'Server request failed'}`);
    }
    if (!payload || !Array.isArray(payload.results)) {
        throw new Error(`HTTP ${response.status}: server response is missing a results list.`);
    }
    return payload;
}
let queue = [], running = false, paused = false, resumeAt = 0, resumeTimer;
const progress = message => { $('#progress').textContent = message; };
function controls(busy) {
    running = busy;
    $('#hunt').disabled = busy;
    $('#check').disabled = busy;
    $('#pause').hidden = !busy;
    $('#resume').hidden = busy || queue.length === 0;
}
function offerResume() {
    clearTimeout(resumeTimer);
    const seconds = Math.max(0, Math.ceil((resumeAt - Date.now()) / 1000));
    $('#resume').disabled = seconds > 0;
    $('#resume').textContent = seconds ? `RESUME IN ${seconds}s` : 'RESUME';
    if (seconds) resumeTimer = setTimeout(offerResume, 1000);
}
async function drainQueue() {
    controls(true);
    paused = false;
    try {
        while (queue.length && !paused) {
            const candidate = queue[0];
            progress(`Checked ${data.length}. Checking ${candidate.name}… ${queue.length} remaining.`);
            // One name per request keeps every check well below the hosting timeout.
            const payload = await requestJSON('/api/check', {names:[candidate.name]});
            const result = payload.results[0];
            if (!result || result.name.toLowerCase() !== candidate.name.toLowerCase()) {
                throw new Error('Server returned an unexpected name. Please resume.');
            }
            if (result.retry_after) {
                resumeAt = Date.now() + result.retry_after * 1000;
                progress(`Paused: Habbo rate limit. ${data.length} checked; ${queue.length} still queued. Resume after the countdown.`);
                break;
            }
            data.push({...result, kind:candidate.kind || result.kind, score:candidate.score ?? result.score});
            queue.shift();
            render();
        }
        if (!queue.length) progress(`Finished: ${data.length} checked. UNKNOWN results could not be verified.`);
        else if (paused) progress(`Paused: ${data.length} checked; ${queue.length} still queued.`);
    } catch (error) {
        progress(`Paused: ${error.message} Your results and remaining names are kept. Click RESUME to retry.`);
    } finally {
        controls(false);
        offerResume();
    }
}
async function startHunt() {
    if (running) return;
    controls(true);
    progress('Generating names…');
    try {
        const payload = await requestJSON('/api/hunt', {
            categories:[...document.querySelectorAll('.checks input:checked')].map(x=>x.value),
            limit:+$('#limit').value, minimum:+$('#minimum').value, generate_only:true
        });
        queue = payload.results;
        data = [];
        render();
    } catch (error) {
        progress(`Request failed: ${error.message}`);
        controls(false);
        return;
    }
    if (Date.now() < resumeAt) {
        progress('Habbo cooldown is still active. Resume after the countdown.');
        controls(false); offerResume(); return;
    }
    await drainQueue();
}
$('#hunt').onclick = startHunt;
$('#pause').onclick = () => { paused = true; progress('Pausing after the current check…'); };
$('#resume').onclick = () => { if (!running && Date.now() >= resumeAt) return drainQueue(); };
$('#check').onclick = async () => {
    if (running) return;
    const names = [...new Set($('#names').value.split(/[\s,]+/).filter(Boolean).map(name=>name.toLowerCase()))].slice(0,100);
    queue = names.map(name=>({name})); data=[]; render();
    if (Date.now() < resumeAt) {
        progress('Habbo cooldown is still active. Resume after the countdown.');
        controls(false); offerResume(); return;
    }
    await drainQueue();
};
$('#filter').oninput=render;
$('#export').onclick=()=>{let rows=[['Username','Type','Status','Score','Detail'],...notTaken().map(x=>[x.name,x.kind,x.status,x.score,x.detail||''])];let csv=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='bi0z-rare-hunt.csv';a.click()};
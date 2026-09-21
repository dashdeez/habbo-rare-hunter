let data=[];const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(){let q=$('#filter').value.toLowerCase();let rows=data.filter(x=>x.name.toLowerCase().includes(q));$('#results').innerHTML=rows.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.kind)}</td><td><span class="status ${x.status}">${esc(x.status.toUpperCase())}</span></td><td>${x.score}</td><td class="detail">${esc(x.detail||'')}</td></tr>`).join('');$('#total').textContent=data.length;$('#unverified').textContent=data.filter(x=>x.status==='unverified').length;$('#taken').textContent=data.filter(x=>x.status==='taken').length;$('#unknown').textContent=data.filter(x=>!['taken','unverified'].includes(x.status)).length}
async function requestJSON(path, body) {
    // Use the page URL, not document.baseURI (which a <base> tag can change).
    const url = new URL(path, window.location.href);
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
    const text = await response.text();
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
async function run(url, body, button) {
    button.disabled = true;
    const old = button.textContent;
    button.textContent = 'HUNTING…';
    try {
        const payload = await requestJSON(url, body);
        data = payload.results;
        render();
    } catch (error) {
        alert('Request failed: ' + error.message);
    } finally {
        button.disabled = false;
        button.textContent = old;
    }
}
$('#hunt').onclick=()=>run('/api/hunt',{categories:[...document.querySelectorAll('.checks input:checked')].map(x=>x.value),limit:+$('#limit').value,minimum:+$('#minimum').value},$('#hunt'));
$('#check').onclick=()=>run('/api/check',{names:$('#names').value},$('#check'));$('#filter').oninput=render;
$('#export').onclick=()=>{let rows=[['Username','Type','Status','Score','Detail'],...data.map(x=>[x.name,x.kind,x.status,x.score,x.detail||''])];let csv=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='bi0z-rare-hunt.csv';a.click()};
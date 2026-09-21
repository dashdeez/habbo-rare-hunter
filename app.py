from flask import Flask, render_template, request, jsonify
import requests, re, time
from functools import lru_cache

app=Flask(__name__)
API='https://www.habbo.com/api/public/users'
VALID=re.compile(r'^[A-Za-z0-9._-]{2,15}$')

@lru_cache(maxsize=5000)
def lookup_cached(name, bucket):
    try:
        r=requests.get(API, params={'name':name}, timeout=8, headers={'User-Agent':'Bi0zRareHunter/1.0'})
        if r.status_code==200:
            d=r.json(); return {'name':name,'status':'taken','profile':{'name':d.get('name'),'motto':d.get('motto',''),'uniqueId':d.get('uniqueId')}}
        if r.status_code==404: return {'name':name,'status':'candidate'}
        if r.status_code==429: return {'name':name,'status':'unknown','detail':'rate limited'}
        return {'name':name,'status':'unknown','detail':f'HTTP {r.status_code}'}
    except requests.RequestException:
        return {'name':name,'status':'unknown','detail':'request failed'}

def rarity(name):
    n=len(name); score=max(0,100-(n-2)*12)
    if re.fullmatch(r'[A-Za-z]+',name): score+=8
    if re.search(r'[._-]',name): score-=8
    if re.search(r'\d',name): score-=5
    return max(0,min(100,score))

@app.get('/')
def home(): return render_template('index.html')

@app.post('/api/check')
def check():
    data=request.get_json(silent=True) or {}; raw=data.get('names',[])
    if isinstance(raw,str): raw=re.split(r'[\s,]+',raw)
    names=[]
    for x in raw[:100]:
        x=str(x).strip()
        if x and x.lower() not in [v.lower() for v in names]: names.append(x)
    out=[]; bucket=int(time.time()//300)
    for name in names:
        if not VALID.fullmatch(name): out.append({'name':name,'status':'invalid','score':0}); continue
        item=lookup_cached(name.lower(),bucket).copy(); item['name']=name; item['score']=rarity(name); out.append(item)
        time.sleep(.08)
    return jsonify({'results':out,'note':'Candidate means no public profile was found; it does not guarantee Habbo will allow registration.'})

@app.get('/health')
def health(): return {'ok':True}

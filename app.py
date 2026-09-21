from flask import Flask, render_template, request, jsonify
import requests, re, time, random
from functools import lru_cache

app=Flask(__name__)
API='https://www.habbo.com/api/public/users'
VALID=re.compile(r'^[A-Za-z0-9._-]{2,15}$')
WORDS='ace amber angel aqua aura blaze bloom blue bolt breeze brick calm cedar charm cloud coral crow dawn dream dusk echo ember frost glow gold haze ivy jade jazz jinx joy kite lake leaf light lime luna mist moss muse nova ocean olive onyx pearl pine pixel plum rain raven reef rose ruby sage silk sky snow solar spark star stone storm tide true velvet vibe violet wave wild wolf zen'.split()
NAMES='adam alex aria asher ava ben blake cole dean drew eli ella emma eric evan finn grace ivy jack jade james jay jude kai leo liam lily luca luke maya mia mila nico noah oliver owen remy ryan sara theo zane zoe'.split()
C='bcdfghjklmnprstvwz'; V='aeiou'

def rarity(n):
    s=max(0,100-(len(n)-2)*10)
    if n.isalpha(): s+=10
    if len(set(n.lower()))==len(n): s+=4
    if re.search(r'[._-]',n): s-=10
    if re.search(r'\d',n): s-=7
    return max(0,min(100,s))

def pronounceable(length):
    start=random.choice([0,1])
    return ''.join(random.choice(V if (i+start)%2 else C) for i in range(length))

def generate(categories, limit, minimum):
    pool=[]
    if 'words' in categories: pool += [(x,'word') for x in WORDS]
    if 'names' in categories: pool += [(x,'name') for x in NAMES]
    if 'three' in categories:
        pool += [(pronounceable(3),'3-char') for _ in range(max(limit*2,120))]
    if 'four' in categories:
        pool += [(pronounceable(4),'4-char') for _ in range(max(limit*2,120))]
    if 'clean' in categories:
        pool += [(pronounceable(random.choice([4,5,6])),'pronounceable') for _ in range(max(limit*2,150))]
    seen=set(); out=[]
    random.shuffle(pool)
    for name,kind in pool:
        key=name.lower()
        if key in seen or not VALID.fullmatch(name): continue
        seen.add(key); score=rarity(name)
        if score>=minimum: out.append({'name':name,'kind':kind,'score':score})
    out.sort(key=lambda x:(-x['score'],len(x['name']),x['name']))
    return out[:limit]

@lru_cache(maxsize=10000)
def lookup_cached(name,bucket):
    try:
        r=requests.get(API,params={'name':name},timeout=8,headers={'User-Agent':'Bi0zRareHunter/2.0'})
        if r.status_code==200:
            d=r.json()
            return {'status':'taken','detail':'Public Habbo profile found','profile':{'name':d.get('name'),'motto':d.get('motto',''),'uniqueId':d.get('uniqueId')}}
        if r.status_code==404:
            return {'status':'unverified','detail':'No public profile found. This can also mean banned/reserved/invisible; registration is not guaranteed.'}
        if r.status_code==429: return {'status':'unknown','detail':'Habbo rate limited this check'}
        return {'status':'unknown','detail':f'Habbo returned HTTP {r.status_code}'}
    except requests.RequestException:
        return {'status':'unknown','detail':'Habbo request failed'}

def check_names(items):
    out=[]; bucket=int(time.time()//600)
    for item in items:
        name=item['name']
        if not VALID.fullmatch(name):
            out.append({**item,'status':'invalid','detail':'Invalid format'}); continue
        result=lookup_cached(name.lower(),bucket).copy()
        out.append({**item,**result})
        time.sleep(.12)
    return out

@app.get('/')
def home(): return render_template('index.html')

@app.post('/api/hunt')
def hunt():
    d=request.get_json(silent=True) or {}
    cats=d.get('categories') or ['words','names','three','four','clean']
    limit=max(10,min(int(d.get('limit',100)),250))
    minimum=max(0,min(int(d.get('minimum',60)),100))
    candidates=generate(cats,limit,minimum)
    return jsonify({'results':check_names(candidates),'generated':len(candidates),'note':'UNVERIFIED means no public profile was found. Banned, reserved or otherwise invisible names can look the same, so it is not proof the name can be registered.'})

@app.post('/api/check')
def check():
    d=request.get_json(silent=True) or {}; raw=d.get('names',[])
    if isinstance(raw,str): raw=re.split(r'[\s,]+',raw)
    seen=set(); items=[]
    for x in raw[:100]:
        x=str(x).strip()
        if x and x.lower() not in seen:
            seen.add(x.lower()); items.append({'name':x,'kind':'manual','score':rarity(x)})
    return jsonify({'results':check_names(items)})

@app.get('/health')
def health(): return {'ok':True}

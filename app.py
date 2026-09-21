from flask import Flask, render_template, request, jsonify
import requests, re, time, random
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor, wait
from werkzeug.exceptions import HTTPException, BadRequest

app=Flask(__name__)
# Return before Gunicorn's default 30-second worker timeout, even if Habbo stalls.
app.config['CHECK_TIMEOUT'] = 20
LOOKUP_POOL = ThreadPoolExecutor(max_workers=5)
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
            try:
                d=r.json()
            except ValueError:
                return {'status':'unknown','detail':'Habbo returned invalid JSON'}
            if not isinstance(d,dict) or not d.get('name'):
                return {'status':'unknown','detail':'Habbo returned an invalid profile'}
            return {'status':'taken','detail':'Public Habbo profile found','profile':{'name':d.get('name'),'motto':d.get('motto',''),'uniqueId':d.get('uniqueId')}}
        if r.status_code==404:
            return {'status':'unverified','detail':'No public profile found. This can also mean banned/reserved/invisible; registration is not guaranteed.'}
        if r.status_code==429: return {'status':'unknown','detail':'Habbo rate limited this check'}
        return {'status':'unknown','detail':f'Habbo returned HTTP {r.status_code}'}
    except requests.RequestException:
        return {'status':'unknown','detail':'Habbo request failed'}

def check_names(items):
    bucket=int(time.time()//600)
    pending=[]
    for item in items:
        name=item['name']
        if not VALID.fullmatch(name):
            pending.append(None)
        else:
            pending.append(LOOKUP_POOL.submit(lookup_paced,name.lower(),bucket))
    futures=[f for f in pending if f is not None]
    done,_=wait(futures,timeout=app.config['CHECK_TIMEOUT'])
    out=[]
    for item,future in zip(items,pending):
        if future is None:
            result={'status':'invalid','detail':'Invalid format'}
        elif future in done:
            result=future.result()
        else:
            future.cancel()
            result={'status':'unknown','detail':'Check timed out before completion. Try this name again.'}
        out.append({**item,**result})
    return out

def lookup_paced(name,bucket):
    try:
        return lookup_cached(name,bucket)
    finally:
        time.sleep(.12)

def json_body():
    d=request.get_json()
    if not isinstance(d,dict):
        raise BadRequest('Request body must be a JSON object')
    return d

def integer_option(d,key,default,low,high):
    value=d.get(key,default)
    if isinstance(value,bool) or not isinstance(value,(int,str)):
        raise BadRequest(f'{key} must be an integer')
    try:
        return max(low,min(int(value),high))
    except (ValueError,TypeError):
        raise BadRequest(f'{key} must be an integer')

@app.errorhandler(HTTPException)
def http_error(error):
    if request.path.startswith('/api/'):
        return jsonify(error=error.description),error.code
    return error

@app.errorhandler(500)
def server_error(error):
    if request.path.startswith('/api/'):
        return jsonify(error='An unexpected server error occurred. Please try again.'),500
    return error

@app.get('/')
def home(): return render_template('index.html')

@app.post('/api/hunt')
def hunt():
    d=json_body()
    cats=d.get('categories') or ['words','names','three','four','clean']
    if not isinstance(cats,list) or any(not isinstance(c,str) or c not in {'words','names','three','four','clean'} for c in cats):
        raise BadRequest('categories must be a list of words, names, three, four, clean')
    limit=integer_option(d,'limit',100,10,250)
    minimum=integer_option(d,'minimum',60,0,100)
    candidates=generate(cats,limit,minimum)
    return jsonify({'results':check_names(candidates),'generated':len(candidates),'note':'UNVERIFIED means no public profile was found. Banned, reserved or otherwise invisible names can look the same, so it is not proof the name can be registered.'})

@app.post('/api/check')
def check():
    d=json_body(); raw=d.get('names',[])
    if isinstance(raw,str): raw=re.split(r'[\s,]+',raw)
    if not isinstance(raw,list): raise BadRequest('names must be text or a list')
    seen=set(); items=[]
    for x in raw[:100]:
        x=str(x).strip()
        if x and x.lower() not in seen:
            seen.add(x.lower()); items.append({'name':x,'kind':'manual','score':rarity(x)})
    return jsonify({'results':check_names(items)})

@app.get('/health')
def health(): return {'ok':True}

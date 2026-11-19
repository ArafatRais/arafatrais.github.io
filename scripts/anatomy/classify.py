import csv,collections,glob,re,os,json,sys
D=sys.argv[1]
par=collections.defaultdict(set); name={}
for fn in ('partof_inclusion_relation_list.txt','isa_inclusion_relation_list.txt'):
  for r in list(csv.reader(open(D+'/'+fn),delimiter='\t'))[1:]:
    par[r[2]].add(r[0]); name[r[0]]=r[1]; name[r[2]]=r[3]
def anc(c,seen=None):
    seen=seen or set()
    for p in par.get(c,()):
        if p not in seen: seen.add(p); anc(p,seen)
    return seen
els=[]
for f in glob.glob(D+'/raw/partof_BP3D_4.0_obj_99/*.obj'):
    h={}; nf=0
    with open(f) as fh:
        for line in fh:
            if line.startswith('# ') and ' : ' in line:
                k,v=line[2:].split(' : ',1); h[k.strip()]=v.strip()
            elif line.startswith('f '): nf+=1
    els.append(dict(file=os.path.basename(f)[:-4],cid=h['Concept ID'],name=h['English name'],tris=nf))
def system(cid,nm):
    a=anc(cid)|{cid}; n=nm.lower()
    if a&{'FMA7163','FMA74657','FMA79063'} or 'skin' in n or 'fascia' in n or 'hair' in n: return 'skip'
    if re.search(r'costal cartilage|sternum|xiphoid|manubrium',n): return 'Skeleton'
    if re.search(r'pectoralis|iliotibial|retinaculum',n): return 'Muscles'
    if re.search(r'\bartery\b|\bvein\b|pulmonary trunk|trunk of',n): return 'Vessels'
    if re.search(r'(third|fourth|lateral) ventricle',n): return 'Nervous'
    if 'heart' in n or 'atrium' in n or 'ventricle' in n and 'brain' not in n and 'lateral ventricle' not in n or 'valve' in n or 'FMA7088' in a: return 'Organs'
    if a&{'FMA5018','FMA10483','FMA55107','FMA12516','FMA23881'}: return 'Skeleton'
    if a&{'FMA5022','FMA9721'}: return 'Muscles'
    if a&{'FMA50720','FMA50723','FMA7161','FMA228642'}: return 'Vessels'
    if a&{'FMA65132','FMA61284','FMA256237','FMA242193','FMA55676','FMA7157'}: return 'Nervous'
    return 'Organs'
for e in els: e['sys']=system(e['cid'],e['name'])
c=collections.Counter(); t=collections.Counter(); u=collections.defaultdict(set)
for e in els: c[e['sys']]+=1; t[e['sys']]+=e['tris']; u[e['sys']].add(e['cid'])
for s in c: print(s,c[s],len(u[s]),t[s])
json.dump(els,open(D+'/els.json','w'))
if len(sys.argv)>2:
    for e in sorted(els,key=lambda e:e['name']):
        if e['sys']==sys.argv[2]: print(e['name'])

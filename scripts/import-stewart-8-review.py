"""Import the supplied section and matching original image package, offline."""
import hashlib, json, pathlib, re, subprocess, sys, zipfile

root = pathlib.Path(__file__).resolve().parent.parent
source = pathlib.Path(sys.argv[1])
raw = source.read_text()
digest = hashlib.sha256(source.read_bytes()).hexdigest()
key = 'stewart-8-review-' + digest[:8]

manifest_path = root / 'data/books/asset-manifest.json'
manifest = json.loads(manifest_path.read_text())
assets = root / 'data/books/assets' / key
assets.mkdir(parents=True, exist_ok=True)
names = []
package=zipfile.ZipFile(sys.argv[2])
assert package.read(source.name)==source.read_bytes(), 'TeX/package mismatch'
for path in package.namelist():
    if not re.fullmatch(r'assets/[a-z0-9_]+\.png',path): continue
    name=pathlib.PurePosixPath(path).name
    data=package.read(path)
    (assets/name).write_bytes(data)
    names.append(name)
    manifest[key+'/'+name]={'file':key+'/'+name,'mime':'image/png','sha256':hashlib.sha256(data).hexdigest()}
assert len(names)==3
body = raw.split('\\begin{document}', 1)[1].split('\\end{document}', 1)[0]
# Remove print-only page controls before splitting independently usable problems.
body = body.replace(r'{\Large\bfseries Ôn tập Chương 8}', r'\textbf{Ôn tập Chương 8}')
body = re.sub(r'\\begin\{minipage\}(?:\[t\])?\{\\linewidth\}|\\end\{minipage\}|\\Needspace\{\d+\\baselineskip\}|\\(?:clearpage|noindent|nopagebreak\[4\])', '', body)
figure = re.compile(r'\\fig(?:\[[^]]*\])?\{([^}]+)\}\{')
while match := figure.search(body):
    depth, end = 1, match.end()
    while depth:
        depth += (body[end] == '{') - (body[end] == '}')
        end += 1
    name = match[1] + '.png'
    assert name in names
    caption = body[match.end():end-1]
    replacement = '\\begin{center}\\includegraphics{' + key + '/' + name + '}\\\\ ' + caption + '\\end{center}'
    body = body[:match.start()] + replacement + body[end:]

def html(tex):
    tex = re.sub(r'\\ex\{(\d+)\}', r'\n\n\\textbf{Ví dụ \1.} ', tex)
    tex = tex.replace('\\sol', r'\textit{Lời giải.} ')
    tex = re.sub(r'\\group\{([^}]+)\}', r'\n\n\\textbf{\1}\n\n', tex)
    result = subprocess.run(['pandoc', '-f', 'latex', '-t', 'html', '--mathjax', '--wrap=none'], input=tex, text=True, capture_output=True, check=True)
    assert not result.stderr, result.stderr
    output = result.stdout
    for name in names:
        output = output.replace('src="' + key + '/' + name + '"', 'src="/api/data?resource=book_asset&amp;asset=' + key + '/' + name + '"')
    return output


intro, concepts = body.split(r'\subsection*{Kiểm tra khái niệm}',1)
concepts, truefalse = concepts.split(r'\subsection*{Trắc nghiệm đúng–sai}',1)
truefalse, exercises = truefalse.split(r'\subsection*{Bài tập}',1)
records=[]
def simple_questions(tex, macro, title, count):
    tokens=list(re.finditer(r'\\'+macro+r'\{(\d+)\}',tex))
    assert [int(t[1]) for t in tokens]==list(range(1,count+1))
    shared=tex[:tokens[0].start()]
    for i,t in enumerate(tokens):
        prompt=r'\textbf{'+title+' '+t[1]+'.} '+shared+tex[t.end():tokens[i+1].start() if i+1<len(tokens) else len(tex)]
        records.append({'number':len(records)+1,'title':title+' '+t[1],'content':html(prompt)})
simple_questions(concepts,'kn','Kiểm tra khái niệm — Câu',10)
simple_questions(truefalse,'ds','Đúng–sai — Câu',8)
tokens=list(re.finditer(r'\\bt\{(\d+)\}|\\group\{(\d+)[–−-](\d+)\}',exercises))
contexts={}
for i,t in enumerate(tokens):
    if t[1]: contexts[int(t[1])]=exercises[t.end():tokens[i+1].start() if i+1<len(tokens) else len(exercises)].strip()
shared,bounds='',(0,0)
for i,t in enumerate(tokens):
    fragment=exercises[t.end():tokens[i+1].start() if i+1<len(tokens) else len(exercises)].strip()
    if t[2]:
        shared,bounds=fragment,(int(t[2]),int(t[3]))
        continue
    n=int(t[1])
    prompt=r'\textbf{Bài tập '+str(n)+'.} '
    if bounds[0]<=n<=bounds[1]:
        prompt+=r'\textit{Yêu cầu chung ('+str(bounds[0])+'–'+str(bounds[1])+'):} '+shared+'\n\n'
    dependencies={8:7,10:9}
    if n in dependencies:
        referenced=dependencies[n]
        prompt+=r'\textit{Dữ kiện Bài '+str(referenced)+':} '+contexts[referenced]+'\n\n'
    prompt+=fragment
    records.append({'number':18+n,'title':'Bài tập '+str(n),'content':html(prompt)})
assert len(contexts)==23
assert [r['number'] for r in records]==list(range(1,42))
entry={'bookKey':'stewart-9','sectionKey':'8-review','title':'Ôn tập','contentFormat':'html-latex','content':html(intro)+html(r'\par Ôn tập gồm 10 câu kiểm tra khái niệm, 8 câu đúng–sai và 23 bài tập. Mỗi câu được trình bày riêng bên dưới.')+'<h1>Bài tập</h1>\n','sourceInfo':{'filename':source.name,'sha256':digest,'assetCount':3,'conceptCheckCount':10,'trueFalseCount':8,'lastExercise':23,'interactiveQuestionCount':41,'note':'Toàn bộ nội dung TeX; 3 ảnh PNG nguyên bản từ gói có TeX khớp từng byte.'}}

for path,value in [('data/books/imports/stewart-8-review.json',entry),('data/books/exercises/stewart-8-review.json',{'exercises':records}),('data/books/asset-manifest.json',manifest)]:
    (root/path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
(root/'data/books/sources'/source.name).write_bytes(source.read_bytes())
target=root/'books.js'
s=target.read_text()
if key not in s:s=s.replace('stewart-8-5-e68da953)', 'stewart-8-5-e68da953|'+key+')')
target.write_text(s)
target=root/'lib/books.js'
s=target.read_text().replace("'8-5'].map", "'8-5','8-review'].map")
s=s.replace("'6-review','7-review'].includes", "'6-review','7-review','8-review'].includes")
target.write_text(s)
print(key,len(records),'interactive questions',len(names),'images')

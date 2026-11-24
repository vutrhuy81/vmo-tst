"""Import the supplied section and matching original image package, offline."""
import hashlib, json, pathlib, re, subprocess, sys, zipfile

root = pathlib.Path(__file__).resolve().parent.parent
source = pathlib.Path(sys.argv[1])
raw = source.read_text()
digest = hashlib.sha256(source.read_bytes()).hexdigest()
key = 'stewart-8-3-' + digest[:8]

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
assert len(names)==42
body = raw.split('\\begin{document}', 1)[1].split('\\end{document}', 1)[0]
# Remove print-only page controls before splitting independently usable problems.
body = body.replace(r'{\Large\bfseries 8.3 — Ứng dụng trong vật lý và kỹ thuật}', r'\textbf{8.3 — Ứng dụng trong vật lý và kỹ thuật}')
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

theory, exercises = body.split('\\section*{8.3 — Bài tập}', 1)
exercises,project=exercises.split(r'\section*{Dự án khám phá — Những chiếc tách cà phê bổ sung nhau}',1)
contexts={}
for m in re.finditer(r'\\bt\{(\d+)\}',exercises):
    end=re.search(r'\\(?:bt|group)\{',exercises[m.end():])
    contexts[int(m[1])]=exercises[m.end():m.end()+end.start() if end else len(exercises)].strip()
tokens = list(re.finditer(r'\\bt\{(\d+)\}|\\group\{(\d+)[–−-](\d+)(?: — [^}]*)?\}', exercises))
records, shared, bounds = [], '', (0, 0)
for index, token in enumerate(tokens):
    fragment = exercises[token.end():tokens[index+1].start() if index+1 < len(tokens) else len(exercises)].strip()
    if token[2]:
        bounds, shared = (int(token[2]), int(token[3])), fragment
        continue
    number = int(token[1])
    prompt = '\\textbf{' + str(number) + '.}\n\n'
    if bounds[0] <= number <= bounds[1]:
        prompt += '\\textit{Yêu cầu chung (' + str(bounds[0]) + '–' + str(bounds[1]) + '):} ' + shared + '\n\n'
    dependencies={19:[18],20:[18,10],40:[39],41:[39],48:[47]}
    for dependency in dependencies.get(number,[]):
        prompt += r'\textit{Dữ kiện Bài ' + str(dependency) + ':} ' + contexts[dependency] + '\n\n'
    if number == 49:
        prompt += r'\textit{Dữ kiện Ví dụ 7:} Khối xuyến tạo bởi hình tròn bán kính $r$ quay quanh đường thẳng cách tâm $R>r$.'
    if number == 51:
        prompt += r'\textit{Công thức 9:} $\bar x=\frac1A\int_a^b x[f(x)-g(x)]\,dx$, $\bar y=\frac1A\int_a^b\frac12([f(x)]^2-[g(x)]^2)\,dx$, với $A=\int_a^b[f(x)-g(x)]\,dx$, $f(x)\ge g(x)$.'
    prompt += fragment
    content=html(prompt)
    records.append({'number': number, 'content': content})
assert [r['number'] for r in records] == list(range(1,52))
assert len(re.findall(r'\\ex\{', theory)) == 7
project_title = 'Dự án khám phá — Những chiếc tách cà phê bổ sung nhau'
project_tokens=list(re.finditer(r'\\prj\{(\d+)\}',project))
project_context=project[:project_tokens[0].start()]
for i,token in enumerate(project_tokens):
    fragment=project[token.end():project_tokens[i+1].start() if i+1<len(project_tokens) else len(project)].strip()
    prompt= r'\textbf{' + project_title + ' — Bài ' + token[1] + r'.} ' + project_context
    if int(token[1]) in [2,3]:
        prompt += r'\textit{Dữ kiện Bài 1:} ' + project[project_tokens[0].end():project_tokens[1].start()]
    if int(token[1]) == 3:
        prompt += r'\textit{Yêu cầu Bài 2:} ' + project[project_tokens[1].end():project_tokens[2].start()]
    prompt += fragment
    records.append({'number':51+int(token[1]),'title':project_title+' — Bài '+token[1],'content':html(prompt)})
assert len(records)==55

entry = {'bookKey':'stewart-9','sectionKey':'8-3','title':'8.3. Ứng dụng trong vật lý và kỹ thuật','contentFormat':'html-latex','content':html(theory)+'<h1>8.3. Bài tập</h1>\n','sourceInfo':{'filename':source.name,'sha256':digest,'assetCount':42,'exampleCount':7,'lastExercise':51,'projectExerciseCount':4,'note':'Nội dung từ TeX đính kèm; 42 ảnh PNG nguyên bản từ gói TeX khớp từng byte.'}}
for path,value in [('data/books/imports/stewart-8-3.json',entry),('data/books/exercises/stewart-8-3.json',{'exercises':records}),('data/books/asset-manifest.json',manifest)]:
    (root/path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
(root/'data/books/sources'/source.name).write_bytes(source.read_bytes())
target=root/'books.js'
s=target.read_text()
if key not in s:s=s.replace('stewart-8-2-47f88c07)', 'stewart-8-2-47f88c07|'+key+')')
target.write_text(s)
target=root/'lib/books.js'
target.write_text(target.read_text().replace("'8-2'].map", "'8-2','8-3'].map"))
print(key,len(records),'questions',len(names),'images')

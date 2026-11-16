"""Import the supplied section and matching original image package, offline."""
import hashlib, json, pathlib, re, subprocess, sys, zipfile

root = pathlib.Path(__file__).resolve().parent.parent
source = pathlib.Path(sys.argv[1])
raw = source.read_text()
digest = hashlib.sha256(source.read_bytes()).hexdigest()
key = 'stewart-7-4-' + digest[:8]

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
assert len(names)==2
body = raw.split('\\begin{document}', 1)[1].split('\\end{document}', 1)[0]
# Remove print-only page controls before splitting independently usable problems.
body = body.replace(r'{\Large\bfseries 7.4 — Tích phân hàm hữu tỉ bằng phân tích thành phân thức đơn giản}', r'\textbf{7.4 — Tích phân hàm hữu tỉ bằng phân thức đơn giản}')
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

theory, exercises = body.split('\\section*{7.4 — Bài tập}', 1)
tokens = list(re.finditer(r'\\bt\{(\d+)\}|\\group\{(\d+)[–−-](\d+)\}', exercises))
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
    if number in (61,62):
        prompt += r'\textit{Công thức 6:} $\int dx/(x^2-a^2)=\frac{1}{2a}\ln\left|\frac{x-a}{x+a}\right|+C$, $a\ne0$. ' + '\n\n'
    if 64 <= number <= 67:
        prompt += r'\textit{Dữ kiện Bài tập 63:} $t=\tan(x/2)$, $\cos x=(1-t^2)/(1+t^2)$, $\sin x=2t/(1+t^2)$, $dx=2\,dt/(1+t^2)$. ' + '\n\n'
    prompt += fragment
    records.append({'number': number, 'content': html(prompt)})
assert [r['number'] for r in records] == list(range(1,79))
assert len(re.findall(r'\\ex\{', theory)) == 9
entry = {'bookKey':'stewart-9','sectionKey':'7-4','title':'7.4. Tích phân hàm hữu tỉ bằng phân thức đơn giản','contentFormat':'html-latex','content':html(theory)+'<h1>7.4. Bài tập</h1>\n','sourceInfo':{'filename':source.name,'sha256':digest,'assetCount':2,'exampleCount':9,'lastExercise':78,'note':'Nội dung từ TeX đính kèm; hai ảnh PNG nguyên bản từ gói TeX khớp từng byte.'}}
for path,value in [('data/books/imports/stewart-7-4.json',entry),('data/books/exercises/stewart-7-4.json',{'exercises':records}),('data/books/asset-manifest.json',manifest)]:
    (root/path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
(root/'data/books/sources'/source.name).write_bytes(source.read_bytes())
target=root/'books.js'
target.write_text(target.read_text().replace('stewart-7-3-6485b25a)', 'stewart-7-3-6485b25a|'+key+')'))
target=root/'lib/books.js'
target.write_text(target.read_text().replace("'7-1','7-2','7-3'].map", "'7-1','7-2','7-3','7-4'].map"))
print(key,len(records),'exercises',len(names),'images')

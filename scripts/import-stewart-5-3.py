"""Import the supplied section and matching original image package, offline."""
import hashlib, json, pathlib, re, subprocess, sys, zipfile

root = pathlib.Path(__file__).resolve().parent.parent
source = pathlib.Path(sys.argv[1])
raw = source.read_text()
digest = hashlib.sha256(source.read_bytes()).hexdigest()
key = 'stewart-5-3-' + digest[:8]
package = zipfile.ZipFile(sys.argv[2])
assert package.read(source.name) == source.read_bytes(), 'Source/package mismatch'
manifest_path = root / 'data/books/asset-manifest.json'
manifest = json.loads(manifest_path.read_text())
assets = root / 'data/books/assets' / key
assets.mkdir(parents=True, exist_ok=True)
names = []
for path in package.namelist():
    if not re.fullmatch(r'assets/[a-z0-9_]+\.png', path):
        continue
    name = pathlib.PurePosixPath(path).name
    data = package.read(path)
    (assets / name).write_bytes(data)
    names.append(name)
    manifest[key + '/' + name] = {'file': key + '/' + name, 'mime': 'image/png', 'sha256': hashlib.sha256(data).hexdigest()}
assert len(names) == 18
body = raw.split('\\begin{document}', 1)[1].split('\\end{document}', 1)[0]
# Remove print-only page controls before splitting independently usable problems.
body = re.sub(r'\\begin\{minipage\}\{\\linewidth\}|\\end\{minipage\}|\\Needspace\{\d+\\baselineskip\}|\\(?:clearpage|noindent|nopagebreak\[4\])', '', body)
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

theory, exercises = body.split('\\section*{5.3 — Bài tập}', 1)
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
    prompt += fragment
    if number == 81:
        prompt += r'\par\textit{Dữ kiện từ Ví dụ 3:} \[S(x)=\int_0^x\sin(\pi t^2/2)\,dt.\]'
        for name in ['fig07', 'fig08']:
            prompt += '\\begin{center}\\includegraphics{' + key + '/' + name + '.png}\\end{center}'
    if number == 87:
        prompt += r'\par\textit{Dữ kiện từ chứng minh FTC1:} Với $g(x)=\int_a^x f(t)\,dt$, $f$ liên tục và $u,v$ là các điểm đạt giá trị nhỏ nhất, lớn nhất của $f$ trên đoạn có hai đầu mút $x,x+h$, bất đẳng thức (3) là \[f(u)\le\frac{g(x+h)-g(x)}h\le f(v).\tag{3}\]'
    records.append({'number': number, 'content': html(prompt)})
assert [row['number'] for row in records] == list(range(1, 96))
assert len(re.findall(r'\\ex\{', theory)) == 9
entry = {'bookKey': 'stewart-9', 'sectionKey': '5-3', 'title': '5.3. Định lý cơ bản của Giải tích', 'contentFormat': 'html-latex', 'content': html(theory) + '<h1>5.3. Bài tập</h1>\n', 'sourceInfo': {'filename': source.name, 'sha256': digest, 'assetCount': 18, 'exampleCount': 9, 'lastExercise': 95, 'note': 'Nhập toàn bộ lý thuyết, chứng minh, 9 ví dụ và 95 bài tập; 18 hình PNG gốc từ gói có tệp TeX khớp từng byte. Mỗi bài tập có đủ yêu cầu chung và dữ kiện tham chiếu.'}}
for path, value in [('data/books/imports/stewart-5-3.json', entry), ('data/books/exercises/stewart-5-3.json', {'exercises': records}), ('data/books/asset-manifest.json', manifest)]:
    (root / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
(root / 'data/books/sources').mkdir(exist_ok=True)
(root / 'data/books/sources' / source.name).write_bytes(source.read_bytes())
for path, old, new in [('lib/books.js', "'5-1','5-2'].map", "'5-1','5-2','5-3'].map"), ('books.js', 'stewart-5-2-157ffa41)', 'stewart-5-2-157ffa41|' + key + ')')]:
    target = root / path
    content = target.read_text()
    if new not in content:
        assert old in content
        target.write_text(content.replace(old, new))
print(key, '95 exercises, 9 examples, 18 source images')

"""Import the supplied section and matching original image package, offline."""
import hashlib, json, pathlib, re, subprocess, sys, zipfile

root = pathlib.Path(__file__).resolve().parent.parent
source = pathlib.Path(sys.argv[1])
raw = source.read_text()
digest = hashlib.sha256(source.read_bytes()).hexdigest()
key = 'stewart-5-review-' + digest[:8]
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
assert len(names) == 5
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

theory, exercises = body.split('\\section*{Bài tập}', 1)
assert len(re.findall(r'\\cc\{', theory)) == 9
assert len(re.findall(r'\\tf\{', theory)) == 20
theory = re.sub(r'\\(?:cc|tf)\{(\d+)\}', r'\n\n\\textbf{\1.} ', theory)
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
    if number == 10:
        prompt += r'\par\textit{Dữ kiện từ Bài tập 9:} Đồ thị của $f$ gồm ba đoạn thẳng trong hình, và $g(x)=\int_0^x f(t)\,dt$.'
        prompt += '\\begin{center}\\includegraphics{' + key + '/ex09.png}\\end{center}'
    if number in [57, 58]:
        prompt += r'\par\textit{Tính chất 8:} Nếu $m\le f(x)\le M$ trên $[a,b]$, $a\le b$, thì $m(b-a)\le\int_a^b f(x)\,dx\le M(b-a)$.'
    records.append({'number': number, 'content': html(prompt)})
assert [row['number'] for row in records] == list(range(1, 79))
entry = {'bookKey': 'stewart-9', 'sectionKey': '5-review', 'title': 'Ôn tập', 'contentFormat': 'html-latex', 'content': html(theory) + '<h1>Bài tập</h1>\n', 'sourceInfo': {'filename': source.name, 'sha256': digest, 'assetCount': 5, 'conceptCheckCount': 9, 'trueFalseCount': 20, 'lastExercise': 78, 'note': 'Nhập toàn bộ 9 câu kiểm tra khái niệm, 20 câu đúng–sai và 78 bài tập; 5 hình PNG gốc từ gói có tệp TeX khớp từng byte. Mỗi bài tập có đủ yêu cầu chung và dữ kiện tham chiếu.'}}
for path, value in [('data/books/imports/stewart-5-review.json', entry), ('data/books/exercises/stewart-5-review.json', {'exercises': records}), ('data/books/asset-manifest.json', manifest)]:
    (root / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
(root / 'data/books/sources').mkdir(exist_ok=True)
(root / 'data/books/sources' / source.name).write_bytes(source.read_bytes())
for path, old, new in [('lib/books.js', "'5-1','5-2','5-3','5-4','5-5'].map", "'5-1','5-2','5-3','5-4','5-5','5-review'].map"), ('books.js', 'stewart-5-5-058a053e)', 'stewart-5-5-058a053e|' + key + ')')]:
    target = root / path
    content = target.read_text()
    if new not in content:
        assert old in content
        target.write_text(content.replace(old, new))
    if path == 'lib/books.js':
        target.write_text(target.read_text().replace("'3-review','4-review'].includes", "'3-review','4-review','5-review'].includes"))
print(key, '78 exercises, 9 concept checks, 20 true-false questions, 5 source images')

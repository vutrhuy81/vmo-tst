"""Import the supplied section and matching original image package, offline."""
import hashlib, json, pathlib, re, subprocess, sys, zipfile

root = pathlib.Path(__file__).resolve().parent.parent
source = pathlib.Path(sys.argv[1])
raw = source.read_text()
digest = hashlib.sha256(source.read_bytes()).hexdigest()
key = 'stewart-5-5-' + digest[:8]
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
assert len(names) == 4
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

theory, exercises = body.split('\\section*{5.5 — Bài tập}', 1)
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
    if number == 99:
        prompt += r'\par\textit{Kết quả từ Bài tập 98:} Nếu $f$ liên tục trên $[0,\pi]$ thì \[\int_0^\pi xf(\sin x)\,dx=\frac\pi2\int_0^\pi f(\sin x)\,dx.\]'
    records.append({'number': number, 'content': html(prompt)})
assert [row['number'] for row in records] == list(range(1, 101))
assert len(re.findall(r'\\ex\{', theory)) == 11
entry = {'bookKey': 'stewart-9', 'sectionKey': '5-5', 'title': '5.5. Quy tắc đổi biến', 'contentFormat': 'html-latex', 'content': html(theory) + '<h1>5.5. Bài tập</h1>\n', 'sourceInfo': {'filename': source.name, 'sha256': digest, 'assetCount': 4, 'exampleCount': 11, 'lastExercise': 100, 'note': 'Nhập toàn bộ lý thuyết, chứng minh, tính đối xứng, 11 ví dụ và 100 bài tập; 4 hình PNG gốc từ gói có tệp TeX khớp từng byte. Mỗi bài tập có đủ yêu cầu chung và dữ kiện tham chiếu.'}}
for path, value in [('data/books/imports/stewart-5-5.json', entry), ('data/books/exercises/stewart-5-5.json', {'exercises': records}), ('data/books/asset-manifest.json', manifest)]:
    (root / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
(root / 'data/books/sources').mkdir(exist_ok=True)
(root / 'data/books/sources' / source.name).write_bytes(source.read_bytes())
for path, old, new in [('lib/books.js', "'5-1','5-2','5-3','5-4'].map", "'5-1','5-2','5-3','5-4','5-5'].map"), ('books.js', 'stewart-5-4-370195f0)', 'stewart-5-4-370195f0|' + key + ')')]:
    target = root / path
    content = target.read_text()
    if new not in content:
        assert old in content
        target.write_text(content.replace(old, new))
print(key, '100 exercises, 11 examples, 4 source images')

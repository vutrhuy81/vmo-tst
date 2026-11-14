"""Import the supplied section and matching original image package, offline."""
import hashlib, json, pathlib, re, subprocess, sys, zipfile

root = pathlib.Path(__file__).resolve().parent.parent
source = pathlib.Path(sys.argv[1])
raw = source.read_text()
digest = hashlib.sha256(source.read_bytes()).hexdigest()
key = 'stewart-5-plus-' + digest[:8]
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
assert len(names) == 3
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
    tex = re.sub(r'\\gint\{([^{}]+)\}', lambda m: r'\left[\!\left[' + m[1] + r'\right]\!\right]', tex)
    result = subprocess.run(['pandoc', '-f', 'latex', '-t', 'html', '--mathjax', '--wrap=none'], input=tex, text=True, capture_output=True, check=True)
    assert not result.stderr, result.stderr
    output = result.stdout
    for name in names:
        output = output.replace('src="' + key + '/' + name + '"', 'src="/api/data?resource=book_asset&amp;asset=' + key + '/' + name + '"')
    return output

theory, exercises = body.split('\\section*{Bài toán}', 1)
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
    if number == 11:
        prompt += r'\par\textit{Ký hiệu:} $\lfloor x\rfloor$ (được viết bằng ngoặc vuông kép trong đề) là số nguyên lớn nhất không vượt quá $x$.'
    records.append({'number': number, 'content': html(prompt)})
assert [row['number'] for row in records] == list(range(1, 21))
assert theory.count('\\textbf{Ví dụ.}') == 1
entry = {'bookKey': 'stewart-9', 'sectionKey': '5-plus', 'title': 'Bài tập nâng cao', 'contentFormat': 'html-latex', 'content': html(theory) + '<h1>Bài toán</h1>\n', 'sourceInfo': {'filename': source.name, 'sha256': digest, 'assetCount': 3, 'exampleCount': 1, 'lastExercise': 20, 'note': 'Nhập toàn bộ ví dụ và lời giải hướng dẫn, 20 bài toán nâng cao; 3 hình PNG gốc từ gói có tệp TeX khớp từng byte. Mỗi bài tập có đủ yêu cầu chung và dữ kiện tham chiếu.'}}
for path, value in [('data/books/imports/stewart-5-plus.json', entry), ('data/books/exercises/stewart-5-plus.json', {'exercises': records}), ('data/books/asset-manifest.json', manifest)]:
    (root / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
(root / 'data/books/sources').mkdir(exist_ok=True)
(root / 'data/books/sources' / source.name).write_bytes(source.read_bytes())
for path, old, new in [('lib/books.js', "'5-5','5-review'].map", "'5-5','5-review','5-plus'].map"), ('books.js', 'stewart-5-review-45ed5363)', 'stewart-5-review-45ed5363|' + key + ')')]:
    target = root / path
    content = target.read_text()
    if new not in content:
        assert old in content
        target.write_text(content.replace(old, new))
    if path == 'lib/books.js':
        target.write_text(target.read_text().replace("['2-plus','3-plus','4-plus'].includes", "['2-plus','3-plus','4-plus','5-plus'].includes"))
print(key, '20 problems, 1 worked example, 3 source images')

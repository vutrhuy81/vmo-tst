"""Import the supplied section and matching original image package, offline."""
import hashlib, json, pathlib, re, subprocess, sys, zipfile

root = pathlib.Path(__file__).resolve().parent.parent
source = pathlib.Path(sys.argv[1])
raw = source.read_text()
digest = hashlib.sha256(source.read_bytes()).hexdigest()
key = 'stewart-6-1-' + digest[:8]
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
assert len(names) == 34
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

theory, exercises = body.split('\\section*{6.1 — Bài tập}', 1)
exercises, project = exercises.split('\\section*{Dự án ứng dụng — Chỉ số Gini}', 1)
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
    if number == 59:
        prompt += r'\textbf{Dữ kiện Ví dụ 8.} ' + theory.split(r'\ex{8}', 1)[1] + '\n\n'
    prompt += fragment
    records.append({'number': number, 'content': html(prompt)})
assert [row['number'] for row in records] == list(range(1, 71))
assert len(re.findall(r'\\ex\{', theory)) == 8
# Keep project questions independent, with all shared models, tables and figures.
project_intro = project.split('\\prj{1}', 1)[0]
project_tokens = list(re.finditer(r'\\prj\{(\d+)\}', project))
project_questions = {}
for i, token in enumerate(project_tokens):
    n = int(token[1])
    project_questions[n] = project[token.end():project_tokens[i+1].start() if i+1 < len(project_tokens) else len(project)].strip()
for n, fragment in project_questions.items():
    context = project_intro
    if n in (3, 4):
        context += r'\par\textbf{Dữ kiện Bài toán 2.} ' + project_questions[2]
    records.append({'number': 70+n, 'content': html(context + r'\par\textbf{Dự án Chỉ số Gini — Bài toán ' + str(n) + '.} ' + fragment)})
entry = {'bookKey': 'stewart-9', 'sectionKey': '6-1', 'title': '6.1. Diện tích giữa các đường cong', 'contentFormat': 'html-latex', 'content': html(theory) + '<h1>6.1. Bài tập</h1>\n', 'sourceInfo': {'filename': source.name, 'sha256': digest, 'assetCount': len(names), 'exampleCount': 8, 'lastExercise': 70, 'projectExerciseCount': 4, 'note': 'Toàn bộ nội dung gốc, 70 bài tập và 4 câu dự án Gini (mã 71–74); hình gốc từ gói có TeX khớp từng byte.'}}
for path, value in [('data/books/imports/stewart-6-1.json', entry), ('data/books/exercises/stewart-6-1.json', {'exercises': records}), ('data/books/asset-manifest.json', manifest)]:
    (root / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
(root / 'data/books/sources').mkdir(exist_ok=True)
(root / 'data/books/sources' / source.name).write_bytes(source.read_bytes())
target = root / 'lib/books.js'
content = target.read_text()
if "'6-1'].map" not in content:
    assert "'5-plus'].map" in content
    target.write_text(content.replace("'5-plus'].map", "'5-plus','6-1'].map"))
target = root / 'books.js'
content = target.read_text()
if key + ')' not in content:
    content = content.replace('stewart-5-plus-86487584)', 'stewart-5-plus-86487584|' + key + ')')
    target.write_text(content)
print(key, len(records), 'questions', len(names), 'images')

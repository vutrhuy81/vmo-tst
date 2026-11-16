"""Import the supplied section and matching original image package, offline."""
import hashlib, json, pathlib, re, subprocess, sys, zipfile

root = pathlib.Path(__file__).resolve().parent.parent
source = pathlib.Path(sys.argv[1])
raw = source.read_text()
digest = hashlib.sha256(source.read_bytes()).hexdigest()
key = 'stewart-7-6-' + digest[:8]

names=[]
assert not re.search(r'\\(?:fig(?:\[.*?\])?\{|includegraphics(?:\[.*?\])?\{)',raw.split(r'\begin{document}',1)[1])
body = raw.split('\\begin{document}', 1)[1].split('\\end{document}', 1)[0]
# Remove print-only page controls before splitting independently usable problems.
body = body.replace(r'{\Large\bfseries 7.6 — Tính tích phân bằng bảng và công nghệ}', r'\textbf{7.6 — Tính tích phân bằng bảng và công nghệ}')
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

theory, exercises = body.split('\\section*{7.6 — Bài tập}', 1)
exercises, project = exercises.split(r'\section*{Dự án khám phá — Quy luật trong các tích phân}',1)
tokens = list(re.finditer(r'\\bt\{(\d+)\}|\\group\{(\d+)[–−-](\d+)(?: — \[Công nghệ\])?\}', exercises))
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
    records.append({'number': number, 'content': html(prompt)})
assert [r['number'] for r in records] == list(range(1,49))
assert len(re.findall(r'\\ex\{', theory)) == 7
project_intro=project.split(r'\prj{1}',1)[0]
project_tokens=list(re.finditer(r'\\prj\{(\d+)\}',project))
assert len(project_tokens)==4
for i, token in enumerate(project_tokens):
    n=int(token[1])
    fragment=project[token.end():project_tokens[i+1].start() if i+1<len(project_tokens) else len(project)]
    prompt=r'\textbf{Dự án khám phá — Quy luật trong các tích phân — Câu '+str(n)+'.} '+project_intro+fragment
    records.append({'number':48+n,'content':html(prompt)})
assert [r['number'] for r in records]==list(range(1,53))
entry = {'bookKey':'stewart-9','sectionKey':'7-6','title':'7.6. Tính tích phân bằng bảng và công nghệ','contentFormat':'html-latex','content':html(theory)+'<h1>7.6. Bài tập</h1>\n','sourceInfo':{'filename':source.name,'sha256':digest,'assetCount':0,'exampleCount':7,'lastExercise':48,'projectExerciseCount':4,'note':'Nội dung từ TeX đính kèm; không có hình ảnh được tham chiếu trong nội dung TeX.'}}
for path,value in [('data/books/imports/stewart-7-6.json',entry),('data/books/exercises/stewart-7-6.json',{'exercises':records})]:
    (root/path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
(root/'data/books/sources'/source.name).write_bytes(source.read_bytes())
target=root/'lib/books.js'
target.write_text(target.read_text().replace("'7-4','7-5'].map", "'7-4','7-5','7-6'].map"))
print(key,len(records),'exercises; no image references')

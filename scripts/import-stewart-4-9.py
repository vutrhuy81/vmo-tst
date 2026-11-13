"""Offline import: python scripts/import-stewart-4-9.py SOURCE.tex PACKAGE.zip."""
import pathlib,re,hashlib,json,subprocess,zipfile,sys
root=pathlib.Path(__file__).resolve().parent.parent
src=pathlib.Path(sys.argv[1]);raw=src.read_text();sha=hashlib.sha256(src.read_bytes()).hexdigest();key='stewart-4-9-'+sha[:8]
z=zipfile.ZipFile(sys.argv[2]);assert z.read('Stewart_4_9_Nguyen_ham_VI.tex')==src.read_bytes(),'Source mismatch'
assets=root/'data/books/assets'/key;assets.mkdir(parents=True,exist_ok=True);manifest=json.loads((root/'data/books/asset-manifest.json').read_text());names=[]
for name in z.namelist():
 if not name.startswith('assets/') or not name.endswith('.png'):continue
 basename=pathlib.PurePosixPath(name).name;data=z.read(name);(assets/basename).write_bytes(data);names.append(basename);manifest[key+'/'+basename]={'file':key+'/'+basename,'mime':'image/png','sha256':hashlib.sha256(data).hexdigest()}
body=raw.split('\\begin{document}',1)[1].split('\\end{document}',1)[0];pat=re.compile(r'\\fig(?:\[[^]]*\])?\{([^}]+)\}\{')
while m:=pat.search(body):
 depth=1;i=m.end()
 while depth:
  if body[i]=='{':depth+=1
  if body[i]=='}':depth-=1
  i+=1
 name=m[1];assert name+'.png' in names
 replacement='\\begin{center}\\includegraphics{'+key+'/'+name+'.png}\\\\ '+body[m.end():i-1]+'\\end{center}'
 body=body[:m.start()]+replacement+body[i:]
body=re.sub(r'\\group\{(\d+[–−-]\d+)\}',r'\\group{\1.}',body)
body=re.sub(r'\\bt\{(\d+)\}',r'\n\n\\textbf{\1.} ',body);body=re.sub(r'\\ex\{(\d+)\}',r'\n\n\\textbf{Ví dụ \1.} ',body);body=body.replace('\\sol',r'\textit{Lời giải.} ');body=re.sub(r'\\group\{([^}]+)\}',r'\n\n\\textbf{\1}\n\n',body)
body=body.replace(r'\sech',r'\operatorname{sech}').replace(r'\csch',r'\operatorname{csch}')
body=body.replace('4.9 — Bài tập','4.9. Bài tập')
body=re.sub(r'\\pb\{(\d+)\}',r'\n\n\\textbf{Câu \1.} ',body)
body=body.replace(r'\arccot',r'\operatorname{arccot}')
tex='\\documentclass{article}\n\\usepackage{amsmath,amssymb,graphicx,booktabs,longtable}\n\\begin{document}\n'+body+'\n\\end{document}'
r=subprocess.run(['pandoc','-f','latex','-t','html','--mathjax','--wrap=none'],input=tex,capture_output=True,text=True,check=True);assert not r.stderr,r.stderr;html=r.stdout
for name in names:html=html.replace('src="'+key+'/'+name+'"','src="/api/data?resource=book_asset&amp;asset='+key+'/'+name+'"')
entry={'bookKey':'stewart-9','sectionKey':'4-9','title':'4.9. Nguyên hàm','contentFormat':'html-latex','content':html,'sourceInfo':{'filename':src.name,'sha256':sha,'assetCount':len(names),'exampleCount':7,'lastExercise':85,'note':'Nhập toàn bộ LaTeX; 11 hình từ gói nguồn có file TeX khớp từng byte với tệp nguồn.'}}
(root/'data/books/imports/stewart-4-9.json').write_text(json.dumps(entry,ensure_ascii=False,indent=2)+'\n');(root/'data/books/asset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');(root/'data/books/sources').mkdir(exist_ok=True);(root/'data/books/sources/Stewart_4_9_Nguyen_ham_VI.tex').write_bytes(src.read_bytes())
print('Imported',len(html),'characters;',names)

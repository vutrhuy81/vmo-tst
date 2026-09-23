import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const apiDirectory = fileURLToPath(new URL('../api/', import.meta.url));

async function countJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const counts = await Promise.all(entries.map(entry => {
    const child = `${directory}/${entry.name}`;
    return entry.isDirectory() ? countJavaScriptFiles(child) : Number(entry.isFile() && entry.name.endsWith('.js'));
  }));
  return counts.reduce((sum, count) => sum + count, 0);
}

const count = await countJavaScriptFiles(apiDirectory);
assert.ok(count <= 12, `Vercel Hobby chỉ cho phép 12 Serverless Functions; thư mục api hiện có ${count} file JavaScript.`);
const projectRoot = new URL('../', import.meta.url);
const vercelConfig = JSON.parse(await readFile(new URL('vercel.json', projectRoot), 'utf8'));
assert.ok(vercelConfig.functions?.['api/ai-ocr-exam.js']?.maxDuration >= 120,
  'OCR đề thi cần đủ thời gian xử lý ảnh và sinh JSON nhiều câu');
const examOcrSource = await readFile(new URL('api/ai-ocr-exam.js', projectRoot), 'utf8');
const databaseUiSource = await readFile(new URL('vmo_db_ui.js', projectRoot), 'utf8');
assert.match(examOcrSource, /const OCR_TIMEOUT_MS = 100_000/,
  'OCR đề thi không được dùng timeout mặc định 22 giây');
assert.match(examOcrSource, /\['tst', 'regional'\]\.includes\(body\?\.destination\)/,
  'TST và Đà Nẵng–Quảng Nam phải cùng hỗ trợ tối đa bốn ngày thi');
assert.match(databaseUiSource, /document\.getElementById\('docDestination'\)\?\.value \|\| 'tst'/,
  'Frontend phải gửi đúng kho đích khi OCR đề Đà Nẵng–Quảng Nam');
console.log(`Vercel function limit: OK (${count}/12)`);

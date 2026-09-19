import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
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
console.log(`Vercel function limit: OK (${count}/12)`);

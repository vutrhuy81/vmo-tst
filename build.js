/**
 * BUILD SYSTEM - VMO ĐÀ NẴNG 2026-2027
 * Biên dịch kiến trúc module phân tán (src/) thành tệp hoàn chỉnh index.html.
 * Giúp mã nguồn cực kỳ dễ quản lý, bảo trì và phát triển nội dung toán học.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function build() {
  const startTime = Date.now();
  const rootDir = __dirname;
  const srcDir = path.join(rootDir, 'src');

  console.log('[Build] Bắt đầu tổng hợp mã nguồn từ thư mục src/...');

  const templatePath = path.join(srcDir, 'template.html');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Không tìm thấy tệp template: ${templatePath}`);
  }

  let html = fs.readFileSync(templatePath, 'utf8');

  // Tạo mã version timestamp động mới cho mỗi lần build để chống triệt để trình duyệt cache script cũ
  const buildVersion = Date.now();
  html = html.replace(/\?v=[a-zA-Z0-9_-]+/g, `?v=${buildVersion}`);

  // Bản đồ các khối module thành phần
  const injections = [
    { tag: '<!-- INJECT:SIDEBAR_DANANG -->', file: 'sidebars/sidebar-danang.html' },
    { tag: '<!-- INJECT:SIDEBAR_MOCK -->', file: 'sidebars/sidebar-mock.html' },
    { tag: '<!-- INJECT:SIDEBAR_TST -->', file: 'sidebars/sidebar-tst.html' },
    { tag: '<!-- INJECT:SIDEBAR_HISTORY -->', file: 'sidebars/sidebar-history.html' },
    { tag: '<!-- INJECT:TAB_DANANG -->', file: 'content/tab-danang.html' },
    { tag: '<!-- INJECT:TAB_MOCK -->', file: 'content/tab-mock.html' },
    { tag: '<!-- INJECT:TAB_TST -->', file: 'content/tab-tst.html' },
    { tag: '<!-- INJECT:TAB_HISTORY -->', file: 'content/tab-history.html' },
    { tag: '<!-- INJECT:ACCOUNT_MODAL -->', file: 'modals/account-modal.html' },
    { tag: '<!-- INJECT:DATA_HUB_MODAL -->', file: 'modals/data-hub-modal.html' }
  ];

  for (const item of injections) {
    const filePath = path.join(srcDir, item.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Thiếu khối module: ${item.file} tại ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    if (!html.includes(item.tag)) {
      console.warn(`[Build Cảnh báo] Thẻ ${item.tag} không tìm thấy trong template.html`);
    }
    html = html.replace(item.tag, content);
  }

  // Ghi tệp index.html tại thư mục gốc
  const outputPath = path.join(rootDir, 'index.html');
  fs.writeFileSync(outputPath, html, 'utf8');

  const elapsed = Date.now() - startTime;
  const stats = fs.statSync(outputPath);
  const sizeKB = (stats.size / 1024).toFixed(1);
  const lineCount = html.split('\n').length;

  console.log(`[Build Thành công] Đã biên dịch index.html (${sizeKB} KB, ${lineCount} dòng) trong ${elapsed}ms.`);
  return { size: stats.size, lines: lineCount, elapsed };
}

// Chạy trực tiếp nếu gọi qua lệnh node build.js
if (process.argv[1] === __filename) {
  try {
    build();
  } catch (err) {
    console.error('[Build Thất bại]:', err.message);
    process.exit(1);
  }
}

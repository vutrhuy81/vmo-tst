import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const engineSource = fs.readFileSync(new URL('../ai_guide_engine.js', import.meta.url), 'utf8');
const savedId = '507f1f77bcf86cd799439011';
const originalGuide = {
  branch: 'Đại số',
  knowledge: 'Kiến thức gốc $x^2$.',
  intuition: 'Ý tưởng gốc.',
  solution: 'Lời giải gốc.',
  pitfalls: 'Lưu ý gốc.',
  quality: { verified: true, score: '5.0/5.0', verifier: 'GPT' }
};

async function createHarness({ role = 'admin', persisted = true } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body><div class="tab-pane active">
    <article class="exam-card"><h3 class="exam-title">Đề kiểm thử</h3>
      <div class="problem-item" id="question-2" data-content-key="tst:tst-da-nang:day-1:question-2"
        data-database-problem="true" data-source-group="tst" data-source-type="tst_question">
        <div class="problem-header"><div class="problem-id"><span>Câu 2</span></div><span class="badge-topic">Đại số</span></div>
        <div class="problem-content">Chứng minh $x^2 \ge 0$.</div>
      </div>
    </article>
  </div></body></html>`, { runScripts: 'outside-only', url: 'https://example.test/' });
  const { window } = dom;
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() { return this.textContent; },
    set(value) { this.textContent = value; }
  });
  const updateCalls = [];
  const submitCalls = [];
  window.VMOAuth = { getSession: () => ({ role, username: role }) };
  window.MathJax = { typesetPromise: async () => {}, typesetClear: () => {} };
  window.showVMOToast = () => {};
  window.alert = () => {};
  window.setTimeout = callback => { callback(); return 1; };
  window.fetch = async () => ({
    ok: true,
    json: async () => ({ success: true, data: originalGuide })
  });
  window.VMODataService = {
    getLatestAiGuide: async () => persisted ? {
      _id: savedId,
      aiGuide: originalGuide,
      aiGuideAdminEdited: false
    } : null,
    updateAiGuide: async (...args) => {
      updateCalls.push(args);
      return { _id: savedId, aiGuide: args[1], solutionContent: args[2] };
    },
    submitSolution: async (...args) => {
      submitCalls.push(args);
      return { _id: savedId };
    }
  };
  window.eval(engineSource);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  const button = window.document.querySelector('.btn-ai-guide');
  await window.openAIGuide(button);
  const panel = window.document.querySelector('.ai-guide-panel');
  return { window, panel, problemId: panel.id.replace('ai-panel-', ''), updateCalls, submitCalls };
}

const saved = await createHarness({ role: 'admin', persisted: true });
assert.ok(saved.panel.querySelector('.btn-ai-guide-edit'), 'admin phải thấy nút chỉnh sửa');
saved.window.editAIGuideContent(saved.problemId);
assert.equal(saved.panel.querySelectorAll('.ai-guide-source-editor').length, 4,
  'phải có bốn vùng chỉnh sửa nội dung nguồn Markdown/LaTeX');
saved.panel.querySelector('[data-guide-editor="solution"]').value = 'Lời giải đã sửa với $x^2 \\ge 0$.';
assert.equal(saved.window.applyAIGuideEdits(saved.problemId), true);
assert.equal(saved.panel.querySelectorAll('.ai-guide-source-editor').length, 0, 'áp dụng phải trở lại bản xem trước');
assert.match(saved.panel.querySelector('[data-guide-field="solution"] .ai-section-content').textContent, /Lời giải đã sửa/);
assert.equal(saved.panel.querySelector('.ai-guide-quality-badge'), null,
  'chỉnh nội dung phải bỏ huy hiệu kiểm định AI cũ');
assert.ok(saved.panel.querySelector('.ai-guide-admin-edited-badge'));
await saved.window.saveAIGuideToDatabase(saved.problemId, 'Đại số');
assert.equal(saved.updateCalls.length, 1, 'bản ghi đã lưu phải cập nhật theo _id');
assert.equal(saved.updateCalls[0][0], savedId);
assert.match(saved.updateCalls[0][1].solution, /x\^2/);
assert.equal(saved.submitCalls.length, 0, 'không được tạo/upsert nhầm bản ghi mới khi đã có _id');

const fresh = await createHarness({ role: 'admin', persisted: false });
fresh.window.editAIGuideContent(fresh.problemId);
fresh.panel.querySelector('[data-guide-editor="knowledge"]').value = 'Kiến thức admin đã sửa.';
await fresh.window.saveAIGuideToDatabase(fresh.problemId, 'Đại số');
assert.equal(fresh.submitCalls.length, 1, 'bản chưa lưu phải đi qua luồng lưu AI Guide hiện hữu');
assert.equal(fresh.submitCalls[0][5].aiGuideAdminEdited, true);
assert.equal(fresh.submitCalls[0][5].aiGuide.knowledge, 'Kiến thức admin đã sửa.');

const member = await createHarness({ role: 'student', persisted: true });
assert.equal(member.panel.querySelector('.btn-ai-guide-edit'), null, 'thành viên không được thấy chức năng chỉnh sửa');

const apiSource = fs.readFileSync(new URL('../api/data.js', import.meta.url), 'utf8');
assert.match(apiSource, /if \(action === 'update_ai_guide'\)[\s\S]*submissionKind: 'ai_guide'/,
  'API phải cập nhật đúng bản ghi AI Guide');
assert.match(apiSource, /if \(!requireAdmin\(session, res\)\) return;[\s\S]*action === 'update_ai_guide'/,
  'API cập nhật AI Guide phải nằm sau cổng quyền admin');

console.log('Admin AI Guide content editor: OK');

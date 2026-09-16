/**
 * VMO DATA SERVICE — MongoDB Atlas qua Vercel API.
 * Mọi quyền truy cập được kiểm tra lại ở server; trình duyệt không kết nối DB trực tiếp.
 */

async function request(resource, params = {}) {
  const query = new URLSearchParams({ resource });
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') query.set(key, value);
  });
  const response = await fetch(`/api/data?${query}`, { credentials: 'same-origin', cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Không thể đọc dữ liệu MongoDB');
  return data.items || [];
}

async function mutate(action, payload = {}) {
  const response = await fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ action, payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Không thể cập nhật dữ liệu MongoDB');
  return data.item || true;
}

function normalize(item) {
  if (!item) return item;
  return { ...item, id: item.id || item._id };
}

export async function syncUserProfile(user) { return user || null; }

export async function getAllUsers() {
  const result = await window.VMOAuth?.listUsers?.();
  if (!result?.success) throw new Error(result?.message || 'Không thể đọc danh sách tài khoản');
  return result.users || [];
}

export async function getDocuments(topicFilter = null) {
  return (await request('documents', { topic: topicFilter })).map(normalize);
}

export async function addDocument(docData) { return normalize(await mutate('add_document', docData)); }
export async function deleteDocument(id) { return mutate('delete_document', { id }); }

export async function getExams(categoryFilter = null) {
  return (await request('exams', { category: categoryFilter })).map(normalize);
}

export async function addExam(examData) { return normalize(await mutate('add_exam', examData)); }

export async function getProblemsByExam(examId) {
  return (await request('problems', { examId })).map(normalize);
}

export async function saveProblem(problemData) { return normalize(await mutate('save_problem', problemData)); }

export async function submitSolution(problemId, problemTitle, solutionContent, evaluation = null, hasImage = false) {
  return normalize(await mutate('submit_solution', { problemId, problemTitle, solutionContent, evaluation, hasImage }));
}

export async function getSubmissionsForProblem(problemId) {
  return (await request('submissions', { problemId })).map(normalize);
}

export async function getAllSubmissions() {
  return (await request('submissions')).map(normalize);
}

export async function getEvents() { return (await request('events')).map(normalize); }
export async function addEvent(eventData) { return normalize(await mutate('add_event', eventData)); }
export async function deleteEvent(id) { return mutate('delete_event', { id }); }

window.VMODataService = {
  syncUserProfile,
  getAllUsers,
  getDocuments,
  addDocument,
  deleteDocument,
  getExams,
  addExam,
  getProblemsByExam,
  saveProblem,
  submitSolution,
  getSubmissionsForProblem,
  getAllSubmissions,
  getEvents,
  addEvent,
  deleteEvent
};

console.log('[VMODataService] MongoDB Atlas API sẵn sàng');

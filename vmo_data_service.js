/**
 * VMO DATA SERVICE — MongoDB Atlas qua Vercel API.
 *
 * Trình duyệt chỉ giao tiếp với /api/data. Mọi kiểm tra phiên đăng nhập,
 * phân quyền và truy cập MongoDB đều được thực hiện tại server.
 * File này không sử dụng Firebase/Firestore.
 */

const DATA_API_URL = '/api/data';
const REQUEST_TIMEOUT_MS = 30_000;
const READ_CACHE_TTL_MS = 5 * 60_000;
const readCache = new Map();
const inflightReads = new Map();

function createServiceError(message, status = 0, code = '') {
  const error = new Error(message);
  error.name = 'VMODataServiceError';
  error.status = status;
  error.code = code;
  return error;
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    throw createServiceError(
      text || `Máy chủ trả về dữ liệu không hợp lệ (HTTP ${response.status})`,
      response.status,
      'INVALID_RESPONSE'
    );
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') {
    throw createServiceError(
      `Không đọc được phản hồi từ máy chủ (HTTP ${response.status})`,
      response.status,
      'INVALID_JSON'
    );
  }

  if (!response.ok || data.success !== true) {
    const code = response.status === 401
      ? 'AUTH_REQUIRED'
      : response.status === 403
        ? 'FORBIDDEN'
        : 'API_ERROR';

    throw createServiceError(
      data.error || data.message || `Yêu cầu thất bại (HTTP ${response.status})`,
      response.status,
      code
    );
  }

  return data;
}

async function apiFetch(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    return await parseResponse(response);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createServiceError(
        'Máy chủ phản hồi quá chậm. Vui lòng thử lại.',
        0,
        'TIMEOUT'
      );
    }

    if (error?.name === 'VMODataServiceError') throw error;

    throw createServiceError(
      error?.message || 'Không thể kết nối tới API MongoDB',
      0,
      'NETWORK_ERROR'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function invalidateReadCache() {
  readCache.clear();
  inflightReads.clear();
}

async function cachedApiFetch(url, ttlMs = READ_CACHE_TTL_MS) {
  const now = Date.now();
  const cached = readCache.get(url);
  if (cached && now - cached.storedAt < ttlMs) return cached.data;
  if (inflightReads.has(url)) return inflightReads.get(url);

  const pending = apiFetch(url)
    .then(data => {
      readCache.set(url, { data, storedAt: Date.now() });
      return data;
    })
    .finally(() => inflightReads.delete(url));
  inflightReads.set(url, pending);
  return pending;
}

async function request(resource, params = {}) {
  const query = new URLSearchParams({ resource });

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });

  const data = await cachedApiFetch(`${DATA_API_URL}?${query.toString()}`);
  return Array.isArray(data.items) ? data.items : [];
}

async function requestPage(resource, params = {}) {
  const query = new URLSearchParams({ resource });
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  });
  const data = await apiFetch(`${DATA_API_URL}?${query.toString()}`);
  return {
    items: normalizeList(Array.isArray(data.items) ? data.items : []),
    pagination: data.pagination || { page: 1, limit: 10, total: 0, pages: 1 }
  };
}

async function mutate(action, payload = {}) {
  const data = await apiFetch(DATA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });

  // Mutation thành công có thể làm thay đổi catalog hoặc dữ liệu quản trị.
  invalidateReadCache();

  return data.item ?? true;
}

function normalizeId(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.$oid === 'string') return value.$oid;
  return String(value);
}

function normalize(item) {
  if (!item || typeof item !== 'object') return item;

  const mongoId = normalizeId(item._id);
  return {
    ...item,
    id: item.id || mongoId,
    _id: mongoId || item._id
  };
}

function normalizeList(items) {
  return items.map(normalize);
}

/**
 * Hồ sơ người dùng được quản lý qua /api/auth.
 * Hàm này được giữ lại để tương thích với mã giao diện cũ.
 */
export async function syncUserProfile(user) {
  return user || null;
}

export async function getAllUsers() {
  if (!window.VMOAuth?.listUsers) {
    throw createServiceError(
      'Dịch vụ quản lý tài khoản chưa sẵn sàng',
      0,
      'AUTH_SERVICE_UNAVAILABLE'
    );
  }

  const result = await window.VMOAuth.listUsers();
  if (!result?.success) {
    throw createServiceError(
      result?.message || result?.error || 'Không thể đọc danh sách tài khoản',
      result?.status || 0,
      'USER_LIST_ERROR'
    );
  }

  return Array.isArray(result.users) ? result.users : [];
}

export async function getDocuments(topicFilter = null) {
  return normalizeList(await request('documents', { topic: topicFilter }));
}

export async function addDocument(documentData) {
  return normalize(await mutate('add_document', documentData));
}

export async function deleteDocument(id) {
  return mutate('delete_document', { id: normalizeId(id) });
}

export async function getExams(categoryFilter = null) {
  return normalizeList(await request('exams', { category: categoryFilter }));
}

export async function addExam(examData) {
  return normalize(await mutate('add_exam', examData));
}

export async function createExamFromOcr(examData) {
  return normalize(await mutate('create_exam_from_ocr', examData));
}

export async function getExamCatalog(category = 'tst-national') {
  const exams = normalizeList(await request('exam_catalog', { category }));
  return exams.map(exam => ({
    ...exam,
    problems: normalizeList(Array.isArray(exam.problems) ? exam.problems : [])
  }));
}

export async function saveExamImage(examId, pageNumber, image) {
  return normalize(await mutate('save_exam_image', { examId: normalizeId(examId), pageNumber, image }));
}

export async function getExamImage(examId, pageNumber = 1) {
  const items = await request('exam_image', { examId: normalizeId(examId), pageNumber });
  return items[0] || null;
}

export async function getProblemsByExam(examId) {
  return normalizeList(await request('problems', { examId }));
}

export async function getContentSets(group = null) {
  return normalizeList(await request('content_sets', { group }));
}

export async function getCatalogProblems(filters = {}) {
  return normalizeList(await request('problems', {
    setId: filters.setId,
    sourceGroup: filters.sourceGroup,
    contentKey: filters.contentKey,
    view: filters.runtime ? 'runtime' : ''
  }));
}

export async function getCatalogRules() {
  return normalizeList(await request('problems', { catalogRules: 1 }));
}

export async function upsertContentCatalog(catalog) {
  return mutate('upsert_content_catalog', {
    sets: Array.isArray(catalog?.sets) ? catalog.sets : [],
    problems: Array.isArray(catalog?.problems) ? catalog.problems : []
  });
}

export async function updateCatalogItem(itemType, id, changes = {}) {
  return normalize(await mutate('update_catalog_item', { itemType, id, ...changes }));
}

export async function getContentRevisions(problemId) {
  return normalizeList(await request('content_revisions', { problemId }));
}

export async function updateCatalogContent(id, contentData = {}) {
  return normalize(await mutate('update_catalog_content', { id, ...contentData }));
}

export async function migrateTstReferenceLinks(sourceMap = {}) {
  return normalize(await mutate('migrate_tst_reference_links', { sourceMap }));
}

export async function updateProblemReferenceLinks(contentKey, referenceLinks = []) {
  return normalize(await mutate('update_problem_reference_links', { contentKey, referenceLinks }));
}

export async function restoreCatalogRevision(revisionId) {
  return normalize(await mutate('restore_catalog_revision', { revisionId }));
}

export async function saveProblem(problemData) {
  return normalize(await mutate('save_problem', problemData));
}

export async function submitSolution(
  problemId,
  problemTitle,
  solutionContent,
  evaluation = null,
  solutionImage = '',
  problemContext = {}
) {
  const cleanProblemId = String(problemId ?? '').trim();
  const cleanSolution = String(solutionContent ?? '').trim();
  const cleanImage = String(solutionImage ?? '').trim();

  if (!cleanProblemId) {
    throw createServiceError('Thiếu mã bài toán', 0, 'VALIDATION_ERROR');
  }

  if (!cleanSolution && !cleanImage) {
    throw createServiceError('Vui lòng nhập nội dung hoặc tải ảnh bài giải', 0, 'VALIDATION_ERROR');
  }

  return normalize(await mutate('submit_solution', {
    problemId: cleanProblemId,
    problemKey: String(problemContext?.problemKey ?? cleanProblemId).trim(),
    setId: normalizeId(problemContext?.setId).trim(),
    setTitle: String(problemContext?.setTitle ?? '').trim(),
    sourceType: String(problemContext?.sourceType ?? '').trim(),
    sourceGroup: String(problemContext?.sourceGroup ?? '').trim(),
    topic: String(problemContext?.topic ?? '').trim(),
    problemContent: String(problemContext?.problemContent ?? '').trim(),
    problemTitle: String(problemTitle ?? '').trim(),
    solutionContent: cleanSolution,
    evaluation: evaluation && typeof evaluation === 'object' ? evaluation : null,
    solutionImage: cleanImage
  }));
}

export async function getSubmissionImage(submissionId) {
  const cleanId = normalizeId(submissionId).trim();
  if (!cleanId) {
    throw createServiceError('Thiếu mã bài nộp', 0, 'VALIDATION_ERROR');
  }
  const items = await request('submission_image', { submissionId: cleanId });
  return items[0] || null;
}

export async function getSubmissionsForProblem(problemId) {
  return normalizeList(await request('submissions', { problemId }));
}

export async function getAllSubmissions() {
  return normalizeList(await request('submissions'));
}

export async function getSubmissionsPage(filters = {}) {
  return requestPage('submissions', {
    paged: 1,
    page: filters.page || 1,
    limit: filters.limit || 10,
    q: filters.q,
    username: filters.username,
    sourceGroup: filters.sourceGroup,
    evaluation: filters.evaluation,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo
  });
}

export async function deleteSubmission(id) {
  const cleanId = normalizeId(id).trim();
  if (!cleanId) {
    throw createServiceError('Thiếu mã bài nộp', 0, 'VALIDATION_ERROR');
  }
  return mutate('delete_submission', { id: cleanId });
}

export async function getEvents() {
  return normalizeList(await request('events'));
}

export async function addEvent(eventData) {
  return normalize(await mutate('add_event', eventData));
}

export async function deleteEvent(id) {
  return mutate('delete_event', { id: normalizeId(id) });
}

const VMODataService = Object.freeze({
  syncUserProfile,
  getAllUsers,
  getDocuments,
  addDocument,
  deleteDocument,
  getExams,
  addExam,
  createExamFromOcr,
  getExamCatalog,
  saveExamImage,
  getExamImage,
  getProblemsByExam,
  getContentSets,
  getCatalogProblems,
  getCatalogRules,
  upsertContentCatalog,
  updateCatalogItem,
  getContentRevisions,
  updateCatalogContent,
  migrateTstReferenceLinks,
  updateProblemReferenceLinks,
  restoreCatalogRevision,
  saveProblem,
  submitSolution,
  getSubmissionImage,
  getSubmissionsForProblem,
  getAllSubmissions,
  getSubmissionsPage,
  deleteSubmission,
  getEvents,
  addEvent,
  deleteEvent
});

window.VMODataService = VMODataService;
window.invalidateVMODataCache = invalidateReadCache;

console.info('[VMODataService] MongoDB Atlas API đã sẵn sàng');

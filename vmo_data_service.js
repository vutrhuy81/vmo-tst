/**
 * VMO DATA SERVICE â€” MongoDB Atlas qua Vercel API.
 *
 * TrÃ¬nh duyá»‡t chá»‰ giao tiáº¿p vá»›i /api/data. Má»i kiá»ƒm tra phiÃªn Ä‘Äƒng nháº­p,
 * phÃ¢n quyá»n vÃ  truy cáº­p MongoDB Ä‘á»u Ä‘Æ°á»£c thá»±c hiá»‡n táº¡i server.
 * File nÃ y khÃ´ng sá»­ dá»¥ng Firebase/Firestore.
 */

const DATA_API_URL = '/api/data';
const REQUEST_TIMEOUT_MS = 30_000;

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
      text || `MÃ¡y chá»§ tráº£ vá» dá»¯ liá»‡u khÃ´ng há»£p lá»‡ (HTTP ${response.status})`,
      response.status,
      'INVALID_RESPONSE'
    );
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') {
    throw createServiceError(
      `KhÃ´ng Ä‘á»c Ä‘Æ°á»£c pháº£n há»“i tá»« mÃ¡y chá»§ (HTTP ${response.status})`,
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
      data.error || data.message || `YÃªu cáº§u tháº¥t báº¡i (HTTP ${response.status})`,
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
        'MÃ¡y chá»§ pháº£n há»“i quÃ¡ cháº­m. Vui lÃ²ng thá»­ láº¡i.',
        0,
        'TIMEOUT'
      );
    }

    if (error?.name === 'VMODataServiceError') throw error;

    throw createServiceError(
      error?.message || 'KhÃ´ng thá»ƒ káº¿t ná»‘i tá»›i API MongoDB',
      0,
      'NETWORK_ERROR'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request(resource, params = {}) {
  const query = new URLSearchParams({ resource });

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });

  const data = await apiFetch(`${DATA_API_URL}?${query.toString()}`);
  return Array.isArray(data.items) ? data.items : [];
}

async function mutate(action, payload = {}) {
  const data = await apiFetch(DATA_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });

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
 * Há»“ sÆ¡ ngÆ°á»i dÃ¹ng Ä‘Æ°á»£c quáº£n lÃ½ qua /api/auth.
 * HÃ m nÃ y Ä‘Æ°á»£c giá»¯ láº¡i Ä‘á»ƒ tÆ°Æ¡ng thÃ­ch vá»›i mÃ£ giao diá»‡n cÅ©.
 */
export async function syncUserProfile(user) {
  return user || null;
}

export async function getAllUsers() {
  if (!window.VMOAuth?.listUsers) {
    throw createServiceError(
      'Dá»‹ch vá»¥ quáº£n lÃ½ tÃ i khoáº£n chÆ°a sáºµn sÃ ng',
      0,
      'AUTH_SERVICE_UNAVAILABLE'
    );
  }

  const result = await window.VMOAuth.listUsers();
  if (!result?.success) {
    throw createServiceError(
      result?.message || result?.error || 'KhÃ´ng thá»ƒ Ä‘á»c danh sÃ¡ch tÃ i khoáº£n',
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

export async function getProblemsByExam(examId) {
  return normalizeList(await request('problems', { examId }));
}

export async function saveProblem(problemData) {
  return normalize(await mutate('save_problem', problemData));
}

export async function submitSolution(
  problemId,
  problemTitle,
  solutionContent,
  evaluation = null,
  hasImage = false
) {
  const cleanProblemId = String(problemId ?? '').trim();
  const cleanSolution = String(solutionContent ?? '').trim();

  if (!cleanProblemId) {
    throw createServiceError('Thiáº¿u mÃ£ bÃ i toÃ¡n', 0, 'VALIDATION_ERROR');
  }

  if (!cleanSolution) {
    throw createServiceError('Ná»™i dung bÃ i giáº£i khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng', 0, 'VALIDATION_ERROR');
  }

  return normalize(await mutate('submit_solution', {
    problemId: cleanProblemId,
    problemTitle: String(problemTitle ?? '').trim(),
    solutionContent: cleanSolution,
    evaluation: evaluation && typeof evaluation === 'object' ? evaluation : null,
    hasImage: Boolean(hasImage)
  }));
}

export async function getSubmissionsForProblem(problemId) {
  return normalizeList(await request('submissions', { problemId }));
}

export async function getAllSubmissions() {
  return normalizeList(await request('submissions'));
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
  getProblemsByExam,
  saveProblem,
  submitSolution,
  getSubmissionsForProblem,
  getAllSubmissions,
  getEvents,
  addEvent,
  deleteEvent
});

window.VMODataService = VMODataService;

console.info('[VMODataService] MongoDB Atlas API Ä‘Ã£ sáºµn sÃ ng');

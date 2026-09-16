/**
 * VMO DATA SERVICE (Firebase Cloud Firestore Integration)
 * Quản lý lưu trữ bền vững: Users, Documents, Exams, Problems, Submissions, Events
 * Hệ thống Ôn luyện VMO Đà Nẵng 2026 - 2027
 */

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  serverTimestamp, 
  onSnapshot 
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

// Đảm bảo truy cập db từ window.VMOFirebase
function getDB() {
  if (window.VMOFirebase && window.VMOFirebase.db) {
    return window.VMOFirebase.db;
  }
  console.warn('[VMODataService] Firebase Firestore chưa sẵn sàng');
  return null;
}

// -------------------------------------------------------------
// 1. TÀI KHOẢN NGƯỜI DÙNG (USERS)
// -------------------------------------------------------------
export async function syncUserProfile(user) {
  const db = getDB();
  if (!db || !user || !user.uid) return null;

  try {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    const isAdmin = (user.email === 'vutrhuy81@gmail.com');
    const existingRole = userSnap.exists() ? userSnap.data().role : null;
    const finalRole = isAdmin ? 'admin' : (existingRole || user.role || 'student');

    const profileData = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.name || user.username || 'Thành viên VMO',
      username: user.username || (user.email ? user.email.split('@')[0] : 'user'),
      photoURL: user.photoURL || '',
      role: finalRole,
      authProvider: user.authProvider || 'google',
      lastLoginAt: new Date().toISOString()
    };

    if (!userSnap.exists()) {
      profileData.createdAt = new Date().toISOString();
    }

    await setDoc(userRef, profileData, { merge: true });
    return profileData;
  } catch (err) {
    console.error('[VMODataService] Lỗi đồng bộ user profile:', err);
    return null;
  }
}

export async function getAllUsers() {
  const db = getDB();
  if (!db) return [];
  try {
    const usersCol = collection(db, 'users');
    const snap = await getDocs(usersCol);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[VMODataService] Lỗi lấy danh sách người dùng:', err.message);
    return [];
  }
}

// -------------------------------------------------------------
// 2. TÀI LIỆU CHUYÊN ĐỀ (DOCUMENTS)
// -------------------------------------------------------------
export async function getDocuments(topicFilter = null) {
  const db = getDB();
  if (!db) return [];
  try {
    const docsCol = collection(db, 'documents');
    let q = query(docsCol, orderBy('createdAt', 'desc'));
    if (topicFilter && topicFilter !== 'all') {
      q = query(docsCol, where('topic', '==', topicFilter), orderBy('createdAt', 'desc'));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[VMODataService] Lỗi lấy danh sách tài liệu:', err.message);
    return [];
  }
}

export async function addDocument(docData) {
  const db = getDB();
  if (!db) throw new Error('Firestore chưa kết nối');
  const user = window.VMOFirebase?.auth?.currentUser;
  const docRef = await addDoc(collection(db, 'documents'), {
    title: docData.title,
    topic: docData.topic || 'Tổng hợp',
    author: docData.author || 'Tổ Toán VMO Đà Nẵng',
    description: docData.description || '',
    fileUrl: docData.fileUrl || '',
    chapter: docData.chapter || '',
    createdById: user ? user.uid : 'admin',
    createdAt: new Date().toISOString()
  });
  return { id: docRef.id, ...docData };
}

export async function deleteDocument(docId) {
  const db = getDB();
  if (!db) throw new Error('Firestore chưa kết nối');
  await deleteDoc(doc(db, 'documents', docId));
  return true;
}

// -------------------------------------------------------------
// 3. ĐỀ THI (EXAMS)
// -------------------------------------------------------------
export async function getExams(categoryFilter = null) {
  const db = getDB();
  if (!db) return [];
  try {
    const examsCol = collection(db, 'exams');
    let q = query(examsCol, orderBy('createdAt', 'desc'));
    if (categoryFilter && categoryFilter !== 'all') {
      q = query(examsCol, where('category', '==', categoryFilter));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[VMODataService] Lỗi lấy danh sách đề thi:', err.message);
    return [];
  }
}

export async function addExam(examData) {
  const db = getDB();
  if (!db) throw new Error('Firestore chưa kết nối');
  const user = window.VMOFirebase?.auth?.currentUser;
  const examRef = doc(collection(db, 'exams'), examData.id || undefined);
  const data = {
    title: examData.title,
    category: examData.category || 'vmo-danang',
    year: examData.year || '2026-2027',
    day: examData.day || 'Ngày 1',
    province: examData.province || 'Đà Nẵng',
    duration: Number(examData.duration || 180),
    description: examData.description || '',
    sourceUrl: examData.sourceUrl || '',
    createdById: user ? user.uid : 'admin',
    createdAt: new Date().toISOString()
  };
  await setDoc(examRef, data);
  return { id: examRef.id, ...data };
}

// -------------------------------------------------------------
// 4. CÂU HỎI BÀI TOÁN (PROBLEMS)
// -------------------------------------------------------------
export async function getProblemsByExam(examId) {
  const db = getDB();
  if (!db) return [];
  try {
    const pCol = collection(db, 'problems');
    const q = query(pCol, where('examId', '==', examId), orderBy('orderNumber', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[VMODataService] Lỗi lấy danh sách câu hỏi:', err.message);
    return [];
  }
}

export async function saveProblem(problemData) {
  const db = getDB();
  if (!db) throw new Error('Firestore chưa kết nối');
  const user = window.VMOFirebase?.auth?.currentUser;
  const pRef = doc(db, 'problems', problemData.id);
  const data = {
    id: problemData.id,
    examId: problemData.examId,
    orderNumber: Number(problemData.orderNumber || 1),
    title: problemData.title,
    topic: problemData.topic || 'Đại số',
    content: problemData.content,
    officialSolution: problemData.officialSolution || '',
    maxScore: Number(problemData.maxScore || 5.0),
    createdById: user ? user.uid : 'admin',
    updatedAt: new Date().toISOString()
  };
  await setDoc(pRef, data, { merge: true });
  return data;
}

// -------------------------------------------------------------
// 5. BÀI NỘP / LỜI GIẢI CỦA HỌC SINH (SUBMISSIONS)
// -------------------------------------------------------------
export async function submitSolution(problemId, problemTitle, solutionContent, evaluation = null, hasImage = false) {
  const db = getDB();
  if (!db) throw new Error('Cơ sở dữ liệu chưa sẵn sàng');
  const session = window.VMOAuth?.getSession() || {};
  const user = window.VMOFirebase?.auth?.currentUser;
  const uid = user ? user.uid : (session.uid || ('local_' + (session.username || 'user')));

  const subCol = collection(db, 'submissions');

  const subData = {
    problemId,
    problemTitle: problemTitle || '',
    userId: uid,
    authorName: session.name || (user?.displayName) || session.username || 'Học sinh VMO',
    authorEmail: (user?.email) || session.username || '',
    solutionContent: (solutionContent || '').trim(),
    hasImage: Boolean(hasImage),
    status: evaluation ? (evaluation.verdict || 'evaluated') : 'submitted',
    verdictLabel: evaluation ? (evaluation.verdictLabel || '') : '',
    score: evaluation ? (evaluation.estimatedScore || null) : null,
    evaluation: evaluation || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const ref = await addDoc(subCol, subData);
  return { id: ref.id, ...subData };
}

export async function getSubmissionsForProblem(problemId) {
  const db = getDB();
  if (!db) return [];
  const user = window.VMOFirebase?.auth?.currentUser;
  if (!user) return [];

  try {
    const subCol = collection(db, 'submissions');
    // Lấy bài nộp của chính người dùng này cho bài toán tương ứng
    const q = query(
      subCol, 
      where('problemId', '==', problemId), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[VMODataService] Lỗi lấy bài nộp cá nhân:', err.message);
    return [];
  }
}

export async function getAllSubmissions() {
  const db = getDB();
  if (!db) return [];
  try {
    const subCol = collection(db, 'submissions');
    const q = query(subCol, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[VMODataService] Lỗi lấy danh sách tất cả bài nộp:', err.message);
    return [];
  }
}

// -------------------------------------------------------------
// 6. SỰ KIỆN & LỊCH THI (EVENTS)
// -------------------------------------------------------------
export async function getEvents() {
  const db = getDB();
  if (!db) return [];
  try {
    const evtCol = collection(db, 'events');
    const q = query(evtCol, orderBy('startDate', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[VMODataService] Lỗi lấy danh sách sự kiện:', err.message);
    return [];
  }
}

export async function addEvent(evtData) {
  const db = getDB();
  if (!db) throw new Error('Firestore chưa kết nối');
  const user = window.VMOFirebase?.auth?.currentUser;
  const evtRef = await addDoc(collection(db, 'events'), {
    title: evtData.title,
    eventType: evtData.eventType || 'exam',
    startDate: evtData.startDate,
    endDate: evtData.endDate || '',
    location: evtData.location || 'THPT Chuyên Lê Quý Đôn - Đà Nẵng',
    description: evtData.description || '',
    targetAudience: evtData.targetAudience || 'Đội tuyển HSG QG Toán',
    createdById: user ? user.uid : 'admin',
    createdAt: new Date().toISOString()
  });
  return { id: evtRef.id, ...evtData };
}

export async function deleteEvent(eventId) {
  const db = getDB();
  if (!db) throw new Error('Firestore chưa kết nối');
  await deleteDoc(doc(db, 'events', eventId));
  return true;
}

// Gán toàn cục window để gọi từ các module giao diện
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

console.log('[VMODataService] Khởi tạo thành công mô-đun dữ liệu Firestore cho VMO');

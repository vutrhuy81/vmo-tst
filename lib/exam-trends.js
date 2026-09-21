import { historicalExams } from '../data/exam-prediction-history.js';

export const TREND_TOPICS = Object.freeze([
  'Dãy số và Giới hạn dãy số',
  'Phương trình hàm',
  'Số học và dãy số',
  'Hình học phẳng',
  'Đa thức',
  'Tổ hợp'
]);

const schoolYear = /^20\d{2}-20\d{2}$/;
const normalized = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

export function trendAnalysisSettings(input = {}) {
  const mode = input.mode === 'year' ? 'year' : input.mode === 'target' ? 'target' : '';
  const year = String(input.year || '').trim();
  const start = Number(year.slice(0, 4));
  if (!mode || !schoolYear.test(year) || Number(year.slice(5)) !== start + 1 || start < 2015 || start > 2040) {
    throw new Error('Phạm vi hoặc năm học phân tích không hợp lệ.');
  }
  if (mode === 'year') return { mode, year, start, targetType: 'tst', lookback: 0, anchor: '', province: '' };

  const targetType = input.targetType === 'vmo' ? 'vmo' : input.targetType === 'tst' ? 'tst' : '';
  const lookback = Number(input.lookback);
  const anchor = targetType === 'vmo' ? 'vmo-official' : String(input.targetAnchor || '').trim();
  const province = String(input.province || '').trim().slice(0, 120);
  if (!targetType || !Number.isInteger(lookback) || lookback < 1 || lookback > 15 ||
      (targetType === 'tst' && (!/^tst-[a-z0-9-]{2,80}$/.test(anchor) || !province))) {
    throw new Error('Loại đề, đơn vị hoặc số năm dữ liệu tham chiếu không hợp lệ.');
  }
  return { mode, year, start, targetType, lookback, anchor, province };
}

export function classifyTrendTopic(topic) {
  const value = normalized(topic);
  if (/phuong trinh ham/.test(value)) return TREND_TOPICS[1];
  if (/da thuc/.test(value)) return TREND_TOPICS[4];
  if (/hinh hoc|hinh phang|duong tron|tam giac|tu giac/.test(value)) return TREND_TOPICS[3];
  if (/to hop|tro choi|do thi|to mau|bang o|cuc tri|xau nhi phan/.test(value)) return TREND_TOPICS[5];
  // Nhãn có "Số học" được ưu tiên vào nhóm số học, kể cả bài có dãy số nguyên.
  if (/so hoc|dong du|so nguyen|nguyen to|chia het|diophant/.test(value)) return TREND_TOPICS[2];
  if (/day so|gioi han|truy hoi|hoi tu/.test(value)) return TREND_TOPICS[0];
  return '';
}

function isOwnTarget(item, settings) {
  if (settings.targetType === 'vmo') return item.category === 'vmo';
  return (item.category === 'tst' && item.anchor === settings.anchor) ||
    (item.category === 'regional' && normalized(item.province) === normalized(settings.province));
}

function sourceKey(item) {
  return `${item.category}:${item.anchor || normalized(item.province)}:${item.year}:${item.dayNumber || 0}`;
}

export function selectTrendEvidence(settings, databaseExams = []) {
  const unique = new Map();
  [...historicalExams, ...databaseExams]
    .filter(item => item?.year && Array.isArray(item.problems) && item.problems.length && item.origin !== 'prediction')
    .forEach(item => unique.set(sourceKey(item), item));
  const all = Array.from(unique.values());
  const selected = settings.mode === 'year'
    ? all.filter(item => item.category === 'tst' && item.year === settings.year)
    : all.filter(item => isOwnTarget(item, settings) &&
      Number(item.year.slice(0, 4)) >= settings.start - settings.lookback &&
      Number(item.year.slice(0, 4)) < settings.start);

  selected.sort((a, b) => b.year.localeCompare(a.year) || String(a.province).localeCompare(String(b.province), 'vi'));
  const counts = new Map(TREND_TOPICS.map(topic => [topic, 0]));
  const labels = new Map(TREND_TOPICS.map(topic => [topic, new Map()]));
  let otherQuestionCount = 0;
  const samples = [];
  selected.forEach(exam => {
    exam.problems.forEach((problem, index) => {
      const category = classifyTrendTopic(problem.topic);
      if (category) {
        counts.set(category, counts.get(category) + 1);
        const raw = String(problem.topic || category).trim().slice(0, 120);
        labels.get(category).set(raw, (labels.get(category).get(raw) || 0) + 1);
      } else otherQuestionCount += 1;
      if (samples.length < 160) samples.push({
        sourceId: `${exam.anchor || normalized(exam.province)}:${exam.year}:${exam.dayNumber || 0}:${problem.number || index + 1}`,
        year: exam.year,
        unit: String(exam.province || (exam.category === 'vmo' ? 'VMO' : '')).slice(0, 120),
        title: String(exam.title || '').slice(0, 240),
        questionNumber: Number(problem.number || problem.questionNumber || index + 1),
        rawTopic: String(problem.topic || 'Chưa phân loại').slice(0, 120),
        criterion: category || 'Ngoài 6 tiêu chí',
        excerpt: String(problem.excerpt || problem.content || '').replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ').trim().slice(0, 600)
      });
    });
  });
  const questionCount = selected.reduce((total, exam) => total + exam.problems.length, 0);
  const topicStats = TREND_TOPICS.map(topic => ({
    topic,
    questionCount: counts.get(topic),
    prevalencePercent: questionCount ? Number((counts.get(topic) * 100 / questionCount).toFixed(1)) : 0,
    rawLabels: Array.from(labels.get(topic), ([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi')).slice(0, 12)
  }));
  return {
    mode: settings.mode, year: settings.year, requestedYears: settings.lookback,
    years: [...new Set(selected.map(item => item.year))].sort().reverse(),
    examCount: selected.length, questionCount, otherQuestionCount,
    unitCount: new Set(selected.map(item => normalized(item.province || item.anchor))).size,
    topicStats,
    sources: selected.slice(0, 80).map(item => ({
      year: item.year, unit: item.province || (item.category === 'vmo' ? 'VMO' : ''),
      title: item.title, source: item.source, questionCount: item.problems.length
    })),
    samples
  };
}

export function normalizeTrendReport(report, evidence) {
  const supplied = new Map((Array.isArray(report?.topicTrends) ? report.topicTrends : [])
    .map(item => [String(item?.topic || ''), item]));
  const topicTrends = evidence.topicStats.map(stat => {
    const item = supplied.get(stat.topic) || {};
    const methods = (Array.isArray(item.frequentMethods) ? item.frequentMethods : []).slice(0, 12).map(method => ({
      name: String(method?.name || '').trim().slice(0, 240),
      frequency: Math.max(0, Math.min(stat.questionCount, Number(method?.frequency) || 0)),
      evidenceIds: (Array.isArray(method?.evidenceIds) ? method.evidenceIds : []).slice(0, 12)
        .map(value => String(value || '').slice(0, 180)).filter(Boolean),
      note: String(method?.note || '').trim().slice(0, 1600)
    })).filter(method => method.name);
    return {
      topic: stat.topic,
      questionCount: stat.questionCount,
      prevalencePercent: stat.prevalencePercent,
      trendLevel: String(item.trendLevel || (stat.questionCount ? 'Có xuất hiện' : 'Chưa ghi nhận')).slice(0, 80),
      observations: String(item.observations || '').trim().slice(0, 4000),
      frequentMethods: methods
    };
  });
  return {
    title: String(report?.title || 'Phân tích xu hướng ra đề').trim().slice(0, 300),
    executiveSummary: String(report?.executiveSummary || '').trim().slice(0, 6000),
    topicTrends,
    recurringPatterns: (Array.isArray(report?.recurringPatterns) ? report.recurringPatterns : []).slice(0, 20).map(item => ({
      pattern: String(item?.pattern || '').trim().slice(0, 300),
      frequency: Math.max(0, Number(item?.frequency) || 0),
      evidenceIds: (Array.isArray(item?.evidenceIds) ? item.evidenceIds : []).slice(0, 15)
        .map(value => String(value || '').slice(0, 180)).filter(Boolean),
      analysis: String(item?.analysis || '').trim().slice(0, 2400)
    })).filter(item => item.pattern),
    unitInsights: (Array.isArray(report?.unitInsights) ? report.unitInsights : []).slice(0, 50).map(item => ({
      unit: String(item?.unit || '').trim().slice(0, 160),
      dominantTopics: (Array.isArray(item?.dominantTopics) ? item.dominantTopics : []).slice(0, 6)
        .map(value => String(value || '').slice(0, 160)),
      note: String(item?.note || '').trim().slice(0, 2000)
    })).filter(item => item.unit),
    limitations: (Array.isArray(report?.limitations) ? report.limitations : []).slice(0, 15)
      .map(value => String(value || '').trim().slice(0, 1200)).filter(Boolean),
    conclusion: String(report?.conclusion || '').trim().slice(0, 5000)
  };
}

export function approvedTrendReview(review) {
  return review?.approved === true && Number(review.score) >= 4 && Number(review.score) <= 5 &&
    review.countsConsistent === true && review.evidenceFaithful === true &&
    review.sixTopicsCovered === true && review.noUnsupportedClaims === true &&
    Array.isArray(review.criticalIssues) && review.criticalIssues.length === 0 &&
    Array.isArray(review.topicChecks) && review.topicChecks.length === TREND_TOPICS.length &&
    TREND_TOPICS.every((topic, index) => review.topicChecks[index]?.topic === topic && review.topicChecks[index]?.valid === true);
}

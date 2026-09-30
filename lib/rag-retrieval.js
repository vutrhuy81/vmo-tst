import { ObjectId } from 'mongodb';
import { getDb } from './db.js';
import { contentHash, mathText, mathTags, topicOf, constraints, compatible, fuseRanks, sourceFresh, referenceBlock, RAG_VERSION } from './rag-core.js';
import { resolveProblem } from './rag-store.js';
import { embedText, embeddingConfig } from './rag-embedding.js';

async function visibleProblem(db, problem, session) {
  if (!problem || problem.status !== 'published' || problem.allowAiEvaluation === false) return false;
  if (problem.setId && session?.role !== 'admin') {
    const id = ObjectId.isValid(String(problem.setId)) ? new ObjectId(String(problem.setId)) : problem.setId;
    const set = await db.collection('content_sets').findOne({ _id: id });
    if (!set || set.status !== 'published') return false;
  }
  return true;
}
function sourceItem(submission, problem, matchType, score = null) {
  return { sourceId: String(submission._id), problemKey: problem.contentKey || String(problem._id),
    problemContentHash: contentHash(problem.content), solutionContentHash: contentHash(submission.solutionContent),
    matchType, fusionScore: score, statement: mathText(problem.content).slice(0, 6000),
    content: mathText(submission.solutionContent).slice(0, 16000),
    truncated: mathText(submission.solutionContent).length > 16000 };
}
export async function retrieveVerifiedContext({ problemRef, statement, topic, session, purpose = 'guide' },
  { db: suppliedDb, embed = embedText, now = () => performance.now() } = {}) {
  const started = now();
  const db = suppliedDb || await getDb();
  const logId = new ObjectId();
  const warnings = [];
  const sources = [];
  let mode = 'none'; let usage = { tokens: 0, estimatedUsd: 0 }; let rejected = 0;
  const problem = await resolveProblem(db, problemRef);
  if (problem && !await visibleProblem(db, problem, session)) return { blocked: true };
  const canonicalStatement = problem?.content || statement;
  const canonicalTopic = problem?.topic || topic;
  // Exact requires registered identity AND a current snapshot; never match on title.
  if (problem) {
    if (problem.referenceSolutionVerified === true && problem.referenceSolution?.trim() &&
        problem.referenceSolutionProblemHash === contentHash(problem.content)) {
      sources.push({ sourceId: String(problem._id), sourceCollection: 'problems', problemKey: problem.contentKey || String(problem._id),
        problemContentHash: contentHash(problem.content), matchType: 'exact', statement: mathText(problem.content).slice(0, 6000),
        content: mathText(problem.referenceSolution).slice(0, 16000), truncated: mathText(problem.referenceSolution).length > 16000 });
    } else {
      const keys = [...new Set([problem.contentKey, problem.id, String(problem._id), problemRef].filter(Boolean))];
      const candidates = await db.collection('submissions').find({ adminVerified: true, deletedAt: { $exists: false },
        $or: [{ problemKey: { $in: keys } }, { problemId: { $in: keys } }] }).sort({ adminVerifiedAt: -1 }).limit(20).toArray();
      for (const submission of candidates) {
        if (!submission.solutionContent?.trim() || !mathText(submission.problemSnapshot?.content) ||
            contentHash(submission.problemSnapshot.content) !== contentHash(canonicalStatement)) { rejected++; continue; }
        sources.push(sourceItem(submission, problem, 'exact')); break;
      }
    }
  }
  if (sources.length) mode = 'exact';
  else if (process.env.RAG_MODE !== 'exact' && mathText(canonicalStatement)) {
    const filter = { source: 'admin_verified', status: 'active' };
    const topicFilter = topicOf(canonicalTopic);
    if (topicFilter) filter.topic = topicFilter;
    const config = embeddingConfig();
    const queryTags = mathTags(`${canonicalStatement} ${canonicalTopic}`);
    const collection = db.collection('verified_knowledge');
    const vectorFilter = { ...filter, embeddingModel: config.model, embeddingDimensions: config.dimensions, embeddingVersion: RAG_VERSION };
    let vector = [], lexical = [], tagged = [];
    const tasks = [
      (async () => {
        // Avoid paying for query embeddings until at least one compatible indexed record exists.
        if (!await collection.findOne(vectorFilter, { projection: { _id: 1 } })) return;
        const result = await embed(`${mathText(canonicalStatement).slice(0, 6000)}\n${canonicalTopic || ''}`);
        usage = { tokens: result.tokens, estimatedUsd: result.estimatedUsd };
        vector = await collection.aggregate([{ $vectorSearch: { index: 'rag_vector_v1', path: 'embedding', queryVector: result.vector,
          numCandidates: 200, limit: 30, filter: vectorFilter } }, { $project: { embedding: 0, searchText: 0 } }], { maxTimeMS: 2500 }).toArray();
      })(),
      (async () => {
        lexical = await collection.aggregate([{ $search: { index: 'rag_text_v1', compound: {
          filter: Object.entries(filter).map(([path, value]) => ({ equals: { path, value } })),
          must: [{ text: { path: 'searchText', query: mathText(canonicalStatement).slice(0, 1500) } }]
        } } }, { $limit: 30 }, { $project: { embedding: 0, searchText: 0 } }], { maxTimeMS: 2500 }).toArray();
      })(),
      (async () => { if (queryTags.length) tagged = await collection.find({ ...filter, mathTags: { $in: queryTags } },
        { projection: { embedding: 0, searchText: 0 } }).limit(30).toArray(); })()
    ];
    const results = await Promise.allSettled(tasks);
    results.forEach((result, index) => { if (result.status === 'rejected') warnings.push(['vector_unavailable', 'text_unavailable', 'tags_unavailable'][index]); });
    const min = Math.max(0, Math.min(1, Number(process.env.RAG_MIN_TAG_OVERLAP) || 0.25));
    for (const doc of fuseRanks([vector, lexical, tagged])) {
      if (!compatible(constraints(canonicalStatement), doc.constraints)) { rejected++; continue; }
      const overlap = queryTags.length ? queryTags.filter(tag => doc.mathTags?.includes(tag)).length / queryTags.length : 0;
      // No magic vector threshold. Require a matching curated math tag until a
      // real labelled benchmark can calibrate broader semantic-only retrieval.
      if (!queryTags.length || overlap < min) { rejected++; continue; }
      const submission = await db.collection('submissions').findOne({ _id: doc.sourceId });
      const candidateProblem = await resolveProblem(db, String(doc.problemId));
      if (!sourceFresh(doc, submission, candidateProblem) || !await visibleProblem(db, candidateProblem, session)) { rejected++; continue; }
      if (candidateProblem._id && problem?._id && String(candidateProblem._id) === String(problem._id)) continue;
      if (sources.some(item => item.problemKey === doc.problemKey)) continue;
      sources.push(sourceItem(submission, candidateProblem, 'similar', doc.fusionScore));
      if (sources.length >= 3) break;
    }
    mode = sources.length ? 'hybrid' : 'none';
  }
  const elapsedMs = Math.round(now() - started);
  const provenance = sources.map(({ content, statement: sourceStatement, ...source }) => source);
  try {
    await db.collection('rag_retrieval_logs').insertOne({ _id: logId, createdAt: new Date(),
      username: session?.username, purpose, mode, queryHash: contentHash(canonicalStatement),
      sources: provenance, elapsedMs, embeddingTokens: usage.tokens, estimatedUsd: usage.estimatedUsd, rejected, warnings });
  } catch { warnings.push('retrieval_log_unavailable'); }
  return { statement: canonicalStatement, topic: canonicalTopic, content: sources.length ? referenceBlock(sources) : '',
    block: referenceBlock(sources), origin: mode === 'exact' ? 'admin_verified_exact' : mode === 'hybrid' ? 'admin_verified_similar' : '',
    sources, mode, retrieval: { id: String(logId), mode, sources: provenance, elapsedMs, embeddingTokens: usage.tokens,
      estimatedUsd: usage.estimatedUsd, warnings, rejected } };
}

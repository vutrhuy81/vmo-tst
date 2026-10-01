import { ObjectId } from 'mongodb';
import { contentHash, mathText, mathTags, constraints, topicOf, RAG_VERSION, EMBEDDING_VERSION, sourceFresh } from './rag-core.js';
import { embedText, embeddingConfig } from './rag-embedding.js';

export async function resolveProblem(db, ref) {
  if (!ref) return null;
  const filters = [{ contentKey: String(ref) }, { id: String(ref) }];
  if (ObjectId.isValid(String(ref))) filters.unshift({ _id: new ObjectId(String(ref)) });
  return db.collection('problems').findOne({ $or: filters });
}
export async function queueSource(db, sourceId) {
  const submission = await db.collection('submissions').findOne({ _id: sourceId });
  const status = submission?.adminVerified === true && !submission.deletedAt ? 'pending' : 'revoked';
  const existing = await db.collection('verified_knowledge').findOne({ sourceId });
  const config = embeddingConfig();
  let stillFresh = false;
  if (existing?.status === 'active' && existing.embeddingModel === config.model &&
      existing.embeddingDimensions === config.dimensions && existing.embeddingVersion === EMBEDDING_VERSION) {
    const problem = await resolveProblem(db, submission?.problemKey || submission?.problemId);
    stillFresh = sourceFresh(existing, submission, problem);
    if (stillFresh && existing.metadataVersion === RAG_VERSION) return;
  }
  // A metadata-only upgrade must not take a valid v1 reference offline while
  // preview processing is pending. V2 queries still exclude its old metadata.
  if (!stillFresh) await db.collection('verified_knowledge').updateOne({ sourceId }, { $set: { status, updatedAt: new Date() } });
  await db.collection('rag_index_jobs').updateOne({ sourceId }, {
    $set: { status, updatedAt: new Date(), attempts: 0, error: '', leaseUntil: new Date(0) },
    $setOnInsert: { createdAt: new Date() }
  }, { upsert: true });
}
export async function setupRag(db, searchIndexes = true) {
  await db.collection('verified_knowledge').createIndex({ sourceId: 1 }, { unique: true });
  await db.collection('verified_knowledge').createIndex({ status: 1, problemKey: 1, problemContentHash: 1 });
  await db.collection('rag_index_jobs').createIndex({ sourceId: 1 }, { unique: true });
  await db.collection('rag_index_jobs').createIndex({ status: 1, leaseUntil: 1, updatedAt: 1 });
  await db.collection('rag_query_embeddings').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection('rag_retrieval_logs').createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });
  if (searchIndexes) {
    const collection = db.collection('verified_knowledge');
    const existing = await collection.listSearchIndexes().toArray();
    const { dimensions } = embeddingConfig();
    const vector = existing.find(item => item.name === 'rag_vector_v1');
    const oldDimensions = vector?.latestDefinition?.fields?.find(field => field.type === 'vector')?.numDimensions;
    if (oldDimensions && oldDimensions !== dimensions) throw new Error('RAG_VECTOR_DIMENSIONS_CHANGED: cần tạo lại chỉ mục có kiểm soát');
    const requiredFields = [{ type: 'vector', path: 'embedding', numDimensions: dimensions, similarity: 'cosine' },
      ...['source', 'status', 'topic', 'embeddingModel', 'embeddingVersion', 'embeddingDimensions', 'metadataVersion', 'mathTags'].map(path => ({ type: 'filter', path }))];
    if (!vector) await collection.createSearchIndex({ name: 'rag_vector_v1', type: 'vectorSearch', definition: { fields: requiredFields } });
    else if (requiredFields.some(field => !vector.latestDefinition?.fields?.some(old => old.path === field.path))) {
      const fields = [...(vector.latestDefinition?.fields || [])];
      requiredFields.forEach(field => { if (!fields.some(old => old.path === field.path)) fields.push(field); });
      await collection.updateSearchIndex('rag_vector_v1', { ...vector.latestDefinition, fields });
    }
    const textIndex = existing.find(item => item.name === 'rag_text_v1');
    const fields = { searchText: { type: 'string', analyzer: 'lucene.standard' }, metadataVersion: { type: 'number' },
      ...Object.fromEntries(['source', 'status', 'topic', 'mathTags'].map(path => [path, { type: 'token' }])) };
    if (!textIndex) await collection.createSearchIndex({ name: 'rag_text_v1', definition: { mappings: { dynamic: false, fields } } });
    else if (!textIndex.latestDefinition?.mappings?.fields?.metadataVersion) {
      await collection.updateSearchIndex('rag_text_v1', { ...textIndex.latestDefinition,
        mappings: { ...textIndex.latestDefinition?.mappings, dynamic: false,
          fields: { ...textIndex.latestDefinition?.mappings?.fields, ...fields } } });
    }
  }
  return { success: true, dimensions: embeddingConfig().dimensions };
}
export async function backfillSources(db, limit = 100, after = '') {
  const filter = { adminVerified: true, solutionContent: { $type: 'string', $ne: '' }, deletedAt: { $exists: false } };
  if (after && ObjectId.isValid(after)) filter._id = { $gt: new ObjectId(after) };
  const items = await db.collection('submissions').find(filter, { projection: { _id: 1 } }).sort({ _id: 1 }).limit(limit).toArray();
  for (const item of items) await queueSource(db, item._id);
  return { queued: items.length, after: items.length ? String(items.at(-1)._id) : after, hasMore: items.length === limit };
}
export async function processRagJobs(db, limit = 3, embed = embedText) {
  const results = [];
  for (let index = 0; index < Math.min(3, limit); index++) {
    const now = new Date();
    const job = await db.collection('rag_index_jobs').findOneAndUpdate({
      $or: [{ status: { $in: ['pending', 'failed'] }, attempts: { $lt: 5 } }, { status: 'processing', leaseUntil: { $lt: now } }]
    }, { $set: { status: 'processing', leaseUntil: new Date(Date.now() + 60000) }, $inc: { attempts: 1 } },
    { sort: { updatedAt: 1 }, returnDocument: 'after' });
    if (!job) break;
    try {
      const submission = await db.collection('submissions').findOne({ _id: job.sourceId });
      const problem = await resolveProblem(db, submission?.problemKey || submission?.problemId);
      if (!submission?.adminVerified || submission.deletedAt || !submission.solutionContent?.trim() || !problem || problem.status !== 'published' ||
          !mathText(submission.problemSnapshot?.content) || contentHash(submission.problemSnapshot.content) !== contentHash(problem.content)) {
        await db.collection('verified_knowledge').updateOne({ sourceId: job.sourceId }, { $set: { status: 'revoked' } });
        await db.collection('rag_index_jobs').updateOne({ _id: job._id }, { $set: { status: 'revoked', error: 'SOURCE_NOT_CURRENT' } });
        results.push({ sourceId: String(job.sourceId), status: 'revoked' }); continue;
      }
      const topic = topicOf(problem.topic);
      const searchText = `${mathText(problem.content).slice(0, 3500)}\n${problem.topic || ''}\n${mathText(submission.solutionContent).slice(0, 6000)}`;
      const existing = await db.collection('verified_knowledge').findOne({ sourceId: job.sourceId });
      const config = embeddingConfig();
      const reused = existing?.searchText === searchText && existing.embeddingModel === config.model &&
        existing.embeddingDimensions === config.dimensions && Array.isArray(existing.embedding) &&
        existing.embedding.length === config.dimensions && existing.embedding.every(Number.isFinite);
      // Metadata/version upgrades do not require paying to embed identical input.
      const embedding = reused ? { ...config, vector: existing.embedding, tokens: 0, estimatedUsd: 0 } : await embed(searchText);
      // Accumulate paid indexing usage even if the source changed during the call.
      await db.collection('rag_index_jobs').updateOne({ _id: job._id }, { $inc: {
        embeddingTokens: embedding.tokens || 0,
        ...(embedding.estimatedUsd === null ? {} : { estimatedUsd: embedding.estimatedUsd || 0 })
      }, $set: { costConfigured: embedding.estimatedUsd !== null } });
      const doc = { source: 'admin_verified', sourceId: job.sourceId, sourceCollection: 'submissions',
        problemId: problem._id, problemKey: problem.contentKey || String(problem._id),
        problemContentHash: contentHash(problem.content), solutionContentHash: contentHash(submission.solutionContent),
        verifiedAt: submission.adminVerifiedAt, topic, mathTags: mathTags(searchText),
        constraints: constraints(problem.content), documentType: 'verified-reference', searchText,
        embedding: embedding.vector, embeddingModel: embedding.model, embeddingDimensions: embedding.dimensions,
        embeddingVersion: EMBEDDING_VERSION, metadataVersion: RAG_VERSION, embeddingTokens: reused ? existing.embeddingTokens : embedding.tokens,
        estimatedUsd: reused ? existing.estimatedUsd : embedding.estimatedUsd,
        status: 'active', indexedAt: new Date() };
      // Re-read after the paid call: revocation/content edits during indexing must win.
      const current = await db.collection('submissions').findOne({ _id: job.sourceId });
      const currentProblem = await resolveProblem(db, doc.problemKey);
      if (!sourceFresh(doc, current, currentProblem)) throw new Error('SOURCE_CHANGED_DURING_INDEX');
      await db.collection('verified_knowledge').updateOne({ sourceId: job.sourceId }, { $set: doc }, { upsert: true });
      await db.collection('rag_index_jobs').updateOne({ _id: job._id }, { $set: { status: 'ready', error: '', updatedAt: new Date() } });
      results.push({ sourceId: String(job.sourceId), status: 'ready', reusedEmbedding: Boolean(reused), tokens: embedding.tokens, estimatedUsd: embedding.estimatedUsd });
    } catch (error) {
      await db.collection('rag_index_jobs').updateOne({ _id: job._id }, { $set: { status: 'failed', error: String(error.message).slice(0, 200), updatedAt: new Date() } });
      results.push({ sourceId: String(job.sourceId), status: 'failed', error: String(error.message).slice(0, 200) });
    }
  }
  return { results };
}

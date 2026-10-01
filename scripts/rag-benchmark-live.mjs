// Labelled corpus: [{name, problemRef, expectedSourceIds: ["submission ObjectId"]}]
import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { getDb } from '../lib/db.js';
import { resolveProblem } from '../lib/rag-store.js';
import { retrieveVerifiedContext } from '../lib/rag-retrieval.js';
const path = process.argv[2];
if (!path) { console.error('Usage: node scripts/rag-benchmark-live.mjs labelled-cases.json'); process.exit(1); }
try {
  const cases = JSON.parse(await fs.readFile(path, 'utf8'));
  if (!Array.isArray(cases) || !cases.length || cases.some(item => !item.problemRef || !Array.isArray(item.expectedSourceIds))) throw Error('Invalid labelled corpus');
  const db = await getDb();
  const observations = [];
  for (const test of cases) {
    const problem = await resolveProblem(db, test.problemRef);
    if (!problem) throw Error(`Unknown problem: ${test.problemRef}`);
    for (const mode of ['baseline', 'rag']) {
      const started = performance.now();
      let sourceIds, cost = 0, tokens = 0;
      if (mode === 'baseline') {
        const item = await db.collection('submissions').findOne({ problemKey: problem.contentKey,
          adminVerified: true, solutionContent: { $type: 'string', $ne: '' } }, { sort: { adminVerifiedAt: -1 } });
        sourceIds = item ? [String(item._id)] : [];
      } else {
        const result = await retrieveVerifiedContext({ problemRef: test.problemRef, statement: problem.content,
          topic: problem.topic, session: { role: 'admin', username: 'rag-benchmark' }, purpose: 'benchmark' }, { db });
        sourceIds = result.sources.map(item => item.sourceId);
        cost = result.retrieval.estimatedUsd; tokens = result.retrieval.embeddingTokens;
      }
      observations.push({ name: test.name || test.problemRef, mode, elapsedMs: performance.now() - started,
        sourceIds, expectedSourceIds: test.expectedSourceIds, embeddingTokens: tokens, estimatedUsd: cost });
    }
  }
  const percentile = (values, p) => values.sort((a,b) => a-b)[Math.ceil(values.length*p)-1];
  const metrics = Object.fromEntries(['baseline','rag'].map(mode => {
    const rows = observations.filter(item => item.mode === mode);
    const hits = rows.reduce((n,item) => n+item.sourceIds.filter(id => item.expectedSourceIds.includes(id)).length,0);
    const relevant = rows.reduce((n,item) => n+item.expectedSourceIds.length,0);
    const selected = rows.reduce((n,item) => n+item.sourceIds.length,0);
    return [mode,{ recallAt3: relevant ? hits/relevant : null, precision: selected ? hits/selected : null,
      p50Ms: percentile(rows.map(item=>item.elapsedMs),.5), p95Ms: percentile(rows.map(item=>item.elapsedMs),.95),
      embeddingTokens: rows.reduce((n,item)=>n+item.embeddingTokens,0),
      estimatedUsd: rows.some(item=>item.estimatedUsd===null) ? null : rows.reduce((n,item)=>n+item.estimatedUsd,0) }];
  }));
  console.log(JSON.stringify({ environment:'LIVE ATLAS RETRIEVAL; excludes AI solver/grader cost and latency', caseCount: cases.length, metrics, observations },null,2));
  process.exit(0);
} catch(error) { console.error(error.message); process.exit(1); }

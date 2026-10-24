// Standalone uploads belong to their uploader; exam catalogs keep existing access.
export function canAccessProblem(problem, session) {
  return problem?.sourceGroup !== 'math_support' || ['admin', 'teacher'].includes(session?.role) ||
    Boolean(session?.sub && String(problem.ownerId) === String(session.sub));
}
export function supportVisibility(session, groupField = 'sourceGroup') {
  return ['admin', 'teacher'].includes(session?.role) ? {} : { $or: [
    { [groupField]: { $ne: 'math_support' } }, { ownerId: String(session?.sub || '') }
  ] };
}

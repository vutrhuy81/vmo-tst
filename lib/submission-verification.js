function verificationError(message, status = 400, code = 'INVALID_SUBMISSION_VERIFICATION') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function buildSubmissionVerificationUpdate(session, submission, input = {}, now = new Date()) {
  if (session?.role !== 'admin') {
    throw verificationError('Chỉ quản trị viên được xác minh bài nộp', 403, 'ADMIN_REQUIRED');
  }
  if (!submission) {
    throw verificationError('Không tìm thấy bài nộp', 404, 'SUBMISSION_NOT_FOUND');
  }
  if (typeof input.verified !== 'boolean') {
    throw verificationError('Trạng thái xác minh không hợp lệ');
  }

  const verified = input.verified;
  const note = String(input.note || '').trim().slice(0, 1000);
  if (verified && !String(submission.solutionContent || '').trim()) {
    throw verificationError('Chỉ có thể xác minh bài nộp có lời giải văn bản để AI đối chiếu');
  }

  const timestamp = now instanceof Date ? now : new Date(now);
  const verifier = String(session.username || '').slice(0, 80);
  const verifierUserId = String(session.sub || '').slice(0, 120);
  const historyEntry = {
    action: verified ? 'verified' : 'revoked', verified, note,
    by: verifier, byUserId: verifierUserId, at: timestamp
  };

  return {
    verified,
    update: {
      $set: {
        adminVerified: verified,
        adminVerifiedBy: verified ? verifier : '',
        adminVerifiedByUserId: verified ? verifierUserId : '',
        adminVerifiedAt: verified ? timestamp : null,
        adminVerificationNote: note,
        adminVerificationUpdatedAt: timestamp,
        updatedAt: timestamp
      },
      $push: { adminVerificationHistory: { $each: [historyEntry], $slice: -50 } }
    },
    historyEntry
  };
}

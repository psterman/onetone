/**
 * Phase2.5 consult outcome — honest status split.
 * user_reported_resolved ≠ verified.
 */
(function (global) {
  'use strict';

  var OUTCOME = {
    HANDOFF_READY: 'handoff_ready',
    HANDOFF_ATTEMPTED: 'handoff_attempted',
    HANDOFF_PASTED: 'handoff_pasted',
    HANDOFF_FAILED: 'handoff_failed',
    HANDOFF_UNCONFIRMED: 'handoff_unconfirmed',
    USER_REPORTED_RESOLVED: 'user_reported_resolved',
    VERIFIED: 'verified'
  };

  function emptyRecord() {
    return {
      flowSkillId: null,
      conclusionLevel: 'problem_definition',
      outcome: null,
      handoffSnapshotId: null,
      userFeedback: null,
      verificationNotes: [],
      updatedAt: null
    };
  }

  function fromDeliveryReceipt(receipt) {
    receipt = receipt || {};
    var o = String(receipt.outcome || '');
    if (o === 'pasted_confirmed' || o === 'activated_confirmed') return OUTCOME.HANDOFF_PASTED;
    if (o === 'failed') return OUTCOME.HANDOFF_FAILED;
    if (o === 'attempted' || o === 'delivery_attempt') return OUTCOME.HANDOFF_ATTEMPTED;
    if (o === 'local_replied') return OUTCOME.HANDOFF_PASTED;
    return OUTCOME.HANDOFF_UNCONFIRMED;
  }

  /** User said "it's fixed" — never verified by itself. */
  function markUserReportedResolved(rec, note) {
    rec = rec || emptyRecord();
    rec.outcome = OUTCOME.USER_REPORTED_RESOLVED;
    rec.userFeedback = String(note || '用户反馈：已好了');
    rec.updatedAt = new Date().toISOString();
    return rec;
  }

  /**
   * verified only with traceable test / run observation / agent result material id.
   */
  function markVerified(rec, evidence) {
    rec = rec || emptyRecord();
    evidence = evidence || {};
    var kind = String(evidence.kind || '');
    var ok =
      kind === 'test' ||
      kind === 'run_observation' ||
      kind === 'agent_result' ||
      !!(evidence.materialId && evidence.traceable);
    if (!ok) {
      return { ok: false, reason: 'need_traceable_verification', record: rec };
    }
    rec.outcome = OUTCOME.VERIFIED;
    rec.verificationNotes = (rec.verificationNotes || []).concat([
      {
        kind: kind || 'agent_result',
        materialId: evidence.materialId || null,
        note: String(evidence.note || ''),
        at: new Date().toISOString()
      }
    ]);
    rec.updatedAt = new Date().toISOString();
    return { ok: true, record: rec };
  }

  function labelZh(outcome) {
    var map = {
      handoff_ready: '草稿已准备',
      handoff_attempted: '正在尝试投递',
      handoff_pasted: '已确认粘贴',
      handoff_failed: '投递失败',
      handoff_unconfirmed: '结果未确认',
      user_reported_resolved: '用户反馈已解决（未验证）',
      verified: '已验证'
    };
    return map[String(outcome || '')] || '进行中';
  }

  /** Forbidden marketing labels */
  function forbiddenStatusCopy(s) {
    return /诊断完成|已找到病因|已修复|根因已确定/.test(String(s || ''));
  }

  global.OneToneHomeConsultOutcome = {
    OUTCOME: OUTCOME,
    emptyRecord: emptyRecord,
    fromDeliveryReceipt: fromDeliveryReceipt,
    markUserReportedResolved: markUserReportedResolved,
    markVerified: markVerified,
    labelZh: labelZh,
    forbiddenStatusCopy: forbiddenStatusCopy
  };
})(typeof window !== 'undefined' ? window : globalThis);

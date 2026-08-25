/**
 * Agent status edge decisions — pure, no DOM.
 * sequence and timestamp stay separate (never collapsed into one number).
 */
(function (global) {
  'use strict';

  function normalizeStatus(state) {
    var next = String(state || 'idle').trim().toLowerCase() || 'idle';
    if (next === 'error') next = 'failed';
    return next;
  }

  function readSequence(row) {
    if (!row || typeof row !== 'object') return null;
    if (row.sequence != null && isFinite(Number(row.sequence))) return Number(row.sequence);
    if (row.seq != null && isFinite(Number(row.seq))) return Number(row.seq);
    return null;
  }

  function readTimestamp(row) {
    if (!row || typeof row !== 'object') return null;
    var ts = row.updatedAt != null ? row.updatedAt
      : row.updated_at != null ? row.updated_at
      : row.timestamp != null ? row.timestamp
      : row.ts;
    if (ts != null && isFinite(Number(ts))) return Number(ts);
    return null;
  }

  /**
   * @param {null|{status:string,sequence:number|null,timestamp:number|null,warmed:boolean}} prev
   * @param {string} nextStatus
   * @param {{sequence?:number|null,timestamp?:number|null}|null} meta
   */
  function decideAgentStatusEdge(prev, nextStatus, meta) {
    meta = meta || {};
    var status = normalizeStatus(nextStatus);
    var sequence = meta.sequence != null && isFinite(Number(meta.sequence)) ? Number(meta.sequence) : null;
    var timestamp = meta.timestamp != null && isFinite(Number(meta.timestamp)) ? Number(meta.timestamp) : null;

    function accept(stateChanged, memSeq, memTs) {
      return {
        accepted: true,
        stateChanged: !!stateChanged,
        nextMemory: {
          status: status,
          sequence: memSeq === undefined ? sequence : memSeq,
          timestamp: memTs === undefined ? timestamp : memTs,
          warmed: true
        }
      };
    }

    function reject() {
      return {
        accepted: false,
        stateChanged: false,
        nextMemory: prev
          ? {
              status: prev.status,
              sequence: prev.sequence != null ? prev.sequence : null,
              timestamp: prev.timestamp != null ? prev.timestamp : null,
              warmed: !!prev.warmed
            }
          : { status: status, sequence: sequence, timestamp: timestamp, warmed: false }
      };
    }

    if (!prev || !prev.warmed) {
      return accept(false);
    }

    var prevSeq = prev.sequence != null && isFinite(Number(prev.sequence)) ? Number(prev.sequence) : null;
    var prevTs = prev.timestamp != null && isFinite(Number(prev.timestamp)) ? Number(prev.timestamp) : null;
    var prevStatus = normalizeStatus(prev.status);

    // Idle clear must win over a sticky usage stamp after attention drops.
    // Still honor sequence monotonicity when both sides carry a seq.
    if (status === 'idle' && prevStatus !== 'idle') {
      if (sequence != null && prevSeq != null && sequence < prevSeq) {
        return reject();
      }
      return accept(true, sequence != null ? sequence : prevSeq, timestamp != null ? timestamp : prevTs);
    }

    if (sequence != null && prevSeq != null) {
      if (sequence < prevSeq) return reject();
      if (sequence === prevSeq) {
        if (prevStatus === status) {
          return accept(false, sequence, timestamp != null ? timestamp : prevTs);
        }
        // Same sequence, different status: reject to preserve monotonicity.
        return reject();
      }
      // sequence > prevSeq
      return accept(prevStatus !== status, sequence, timestamp);
    }

    // No usable sequence pair — timestamp path.
    if (sequence == null && timestamp != null && prevTs != null) {
      if (timestamp < prevTs) return reject();
      if (timestamp === prevTs) {
        if (prevStatus === status) return accept(false, prevSeq, timestamp);
        // Timestamp collision, different status: last-write-wins.
        return accept(true, prevSeq, timestamp);
      }
      return accept(prevStatus !== status, prevSeq, timestamp);
    }

    // No sequence/timestamp ordering — accept by receive order.
    if (prevStatus === status) {
      return accept(false, sequence != null ? sequence : prevSeq, timestamp != null ? timestamp : prevTs);
    }
    return accept(true, sequence != null ? sequence : prevSeq, timestamp != null ? timestamp : prevTs);
  }

  function metaFromRow(row) {
    return {
      sequence: readSequence(row),
      timestamp: readTimestamp(row)
    };
  }

  /**
   * Projection plan after focus sync + edge decide.
   * hidden=null means leave DOM visibility unchanged (stale reject).
   */
  function planAgentChipProjection(opts) {
    opts = opts || {};
    var accepted = !!opts.accepted;
    var stateChanged = !!opts.stateChanged;
    var lightsOn = !!opts.lightsOn;
    if (!accepted) {
      return { applyRow: false, hidden: null, applyStatusTip: false, playEdge: false };
    }
    return {
      applyRow: true,
      hidden: !lightsOn,
      applyStatusTip: lightsOn,
      playEdge: lightsOn && stateChanged
    };
  }

  global.OneToneAgentStatusEdge = {
    normalizeStatus: normalizeStatus,
    readSequence: readSequence,
    readTimestamp: readTimestamp,
    metaFromRow: metaFromRow,
    decideAgentStatusEdge: decideAgentStatusEdge,
    planAgentChipProjection: planAgentChipProjection
  };
})(typeof window !== 'undefined' ? window : globalThis);

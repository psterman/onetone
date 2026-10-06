/**
 * Versioned Agent control acceptance manifest (release data — not docs/real-provider).
 * Update status to "realVerified" only after C1/X* real evidence lands in a release.
 */
(function (global) {
  'use strict';
  global.OneToneAgentControlAcceptance = {
    schemaVersion: 1,
    release: '2026-10-05-ui-converge',
    providers: {
      claude: { status: 'pending', scenarios: ['C1'] },
      codex: { status: 'pending', scenarios: ['X1', 'X2', 'X3', 'X4'] },
      cursor: { status: 'notApplicable', reason: 'bestEffortOnly' }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

//! Provider owner identity — first authoritative witness wins; conflicts fail-closed.

use super::types::*;
use sha2::{Digest, Sha256};

pub(crate) fn session_key_from_provider(
    provider: SessionProvider,
    provider_session_id: &str,
) -> SessionKey {
    let mut hasher = Sha256::new();
    hasher.update(b"onetone-session-key");
    hasher.update(b"version:1");
    hasher.update(provider_tag(provider).as_bytes());
    hasher.update([0x1f]);
    hasher.update(provider_session_id.as_bytes());
    SessionKey(format!("sk1_{}", hex16(&hasher.finalize())))
}

pub(crate) fn session_key_from_source(
    provider: SessionProvider,
    source_id: &SourceId,
) -> SessionKey {
    let mut hasher = Sha256::new();
    hasher.update(b"onetone-session-key");
    hasher.update(b"version:1");
    hasher.update(provider_tag(provider).as_bytes());
    hasher.update([0x1f]);
    hasher.update(b"source-fallback");
    hasher.update([0x1f]);
    hasher.update(source_id.as_str().as_bytes());
    SessionKey(format!("sk1_{}", hex16(&hasher.finalize())))
}

fn provider_tag(p: SessionProvider) -> &'static str {
    match p {
        SessionProvider::Codex => "codex",
        SessionProvider::ClaudeCode => "claude_code",
    }
}

fn hex16(digest: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(32);
    for &b in digest.iter().take(16) {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0xf) as usize] as char);
    }
    out
}

/// Authoritative witness for owner establishment (plan §3).
#[derive(Debug, Clone)]
pub(crate) enum OwnerWitness {
    /// Codex/Claude Meta with session_id
    Meta { session_id: String },
    /// Claude non-sidechain Message with Located.session_id
    Message { session_id: String },
}

pub(crate) struct OwnerTracker {
    provider: SessionProvider,
    source_id: SourceId,
    owner: Option<String>,
    evidence: IdentityEvidence,
    conflict: bool,
}

impl OwnerTracker {
    pub(crate) fn new(provider: SessionProvider, source_id: SourceId) -> Self {
        Self {
            provider,
            source_id,
            owner: None,
            evidence: IdentityEvidence::SourceFallback,
            conflict: false,
        }
    }

    pub(crate) fn observe(&mut self, witness: Option<OwnerWitness>) {
        let Some(w) = witness else {
            return;
        };
        let id = match &w {
            OwnerWitness::Meta { session_id } | OwnerWitness::Message { session_id } => {
                session_id.clone()
            }
        };
        // Codex: only Meta establishes. Claude: Meta or non-sidechain Message.
        let authoritative = match self.provider {
            SessionProvider::Codex => matches!(w, OwnerWitness::Meta { .. }),
            SessionProvider::ClaudeCode => true,
        };
        if !authoritative {
            return;
        }
        match &self.owner {
            None => {
                self.owner = Some(id);
                self.evidence = IdentityEvidence::FirstAuthoritativeMeta;
            }
            Some(existing) if existing == &id => {
                self.evidence = IdentityEvidence::RepeatedRecord;
            }
            Some(_) => {
                self.conflict = true;
                self.evidence = IdentityEvidence::Conflict;
            }
        }
    }

    pub(crate) fn finish(self) -> SessionIdentity {
        if self.conflict {
            let key = match &self.owner {
                Some(id) => session_key_from_provider(self.provider, id),
                None => session_key_from_source(self.provider, &self.source_id),
            };
            return SessionIdentity {
                session_key: key,
                source: SessionKeySource::ProviderId,
                evidence: IdentityEvidence::Conflict,
                provider_session_id: self.owner,
                owner_conflict: true,
            };
        }
        match self.owner {
            Some(id) => SessionIdentity {
                session_key: session_key_from_provider(self.provider, &id),
                source: SessionKeySource::ProviderId,
                evidence: self.evidence,
                provider_session_id: Some(id),
                owner_conflict: false,
            },
            None => SessionIdentity {
                session_key: session_key_from_source(self.provider, &self.source_id),
                source: SessionKeySource::SourceFallback,
                evidence: IdentityEvidence::SourceFallback,
                provider_session_id: None,
                owner_conflict: false,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conflict_on_second_authoritative_id() {
        let sid = SourceId("ss1_test".into());
        let mut t = OwnerTracker::new(SessionProvider::ClaudeCode, sid);
        t.observe(Some(OwnerWitness::Message {
            session_id: "a".into(),
        }));
        t.observe(Some(OwnerWitness::Message {
            session_id: "b".into(),
        }));
        let id = t.finish();
        assert!(id.owner_conflict);
        assert_eq!(id.evidence, IdentityEvidence::Conflict);
    }

    #[test]
    fn codex_ignores_message_witness() {
        let sid = SourceId("ss1_test".into());
        let mut t = OwnerTracker::new(SessionProvider::Codex, sid.clone());
        t.observe(Some(OwnerWitness::Message {
            session_id: "from-msg".into(),
        }));
        let id = t.finish();
        assert!(!id.owner_conflict);
        assert_eq!(id.source, SessionKeySource::SourceFallback);
        assert_eq!(
            id.session_key,
            session_key_from_source(SessionProvider::Codex, &sid)
        );
    }
}

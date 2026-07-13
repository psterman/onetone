//! KWS keyword builder integration tests (lib has test=false on Windows).

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use onetone::voice_kws_keywords::{
    build_runtime_keywords_file, load_golden_keyword_map, load_kws_token_vocab,
    phrase_to_kws_tokens, RUNTIME_KEYWORDS_FILENAME,
};

fn model_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/kws/sherpa-kws-zh-small")
}

fn vocab_and_golden() -> (HashSet<String>, HashMap<String, Vec<String>>) {
    let dir = model_dir();
    let vocab = load_kws_token_vocab(&dir.join("tokens.txt")).expect("vocab");
    let golden_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources/kws/onetone-keywords.txt");
    let golden = load_golden_keyword_map(&golden_path).expect("golden");
    (vocab, golden)
}

#[test]
fn golden_phrase_matches_bundled_tokens() {
    let (vocab, golden) = vocab_and_golden();
    let tokens = phrase_to_kws_tokens("开始输入", &vocab, &golden).expect("tokens");
    assert_eq!(
        tokens,
        vec!["k", "āi", "sh", "ǐ", "sh", "ū", "r", "ù"]
            .into_iter()
            .map(String::from)
            .collect::<Vec<_>>()
    );
}

#[test]
fn summon_phrase_open_cursor_encodes() {
    let (vocab, golden) = vocab_and_golden();
    let tokens = phrase_to_kws_tokens("打开 Cursor", &vocab, &golden).expect("tokens");
    assert!(!tokens.is_empty());
    assert!(tokens.contains(&"d".to_string()));
    assert!(tokens.contains(&"c".to_string()));
}

#[test]
fn pure_english_phrase_skipped() {
    let (vocab, golden) = vocab_and_golden();
    assert!(phrase_to_kws_tokens("Open Cursor", &vocab, &golden).is_none());
}

#[test]
fn build_runtime_file_writes_keywords() {
    let dir = model_dir();
    let phrases = vec!["开始输入".into(), "打开 Cursor".into(), "Open Cursor".into()];
    let result = build_runtime_keywords_file(&dir, &phrases).expect("build");
    assert!(result.encoded.contains(&"开始输入".to_string()));
    assert!(result.skipped.contains(&"Open Cursor".to_string()));
    let runtime = dir.join(RUNTIME_KEYWORDS_FILENAME);
    assert!(runtime.is_file());
    let _ = std::fs::remove_file(runtime);
}

//! Dynamic sherpa-onnx KWS keywords file builder (token-aware, validated against tokens.txt).

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use pinyin::ToPinyin;

pub const RUNTIME_KEYWORDS_FILENAME: &str = "keywords.runtime.txt";

const MULTI_INITIALS: [&str; 3] = ["zh", "ch", "sh"];
const SINGLE_INITIALS: [char; 20] = [
    'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'z', 'c', 's', 'r', 'y',
    'w',
];

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct KwsKeywordBuildResult {
    pub encoded: Vec<String>,
    pub skipped: Vec<String>,
}

/// Load token symbols from model `tokens.txt` (first column, skip specials we don't need).
pub fn load_kws_token_vocab(tokens_path: &Path) -> Result<HashSet<String>, String> {
    let raw = std::fs::read_to_string(tokens_path).map_err(|e| format!("read tokens.txt: {e}"))?;
    let mut vocab = HashSet::new();
    for line in raw.lines() {
        let token = line.split_whitespace().next().unwrap_or("").trim();
        if token.is_empty() || token.starts_with('<') || token.starts_with('#') {
            continue;
        }
        vocab.insert(token.to_string());
    }
    if vocab.is_empty() {
        return Err("tokens.txt contained no usable tokens".into());
    }
    Ok(vocab)
}

/// Parse bundled `onetone-keywords.txt` lines into label → token sequence.
pub fn load_golden_keyword_map(path: &Path) -> Result<HashMap<String, Vec<String>>, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| format!("read golden keywords: {e}"))?;
    let mut map = HashMap::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((tokens_part, label)) = line.rsplit_once('@') else {
            continue;
        };
        let label = label.trim().to_string();
        if label.is_empty() {
            continue;
        }
        let tokens: Vec<String> = tokens_part
            .split_whitespace()
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect();
        if !tokens.is_empty() {
            map.insert(label, tokens);
        }
    }
    Ok(map)
}

fn bundled_golden_keywords_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/kws/onetone-keywords.txt")
}

fn split_initial_final(syllable: &str) -> Option<(Option<String>, String)> {
    let s = syllable.trim();
    if s.is_empty() {
        return None;
    }
    for prefix in MULTI_INITIALS {
        if let Some(rest) = s.strip_prefix(prefix) {
            if !rest.is_empty() {
                return Some((Some(prefix.to_string()), rest.to_string()));
            }
        }
    }
    let first = s.chars().next()?;
    if SINGLE_INITIALS.contains(&first) {
        let rest: String = s.chars().skip(1).collect();
        if !rest.is_empty() {
            return Some((Some(first.to_string()), rest));
        }
    }
    Some((None, s.to_string()))
}

fn syllable_to_tokens(syllable: &str, vocab: &HashSet<String>) -> Option<Vec<String>> {
    let s = syllable.trim();
    if s.is_empty() {
        return Some(Vec::new());
    }
    if vocab.contains(s) {
        return Some(vec![s.to_string()]);
    }
    let (init, fin) = split_initial_final(s)?;
    let mut out = Vec::new();
    if let Some(i) = init {
        if !vocab.contains(&i) {
            return None;
        }
        out.push(i);
    }
    if !fin.is_empty() {
        if !vocab.contains(&fin) {
            return None;
        }
        out.push(fin);
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

fn char_to_tokens(ch: char, vocab: &HashSet<String>) -> Option<Vec<String>> {
    if ch.is_ascii_alphabetic() {
        let t = ch.to_lowercase().to_string();
        return vocab.contains(&t).then(|| vec![t]);
    }
    if !is_cjk(ch) {
        return None;
    }
    let py = ch.to_pinyin()?;
    let syllable = py.with_tone().to_string();
    syllable_to_tokens(&syllable, vocab)
}

fn is_cjk(ch: char) -> bool {
    matches!(ch as u32, 0x3400..=0x9FFF | 0xF900..=0xFAFF)
}

pub fn phrase_to_kws_tokens(
    phrase: &str,
    vocab: &HashSet<String>,
    golden: &HashMap<String, Vec<String>>,
) -> Option<Vec<String>> {
    let label = phrase.trim();
    if label.is_empty() {
        return None;
    }
    if let Some(tokens) = golden.get(label) {
        if tokens.iter().all(|t| vocab.contains(t)) {
            return Some(tokens.clone());
        }
    }
    let has_cjk = label.chars().any(is_cjk);
    if !has_cjk {
        return None;
    }
    let mut out = Vec::new();
    for ch in label.chars() {
        if ch.is_whitespace() {
            continue;
        }
        let part = char_to_tokens(ch, vocab)?;
        out.extend(part);
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

pub fn format_kws_keyword_line(tokens: &[String], display_label: &str) -> String {
    let label = display_label
        .trim()
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect::<String>();
    format!("{} @{}", tokens.join(" "), label)
}

/// Write `keywords.runtime.txt` under `model_dir`. Returns phrases successfully encoded.
pub fn build_runtime_keywords_file(
    model_dir: &Path,
    phrases: &[String],
) -> Result<KwsKeywordBuildResult, String> {
    let tokens_path = model_dir.join("tokens.txt");
    if !tokens_path.is_file() {
        return Err(format!("tokens.txt missing: {}", tokens_path.display()));
    }
    let vocab = load_kws_token_vocab(&tokens_path)?;
    let golden_path = bundled_golden_keywords_path();
    let golden = if golden_path.is_file() {
        load_golden_keyword_map(&golden_path)?
    } else {
        HashMap::new()
    };

    let mut encoded = Vec::new();
    let mut skipped = Vec::new();
    let mut lines = Vec::new();

    for phrase in phrases {
        let label = phrase.trim();
        if label.is_empty() {
            continue;
        }
        match phrase_to_kws_tokens(label, &vocab, &golden) {
            Some(tokens) => {
                lines.push(format_kws_keyword_line(&tokens, label));
                encoded.push(label.to_string());
            }
            None => {
                skipped.push(label.to_string());
            }
        }
    }

    let out_path = model_dir.join(RUNTIME_KEYWORDS_FILENAME);
    if lines.is_empty() {
        let _ = std::fs::remove_file(&out_path);
        return Ok(KwsKeywordBuildResult { encoded, skipped });
    }

    let body = lines.join("\n") + "\n";
    std::fs::write(&out_path, body).map_err(|e| format!("write {}: {e}", out_path.display()))?;
    Ok(KwsKeywordBuildResult { encoded, skipped })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/kws/sherpa-kws-zh-small")
    }

    fn vocab_and_golden() -> (HashSet<String>, HashMap<String, Vec<String>>) {
        let dir = model_dir();
        let vocab = load_kws_token_vocab(&dir.join("tokens.txt")).expect("vocab");
        let golden = load_golden_keyword_map(&bundled_golden_keywords_path()).expect("golden");
        (vocab, golden)
    }

    #[test]
    fn beginner_golden_phrases_encode() {
        let (vocab, golden) = vocab_and_golden();
        for p in [
            "继续", "发送", "新建", "麦克风", "一声", "小助手", "说话", "新会话", "取消",
        ] {
            assert!(
                phrase_to_kws_tokens(p, &vocab, &golden).is_some(),
                "missing golden tokens for {p}"
            );
        }
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
        let phrases = vec![
            "开始输入".into(),
            "打开 Cursor".into(),
            "Open Cursor".into(),
        ];
        let result = build_runtime_keywords_file(&dir, &phrases).expect("build");
        assert!(result.encoded.contains(&"开始输入".to_string()));
        assert!(result.skipped.contains(&"Open Cursor".to_string()));
        let runtime = dir.join(RUNTIME_KEYWORDS_FILENAME);
        assert!(runtime.is_file());
        let _ = std::fs::remove_file(runtime);
    }

    #[test]
    fn empty_build_removes_stale_runtime_keywords() {
        let dir = model_dir();
        let runtime = dir.join(RUNTIME_KEYWORDS_FILENAME);
        std::fs::write(&runtime, "stale\n").expect("write stale");
        let result = build_runtime_keywords_file(&dir, &["Open Cursor".into()]).expect("build");
        assert!(result.encoded.is_empty());
        assert!(!runtime.exists());
    }

    #[test]
    fn keyword_label_removes_whitespace() {
        let line = format_kws_keyword_line(&["d".into(), "ǎ".into()], "打开 Cursor");
        assert_eq!(line, "d ǎ @打开Cursor");
    }
}

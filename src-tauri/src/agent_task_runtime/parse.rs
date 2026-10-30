//! Strict tool-call parsing — whitelist names/fields and depth.

use serde_json::Value;

pub const TOOL_NAMES: &[&str] = &[
    "inspect_workspace",
    "search_code",
    "read_file",
    "propose_changes",
    "apply_patch",
    "export_to_desktop",
    "run_check",
    "inspect_diff",
    "request_user_input",
    "finish",
];

#[derive(Debug, Clone)]
pub struct ToolCall {
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    NotJson,
    TooDeep,
    UnknownTool,
    InvalidArgs,
    UnsupportedShape,
}

impl ParseError {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NotJson => "not_json",
            Self::TooDeep => "too_deep",
            Self::UnknownTool => "unknown_tool",
            Self::InvalidArgs => "invalid_args",
            Self::UnsupportedShape => "unsupported_shape",
        }
    }

    pub fn retriable_format(&self) -> bool {
        matches!(self, Self::NotJson | Self::UnsupportedShape)
    }
}

fn depth(v: &Value, d: usize, max: usize) -> bool {
    if d > max {
        return false;
    }
    match v {
        Value::Array(a) => a.iter().all(|x| depth(x, d + 1, max)),
        Value::Object(o) => o.values().all(|x| depth(x, d + 1, max)),
        _ => true,
    }
}

/// Pull `{...}` containing `"tool"` / `"tool_calls"` out of chatty model prose.
fn extract_embedded_tool_json(raw: &str) -> Option<&str> {
    let bytes = raw.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'{' {
            i += 1;
            continue;
        }
        let mut depth = 0i32;
        let mut j = i;
        let mut in_str = false;
        let mut esc = false;
        while j < bytes.len() {
            let c = bytes[j];
            if in_str {
                if esc {
                    esc = false;
                } else if c == b'\\' {
                    esc = true;
                } else if c == b'"' {
                    in_str = false;
                }
            } else if c == b'"' {
                in_str = true;
            } else if c == b'{' {
                depth += 1;
            } else if c == b'}' {
                depth -= 1;
                if depth == 0 {
                    let slice = raw.get(i..j + 1)?;
                    if slice.contains("\"tool\"") || slice.contains("\"tool_calls\"") {
                        return Some(slice);
                    }
                    break;
                }
            }
            j += 1;
        }
        i += 1;
    }
    None
}

fn parse_tool_value(v: &Value, max_depth: usize) -> Result<Vec<ToolCall>, ParseError> {
    if !depth(v, 0, max_depth) {
        return Err(ParseError::TooDeep);
    }
    if let Some(arr) = v.get("tool_calls").and_then(|x| x.as_array()) {
        let mut out = Vec::new();
        for item in arr {
            out.push(parse_one_openai(item)?);
        }
        if out.is_empty() {
            return Err(ParseError::UnsupportedShape);
        }
        return Ok(out);
    }
    if let Some(name) = v.get("tool").and_then(|x| x.as_str()) {
        let args = v
            .get("arguments")
            .cloned()
            .unwrap_or(Value::Object(Default::default()));
        return Ok(vec![validate_call(name, args)?]);
    }
    if let Some(name) = v.get("name").and_then(|x| x.as_str()) {
        let args = v
            .get("arguments")
            .or_else(|| v.get("args"))
            .cloned()
            .unwrap_or(Value::Object(Default::default()));
        return Ok(vec![validate_call(name, args)?]);
    }
    Err(ParseError::UnsupportedShape)
}

/// Accept OpenAI-style tool_calls or a single `{ "tool": "...", "arguments": {} }`.
/// Also salvages a tool JSON object buried in natural-language prose.
pub fn parse_tool_calls(raw: &str, max_depth: usize) -> Result<Vec<ToolCall>, ParseError> {
    let trimmed = raw.trim();
    match serde_json::from_str::<Value>(trimmed) {
        Ok(v) => parse_tool_value(&v, max_depth),
        Err(_) => {
            let emb = extract_embedded_tool_json(trimmed).ok_or(ParseError::NotJson)?;
            let v: Value = serde_json::from_str(emb).map_err(|_| ParseError::NotJson)?;
            parse_tool_value(&v, max_depth)
        }
    }
}

/// True when raw is (or embeds) a parseable ATR tool call — used by drivers to reject chatty prose.
pub fn is_tool_json(raw: &str, max_depth: usize) -> bool {
    parse_tool_calls(raw, max_depth).is_ok()
}

fn parse_one_openai(item: &Value) -> Result<ToolCall, ParseError> {
    let name = item
        .get("function")
        .and_then(|f| f.get("name"))
        .and_then(|n| n.as_str())
        .or_else(|| item.get("name").and_then(|n| n.as_str()))
        .ok_or(ParseError::UnsupportedShape)?;
    let args_raw = item
        .get("function")
        .and_then(|f| f.get("arguments"))
        .cloned()
        .or_else(|| item.get("arguments").cloned())
        .unwrap_or(Value::Object(Default::default()));
    let args = match args_raw {
        Value::String(s) => serde_json::from_str(&s).map_err(|_| ParseError::InvalidArgs)?,
        other => other,
    };
    validate_call(name, args)
}

fn validate_call(name: &str, args: Value) -> Result<ToolCall, ParseError> {
    if !TOOL_NAMES.contains(&name) {
        return Err(ParseError::UnknownTool);
    }
    if !args.is_object() && !matches!(name, "inspect_workspace" | "inspect_diff" | "finish") {
        return Err(ParseError::InvalidArgs);
    }
    // run_check: only check_id allowed
    if name == "run_check" {
        let obj = args.as_object().ok_or(ParseError::InvalidArgs)?;
        if !obj.contains_key("check_id") {
            return Err(ParseError::InvalidArgs);
        }
        for k in obj.keys() {
            if k != "check_id" {
                return Err(ParseError::InvalidArgs);
            }
        }
    }
    Ok(ToolCall {
        name: name.to_string(),
        arguments: if args.is_null() {
            Value::Object(Default::default())
        } else {
            args
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_check_rejects_program_field() {
        let raw = r#"{"tool":"run_check","arguments":{"check_id":"noop_ok","program":"rm"}}"#;
        assert_eq!(parse_tool_calls(raw, 8).unwrap_err(), ParseError::InvalidArgs);
    }

    #[test]
    fn salvages_tool_json_buried_in_prose() {
        let raw = "让我先理解一下任务。\n{\"tool\":\"inspect_workspace\",\"arguments\":{}}\n好的。";
        let calls = parse_tool_calls(raw, 8).unwrap();
        assert_eq!(calls[0].name, "inspect_workspace");
    }

    #[test]
    fn pure_prose_is_not_json() {
        let raw = "让我理解这个任务。目标是写一个readme。先看看工作区结构。";
        assert_eq!(parse_tool_calls(raw, 8).unwrap_err(), ParseError::NotJson);
        assert!(!is_tool_json(raw, 8));
    }

    #[test]
    fn unknown_tool_rejected() {
        let raw = r#"{"tool":"bash","arguments":{}}"#;
        assert_eq!(parse_tool_calls(raw, 8).unwrap_err(), ParseError::UnknownTool);
    }
}

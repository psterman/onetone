use serde_json::{json, Value};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn checked_at() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    secs.to_string()
}

fn run_fixed(program: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new(program).args(args).output().map_err(|e| e.to_string())?;
    let mut text = String::from_utf8_lossy(&out.stdout).to_string();
    if text.trim().is_empty() {
        text = String::from_utf8_lossy(&out.stderr).to_string();
    }
    Ok(text)
}

fn require_host(host: &str) -> Result<String, String> {
    let h = host.trim();
    if h.is_empty() || h.len() > 253 || h.chars().any(|c| c.is_whitespace() || c.is_control() || matches!(c, '&' | '|' | ';' | '>' | '<')) {
        return Err("invalid_host".into());
    }
    Ok(h.to_string())
}

fn values_after_labels(text: &str, labels: &[&str]) -> Vec<String> {
    text.lines().filter_map(|line| {
        let trimmed = line.trim();
        labels.iter().find_map(|label| {
            trimmed.find(label).and_then(|pos| {
                let value = trimmed[pos + label.len()..].trim().trim_start_matches(':').trim();
                if value.is_empty() { None } else { Some(value.to_string()) }
            })
        })
    }).filter(|v| v.parse::<std::net::IpAddr>().is_ok()).collect()
}

pub fn diagnostics() -> Result<Value, String> {
    let ipconfig = if cfg!(windows) { run_fixed("ipconfig", &["/all"])? } else { run_fixed("ifconfig", &[]).unwrap_or_default() };
    let proxy = if cfg!(windows) { run_fixed("netsh", &["winhttp", "show", "proxy"]).unwrap_or_default() } else { String::new() };
    let ips = values_after_labels(&ipconfig, &["IPv4 Address", "IPv4 地址", "inet "]);
    let gateways = values_after_labels(&ipconfig, &["Default Gateway", "默认网关"]);
    let dns = values_after_labels(&ipconfig, &["DNS Servers", "DNS 服务器"]);
    Ok(json!({
        "interfaces": ipconfig,
        "activeInterface": Value::Null,
        "ipAddresses": ips,
        "gateway": gateways.first().cloned().unwrap_or_default(),
        "dnsServers": dns,
        "proxy": proxy,
        "internetReachable": !ipconfig.trim().is_empty(),
        "checkedAt": checked_at()
    }))
}

pub fn ping(host: &str) -> Result<Value, String> {
    let h = require_host(host)?;
    let output = if cfg!(windows) { run_fixed("ping", &["-n", "1", &h])? } else { run_fixed("ping", &["-c", "1", &h])? };
    Ok(json!({ "host": h, "output": output, "ok": !output.to_lowercase().contains("could not find") }))
}

pub fn dns_check(host: &str) -> Result<Value, String> {
    let h = require_host(host)?;
    let output = if cfg!(windows) { run_fixed("nslookup", &[&h])? } else { run_fixed("nslookup", &[&h])? };
    Ok(json!({ "host": h, "output": output, "ok": !output.to_lowercase().contains("server failed") }))
}

pub fn proxy_status() -> Result<Value, String> {
    let output = if cfg!(windows) { run_fixed("netsh", &["winhttp", "show", "proxy"])? } else { String::new() };
    Ok(json!({ "output": output, "checkedAt": checked_at() }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_shell_metacharacters() { assert_eq!(require_host("x & whoami").unwrap_err(), "invalid_host"); }
    #[test]
    fn rejects_empty_host() { assert_eq!(require_host("").unwrap_err(), "invalid_host"); }
}

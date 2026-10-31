//! SSRF guards for research fetch/search URLs.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use url::Url;

pub fn validate_public_http_url(raw: &str) -> Result<Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("empty_url".into());
    }
    let url = Url::parse(trimmed).map_err(|_| "invalid_url".to_string())?;
    let scheme = url.scheme();
    if scheme != "http" && scheme != "https" {
        return Err("ssrf_blocked: scheme".into());
    }
    let host = url.host_str().ok_or_else(|| "ssrf_blocked: no_host".to_string())?;
    let host_l = host.to_ascii_lowercase();
    if host_l == "localhost"
        || host_l.ends_with(".localhost")
        || host_l.ends_with(".local")
        || host_l == "0.0.0.0"
        || host_l == "[::]"
        || host_l == "[::1]"
        || host_l == "::1"
    {
        return Err("ssrf_blocked: localhost".into());
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_private_or_special(ip) {
            return Err("ssrf_blocked: private_ip".into());
        }
    } else if looks_like_literal_ip(&host_l) {
        return Err("ssrf_blocked: private_ip".into());
    }
    Ok(url)
}

fn looks_like_literal_ip(host: &str) -> bool {
    // Reject dotted decimals that parse as private after Url host quirks.
    host.parse::<Ipv4Addr>().ok().is_some_and(|ip| is_private_or_special(IpAddr::V4(ip)))
        || host
            .trim_matches(|c| c == '[' || c == ']')
            .parse::<Ipv6Addr>()
            .ok()
            .is_some_and(|ip| is_private_or_special(IpAddr::V6(ip)))
}

pub fn is_private_or_special(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || is_cgnat(v4)
                || is_benchmark(v4)
        }
        IpAddr::V6(v6) => {
            let seg0 = v6.segments()[0];
            v6.is_loopback()
                || v6.is_unspecified()
                || (seg0 & 0xfe00) == 0xfc00 // unique local
                || (seg0 & 0xffc0) == 0xfe80 // link-local
        }
    }
}

fn is_cgnat(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    o[0] == 100 && (o[1] & 0xc0) == 64
}

fn is_benchmark(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    o[0] == 198 && (o[1] == 18 || o[1] == 19)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_https_public() {
        assert!(validate_public_http_url("https://example.com/a").is_ok());
    }

    #[test]
    fn blocks_file_and_localhost() {
        assert!(validate_public_http_url("file:///etc/passwd").is_err());
        assert!(validate_public_http_url("http://localhost/x").is_err());
        assert!(validate_public_http_url("http://127.0.0.1/x").is_err());
        assert!(validate_public_http_url("http://192.168.1.1/x").is_err());
        assert!(validate_public_http_url("http://10.0.0.5/x").is_err());
        assert!(validate_public_http_url("http://[::1]/x").is_err());
    }
}

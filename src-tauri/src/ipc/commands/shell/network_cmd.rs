use serde_json::Value;

#[tauri::command]
pub fn cmd_network_diagnostics() -> Result<Value, String> {
    crate::network::diagnostics()
}

#[tauri::command]
pub fn cmd_network_ping(host: String) -> Result<Value, String> {
    crate::network::ping(&host)
}

#[tauri::command]
pub fn cmd_network_dns_check(host: String) -> Result<Value, String> {
    crate::network::dns_check(&host)
}

#[tauri::command]
pub fn cmd_network_proxy_status() -> Result<Value, String> {
    crate::network::proxy_status()
}

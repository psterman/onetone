fn main() {
  let key = std::env::args().nth(1).expect("key");
  let client = reqwest::blocking::Client::builder()
    .timeout(std::time::Duration::from_secs(15))
    .build()
    .expect("client");
  match client.get("https://api.deepseek.com/user/balance").bearer_auth(key).send() {
    Ok(r) => println!("status={} body={}", r.status(), r.text().unwrap_or_default().chars().take(180).collect::<String>()),
    Err(e) => println!("err={}", e),
  }
}

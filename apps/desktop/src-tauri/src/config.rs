pub fn api_url() -> &'static str {
    option_env!("KUKU_API_URL").unwrap_or(if cfg!(debug_assertions) {
        "http://localhost:8080"
    } else {
        "https://api.kuku.mom"
    })
}

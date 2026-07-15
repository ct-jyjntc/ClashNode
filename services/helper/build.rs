fn main() {
    let token = std::env::var("TOKEN").unwrap_or_default();
    println!("cargo:rustc-env=TOKEN={}", token);
    println!("cargo:rerun-if-env-changed=TOKEN");
}

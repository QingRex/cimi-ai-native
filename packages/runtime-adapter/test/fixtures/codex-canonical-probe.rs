#[path = "../../../../scripts/codex-appcontainer/canonicalize_windows.rs"]
mod compatible;
fn main() {
    let args: Vec<_> = std::env::args_os().collect();
    let path = std::path::Path::new(&args[1]);
    if args.get(2).is_some_and(|mode| mode == "invalid") {
        // SAFETY: This single-threaded PUBLIC fixture has not started threads.
        unsafe { std::env::set_var("CIMILOOP_CANONICAL_ROOT_HANDLES", "C=invalid") };
    }
    println!("PUBLIC read_denied={}", std::fs::read(path).is_err());
    let standard = std::fs::canonicalize(path);
    let failed = standard.as_ref().err().and_then(std::io::Error::raw_os_error);
    match standard.or_else(|error| compatible::after_error(path, error)) {
        Ok(value) => println!("PUBLIC canonical: {} ; standard_error={failed:?}", value.display()),
        Err(error) => { eprintln!("PUBLIC canonical error: {:?}", error.raw_os_error()); std::process::exit(1); }
    }
}

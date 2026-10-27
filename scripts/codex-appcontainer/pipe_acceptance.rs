// Acceptance harness for the SAME pipe module copied into the HTTP/WebSocket
// source plan. No login, model, application request or provider qualification.
mod pipe_windows;

use std::io;
use std::sync::Arc;

fn invalid() -> io::Error { io::Error::other("PUBLIC private pipe acceptance incomplete") }
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mode = std::env::args().nth(1).ok_or_else(invalid)?;
    if mode == "parse" {
        let path = r"\\.\pipe\CimiLoop.Codex.Egress.11111111111111111111111111111111";
        let policy = "original_named_pipe_tls/1.0.0";
        pipe_windows::parse(path.as_ref(), policy.as_ref(), "123".as_ref())?;
        for (name, selected, pid) in [
            (r"\\remote\pipe\CimiLoop.Codex.Egress.11111111111111111111111111111111", policy, "123"),
            (r"\\.\pipe\CimiLoop.Codex.Egress.1111111111111111111111111111111", policy, "123"),
            (r"\\.\pipe\CimiLoop.Codex.Egress.A1111111111111111111111111111111", policy, "123"),
            (path, "PUBLIC invalid policy", "123"), (path, policy, "0"),
            (path, policy, "0123"), (path, policy, "4294967296"),
        ] { if pipe_windows::parse(name.as_ref(), selected.as_ref(), pid.as_ref()).is_ok() { return Err(invalid().into()); } }
        println!("PUBLIC pipe configuration: 1 accepted, 7 refused");
        return Ok(());
    }
    if mode == "wrong_server" {
        let original = std::env::var("CIMILOOP_CODEX_EGRESS_SERVER_PID")?.parse::<u32>()?;
        // Windows-only single-thread harness; no other threads or environment
        // borrows exist. Production code never rewrites supervisor metadata.
        unsafe { std::env::set_var("CIMILOOP_CODEX_EGRESS_SERVER_PID", original.checked_add(1).ok_or_else(invalid)?.to_string()); }
    }
    let selected = pipe_windows::configuration()?.ok_or_else(invalid)?;
    if mode == "wrong_server" || mode == "host_denied" {
        if !pipe_windows::open(&selected, false).is_err_and(|error| error.kind() == io::ErrorKind::PermissionDenied) { return Err(invalid().into()); }
        println!("PUBLIC original pipe refused before TLS");
        return Ok(());
    }
    if mode != "tls" { return Err(invalid().into()); }
    let mut pipe = std::fs::File::from(pipe_windows::open(&selected, false)?);
    codex_utils_rustls_provider::ensure_rustls_crypto_provider();
    let native = rustls_native_certs::load_native_certs();
    let mut roots = rustls::RootCertStore::empty();
    let (accepted, _) = roots.add_parsable_certificates(native.certs);
    if accepted == 0 { return Err(invalid().into()); }
    let config = rustls::ClientConfig::builder().with_root_certificates(roots).with_no_client_auth();
    let name = rustls::pki_types::ServerName::try_from("chatgpt.com")?;
    let mut tls = rustls::ClientConnection::new(Arc::new(config), name)?;
    while tls.is_handshaking() { tls.complete_io(&mut pipe)?; }
    if tls.peer_certificates().is_none_or(|certs| certs.is_empty()) || tls.protocol_version().is_none() { return Err(invalid().into()); }
    println!("PUBLIC original Rust pipe TLS authenticated; application requests=0");
    Ok(())
}
fn main() { if run().is_err() { eprintln!("PUBLIC private pipe acceptance failed"); std::process::exit(1); } }

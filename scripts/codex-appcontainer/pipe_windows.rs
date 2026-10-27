// Shared by the fixed HTTP and WebSocket source patches. Transport metadata
// only: never read a login file, request body, token or user configuration.
use std::ffi::{OsStr, OsString, c_void};
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};

const POLICY: &str = "original_named_pipe_tls/1.0.0";
const PREFIX: &str = r"\\.\pipe\CimiLoop.Codex.Egress.";

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct Configuration {
    pub(crate) path: OsString,
    server_pid: u32,
}

fn denied() -> io::Error {
    io::Error::new(io::ErrorKind::PermissionDenied, "original private model pipe unavailable")
}

pub(crate) fn parse(path: &OsStr, policy: &OsStr, server: &OsStr) -> io::Result<Configuration> {
    let path_text = path.to_str().ok_or_else(denied)?;
    let suffix = path_text.strip_prefix(PREFIX).ok_or_else(denied)?;
    let pid = server.to_str().ok_or_else(denied)?;
    if policy != OsStr::new(POLICY)
        || suffix.len() != 32
        || !suffix.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        || pid.is_empty()
        || pid.starts_with('0')
        || !pid.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(denied());
    }
    let server_pid = pid.parse::<u32>().map_err(|_| denied())?;
    if server_pid == 0 {
        return Err(denied());
    }
    Ok(Configuration { path: path.to_owned(), server_pid })
}

pub(crate) fn configuration() -> io::Result<Option<Configuration>> {
    let path = std::env::var_os("CIMILOOP_CODEX_EGRESS_PIPE");
    let policy = std::env::var_os("CIMILOOP_CODEX_EGRESS_POLICY");
    let server = std::env::var_os("CIMILOOP_CODEX_EGRESS_SERVER_PID");
    match (path, policy, server) {
        (None, None, None) => Ok(None),
        (Some(path), Some(policy), Some(server)) => parse(&path, &policy, &server).map(Some),
        _ => Err(denied()),
    }
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateFileW(name: *const u16, access: u32, share: u32, security: *const c_void,
                   creation: u32, flags: u32, template: *mut c_void) -> *mut c_void;
    fn GetNamedPipeServerProcessId(pipe: *mut c_void, pid: *mut u32) -> i32;
    fn GetHandleInformation(handle: *mut c_void, flags: *mut u32) -> i32;
    fn GetCurrentProcess() -> *mut c_void;
}
#[link(name = "advapi32")]
unsafe extern "system" {
    fn OpenProcessToken(process: *mut c_void, access: u32, token: *mut *mut c_void) -> i32;
    fn GetTokenInformation(token: *mut c_void, class: u32, data: *mut c_void,
                           length: u32, returned: *mut u32) -> i32;
}

fn appcontainer() -> io::Result<()> {
    let mut raw = std::ptr::null_mut();
    if unsafe { OpenProcessToken(GetCurrentProcess(), 8, &mut raw) } == 0 {
        return Err(io::Error::last_os_error());
    }
    if raw.is_null() || raw as isize == -1 {
        return Err(denied());
    }
    let token = unsafe { OwnedHandle::from_raw_handle(raw) };
    let mut value = 0_u32;
    let mut returned = 0_u32;
    if unsafe { GetTokenInformation(token.as_raw_handle(), 29, (&mut value as *mut u32).cast(),
                                   4, &mut returned) } == 0
    {
        return Err(io::Error::last_os_error());
    }
    if value != 1 || returned != 4 {
        return Err(denied());
    }
    Ok(())
}

pub(crate) fn open(selected: &Configuration, overlapped: bool) -> io::Result<OwnedHandle> {
    if configuration()?.as_ref() != Some(selected) {
        return Err(denied());
    }
    appcontainer()?;
    let name = selected.path.encode_wide().chain(Some(0)).collect::<Vec<_>>();
    // Exact read/write rights exclude FILE_CREATE_PIPE_INSTANCE. Identification
    // QoS also prevents the pipe server from impersonating this client token.
    let flags = 0x0011_0000 | if overlapped { 0x4000_0000 } else { 0 };
    let raw = unsafe { CreateFileW(name.as_ptr(), 0x0012_019b, 0, std::ptr::null(),
                                  3, flags, std::ptr::null_mut()) };
    if raw.is_null() || raw as isize == -1 {
        return Err(io::Error::last_os_error());
    }
    let handle = unsafe { OwnedHandle::from_raw_handle(raw) };
    let mut pid = 0_u32;
    let mut inherited = 0_u32;
    if unsafe { GetNamedPipeServerProcessId(handle.as_raw_handle(), &mut pid) } == 0
        || unsafe { GetHandleInformation(handle.as_raw_handle(), &mut inherited) } == 0
    {
        return Err(io::Error::last_os_error());
    }
    if pid != selected.server_pid || inherited & 1 != 0 {
        return Err(denied());
    }
    Ok(handle)
}

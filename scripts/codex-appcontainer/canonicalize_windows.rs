//! Local compatibility build only. Canonicalize with the real file handle;
//! never accept an absolute string after a denied canonicalization. No ACL,
//! token, process map, global device, authentication or network changes.
use std::ffi::c_void;
use std::fs::File;
use std::io;
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::io::AsRawHandle;
use std::path::{Component, Path, PathBuf, Prefix};

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetCurrentProcess() -> *mut c_void;
    fn CloseHandle(handle: *mut c_void) -> i32;
    fn GetFinalPathNameByHandleW(handle: *mut c_void, path: *mut u16, size: u32, flags: u32) -> u32;
}
#[link(name = "advapi32")]
unsafe extern "system" {
    fn OpenProcessToken(process: *mut c_void, access: u32, token: *mut *mut c_void) -> i32;
    fn GetTokenInformation(token: *mut c_void, kind: u32, data: *mut c_void, size: u32, returned: *mut u32) -> i32;
}

fn is_appcontainer() -> bool {
    let mut token = std::ptr::null_mut();
    // SAFETY: Current process pseudo-handle and an initialized output pointer.
    if unsafe { OpenProcessToken(GetCurrentProcess(), 8, &mut token) } == 0 {
        return false;
    }
    let mut active = 0u32;
    let mut returned = 0u32;
    // SAFETY: Token query writes one DWORD to the initialized output buffer.
    let ok = unsafe {
        GetTokenInformation(token, 29, (&mut active as *mut u32).cast(), 4, &mut returned)
    };
    // SAFETY: This is the owned token handle, not the process pseudo-handle.
    unsafe { CloseHandle(token) };
    ok != 0 && returned == 4 && active == 1
}

fn open(path: &Path, access: u32) -> io::Result<File> {
    File::options().access_mode(access).share_mode(7).custom_flags(0x02000000).open(path)
}

fn nt_handle(handle: *mut c_void) -> io::Result<String> {
    let mut buffer = vec![0u16; 32768];
    // SAFETY: The File owns its handle; the buffer has the declared capacity.
    let size = unsafe {
        GetFinalPathNameByHandleW(handle, buffer.as_mut_ptr(), buffer.len() as u32, 2)
    } as usize;
    if size == 0 {
        return Err(io::Error::last_os_error());
    }
    if size >= buffer.len() {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "canonical NT name exceeds limit"));
    }
    String::from_utf16(&buffer[..size])
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid canonical NT name"))
}

enum Root { Owned(File), Inherited(*mut c_void) }
impl Root {
    fn handle(&self) -> *mut c_void {
        match self { Self::Owned(file) => file.as_raw_handle(), Self::Inherited(handle) => *handle }
    }
}

fn original_root(drive: u8, path: &Path) -> io::Result<Root> {
    if let Some(value) = std::env::var_os("CIMILOOP_CANONICAL_ROOT_HANDLES") {
        let value = value.to_str().filter(|value| !value.is_empty() && value.len() <= 256)
            .ok_or_else(|| io::Error::from(io::ErrorKind::InvalidInput))?;
        let mut selected = None;
        let mut drives = std::collections::BTreeSet::new();
        let mut handles = std::collections::BTreeSet::new();
        for pair in value.split(';') {
            let (name, number) = pair.split_once('=')
                .ok_or_else(|| io::Error::from(io::ErrorKind::InvalidInput))?;
            if name.len() != 1 || !name.as_bytes()[0].is_ascii_uppercase() || !drives.insert(name) || drives.len() > 8 {
                return Err(io::ErrorKind::InvalidInput.into());
            }
            let handle: usize = number.parse().map_err(|_| io::Error::from(io::ErrorKind::InvalidInput))?;
            if handle < 4 || handle % 4 != 0 || !handles.insert(handle) {
                return Err(io::ErrorKind::InvalidInput.into());
            }
            if name.as_bytes()[0] == drive.to_ascii_uppercase() { selected = Some(handle); }
        }
        return selected.map(|handle| Root::Inherited(handle as *mut c_void))
            .ok_or_else(|| io::Error::from(io::ErrorKind::PermissionDenied));
    }
    open(path, 0).map(Root::Owned)
}

fn resolved_same_volume(path: &Path) -> io::Result<PathBuf> {
    let absolute = std::path::absolute(path)?;
    let drive = match absolute.components().next() {
        Some(Component::Prefix(prefix)) => match prefix.kind() {
            Prefix::Disk(drive) | Prefix::VerbatimDisk(drive) => drive,
            _ => return Err(io::Error::new(io::ErrorKind::InvalidInput, "local drive required")),
        },
        _ => return Err(io::Error::new(io::ErrorKind::InvalidInput, "local drive required")),
    };
    let root = PathBuf::from(format!("{}:\\", drive as char));
    // Require target attribute access. Only the volume root uses access=0;
    // that handle reads no directory entries, file content or credentials.
    let target = open(&absolute, 0x80)?;
    let volume = original_root(drive, &root)?;
    let target_nt = nt_handle(target.as_raw_handle())?;
    let volume_nt = nt_handle(volume.handle())?;
    let volume_nt = volume_nt.trim_end_matches('\\');
    if !volume_nt.strip_prefix("\\Device\\HarddiskVolume")
        .is_some_and(|suffix| !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit())) {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    let tail = if target_nt == volume_nt || target_nt == format!("{volume_nt}\\") {
        ""
    } else {
        target_nt.strip_prefix(&format!("{volume_nt}\\"))
            .ok_or_else(|| io::Error::new(io::ErrorKind::PermissionDenied, "different canonical volume"))?
    };
    // Re-read both held objects before reconstructing the canonical DOS name.
    if nt_handle(target.as_raw_handle())? != target_nt || nt_handle(volume.handle())?.trim_end_matches('\\') != volume_nt {
        return Err(io::Error::new(io::ErrorKind::PermissionDenied, "canonical object changed"));
    }
    Ok(root.join(tail))
}

pub(crate) fn after_error(path: &Path, original: io::Error) -> io::Result<PathBuf> {
    if original.raw_os_error() != Some(5) || !is_appcontainer() {
        return Err(original);
    }
    // Preserve the original error on any incomplete object/volume observation.
    resolved_same_volume(path).map_err(|_| original)
}

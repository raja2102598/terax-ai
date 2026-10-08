use std::io;
use std::process::{Command, Stdio};

const MAX_URL_LEN: usize = 8192;
const ALLOWED_SCHEMES: &[&str] = &["http", "https", "mailto", "tel"];

pub(crate) fn validate_external_url(url: &str) -> Result<(), String> {
    if url.len() > MAX_URL_LEN {
        return Err("url is too long".into());
    }
    if url.chars().any(char::is_control) {
        return Err("url contains control characters".into());
    }
    let Some((scheme, rest)) = url.split_once(':') else {
        return Err("url has no scheme".into());
    };
    if rest.is_empty() {
        return Err("url is empty".into());
    }
    if !ALLOWED_SCHEMES
        .iter()
        .any(|allowed| scheme.eq_ignore_ascii_case(allowed))
    {
        return Err(format!("scheme `{scheme}` is not allowed"));
    }
    Ok(())
}

// The launcher must outlive Terax and stay out of its process group, so it is
// double-forked. Waiting on the intermediate child here is what keeps it from
// lingering as a zombie for the life of the app.
#[cfg(unix)]
fn spawn_detached_reaped(mut cmd: Command) -> io::Result<u32> {
    use std::os::unix::process::CommandExt;

    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    // SAFETY: the closure runs between fork and exec and only makes
    // async-signal-safe calls.
    unsafe {
        cmd.pre_exec(|| {
            match libc::fork() {
                -1 => return Err(io::Error::last_os_error()),
                0 => {}
                _ => libc::_exit(0),
            }
            if libc::setsid() == -1 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let mut child = cmd.spawn()?;
    let pid = child.id();
    child.wait()?;
    Ok(pid)
}

#[cfg(unix)]
fn launch(url: &str) -> io::Result<()> {
    let mut last_err = None;
    for cmd in open::commands(url) {
        match spawn_detached_reaped(cmd) {
            Ok(_) => return Ok(()),
            Err(e) => last_err = Some(e),
        }
    }
    Err(last_err.unwrap_or_else(|| io::Error::new(io::ErrorKind::NotFound, "no launcher found")))
}

#[cfg(not(unix))]
fn launch(url: &str) -> io::Result<()> {
    open::that_detached(url)
}

#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    validate_external_url(&url)?;
    tauri::async_runtime::spawn_blocking(move || launch(&url))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_web_mail_and_phone_links() {
        for url in [
            "https://example.com/a?b=c#d",
            "http://localhost:5173",
            "HTTPS://EXAMPLE.COM",
            "mailto:support@example.com",
            "tel:+16045550123",
        ] {
            assert!(validate_external_url(url).is_ok(), "{url}");
        }
    }

    #[test]
    fn rejects_other_schemes() {
        for url in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "smb://host/share",
            "vscode://open",
            "/usr/bin/id",
            "--help",
            "",
            "https:",
        ] {
            assert!(validate_external_url(url).is_err(), "{url}");
        }
    }

    #[test]
    fn rejects_control_characters_and_oversized_input() {
        assert!(validate_external_url("https://example.com/\n--flag").is_err());
        assert!(validate_external_url("https://example.com/\0").is_err());
        let long = format!("https://example.com/{}", "a".repeat(MAX_URL_LEN));
        assert!(validate_external_url(&long).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn detached_spawn_leaves_no_zombie() {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", "exit 0"]);
        let pid = spawn_detached_reaped(cmd).expect("spawn sh") as libc::pid_t;
        // A zombie still answers signal 0; a reaped child does not exist.
        let alive = unsafe { libc::kill(pid, 0) } == 0;
        assert!(!alive, "intermediate child {pid} was not reaped");
    }

    #[cfg(unix)]
    #[test]
    fn detached_spawn_reports_a_missing_program() {
        let cmd = Command::new("terax-no-such-launcher-binary");
        assert!(spawn_detached_reaped(cmd).is_err());
    }
}

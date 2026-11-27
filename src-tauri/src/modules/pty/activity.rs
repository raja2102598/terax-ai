use std::sync::Arc;

use serde::Serialize;

use super::PtyState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyActivity {
    pub process: Option<String>,
    pub pid: Option<u32>,
    pub ports: Vec<u16>,
}

impl PtyActivity {
    fn idle() -> Self {
        Self {
            process: None,
            pid: None,
            ports: Vec::new(),
        }
    }
}

#[tauri::command(async)]
pub fn pty_activity(state: tauri::State<PtyState>, id: u32) -> Result<PtyActivity, String> {
    // Clone out so the /proc scan below never holds the session map lock.
    let session = state
        .sessions
        .read()
        .unwrap()
        .get(&id)
        .map(Arc::clone)
        .ok_or_else(|| "no session".to_string())?;
    let shell_pid = session.shell_pid;
    if shell_pid == 0 {
        return Ok(PtyActivity::idle());
    }
    #[cfg(target_os = "linux")]
    {
        let foreground = session
            .master
            .lock()
            .unwrap()
            .as_ref()
            .and_then(|master| master.process_group_leader())
            .and_then(|pid| u32::try_from(pid).ok())
            .filter(|pid| *pid != shell_pid);
        let process = foreground.and_then(process_name);
        let mut pids = process_tree_pids(shell_pid);
        if let Some(pid) = foreground {
            pids.insert(pid);
        }
        let ports = listening_ports(&pids);
        Ok(PtyActivity {
            process,
            pid: foreground,
            ports,
        })
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(PtyActivity::idle())
    }
}

#[cfg(target_os = "linux")]
fn process_name(pid: u32) -> Option<String> {
    std::fs::read_to_string(format!("/proc/{pid}/comm"))
        .ok()
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
}

#[cfg(target_os = "linux")]
fn process_tree_pids(root: u32) -> std::collections::HashSet<u32> {
    let mut pids = std::collections::HashSet::from([root]);
    let mut pending = vec![root];
    while let Some(pid) = pending.pop() {
        if pids.len() >= 1024 {
            break;
        }
        let Ok(children) = std::fs::read_to_string(format!("/proc/{pid}/task/{pid}/children"))
        else {
            continue;
        };
        for child in children
            .split_whitespace()
            .filter_map(|v| v.parse::<u32>().ok())
        {
            if pids.insert(child) {
                pending.push(child);
            }
        }
    }
    pids
}

// Reads /proc directly instead of spawning `ss`: this runs every couple of
// seconds per busy terminal, and a fork+exec per poll is most of its cost.
#[cfg(target_os = "linux")]
fn listening_ports(pids: &std::collections::HashSet<u32>) -> Vec<u16> {
    let mut inodes = std::collections::HashSet::new();
    for pid in pids {
        let Ok(fds) = std::fs::read_dir(format!("/proc/{pid}/fd")) else {
            continue;
        };
        for fd in fds.flatten() {
            if let Ok(link) = std::fs::read_link(fd.path()) {
                if let Some(inode) = link.to_str().and_then(socket_inode) {
                    inodes.insert(inode);
                }
            }
        }
    }
    if inodes.is_empty() {
        return Vec::new();
    }
    let tables: Vec<String> = ["/proc/net/tcp", "/proc/net/tcp6"]
        .iter()
        .filter_map(|path| std::fs::read_to_string(path).ok())
        .collect();
    listening_ports_from_tables(tables.iter().map(String::as_str), &inodes)
}

#[cfg(target_os = "linux")]
fn socket_inode(link: &str) -> Option<u64> {
    link.strip_prefix("socket:[")?
        .strip_suffix(']')?
        .parse()
        .ok()
}

/// Ports of LISTEN sockets in `/proc/net/tcp{,6}` tables whose inode is owned
/// by the terminal's process tree.
#[cfg(target_os = "linux")]
fn listening_ports_from_tables<'a>(
    tables: impl Iterator<Item = &'a str>,
    inodes: &std::collections::HashSet<u64>,
) -> Vec<u16> {
    const TCP_LISTEN: &str = "0A";
    let mut ports = Vec::new();
    for line in tables.flat_map(|table| table.lines().skip(1)) {
        let fields: Vec<&str> = line.split_whitespace().collect();
        let (Some(local), Some(state), Some(inode)) = (fields.get(1), fields.get(3), fields.get(9))
        else {
            continue;
        };
        if *state != TCP_LISTEN || !inode.parse().is_ok_and(|i: u64| inodes.contains(&i)) {
            continue;
        }
        let Some(port) = local
            .rsplit(':')
            .next()
            .and_then(|hex| u16::from_str_radix(hex, 16).ok())
        else {
            continue;
        };
        if !ports.contains(&port) {
            ports.push(port);
        }
    }
    ports.sort_unstable();
    ports
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::{listening_ports, listening_ports_from_tables, socket_inode};
    use std::collections::HashSet;

    #[test]
    fn finds_a_real_listener_through_proc() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let pids = HashSet::from([std::process::id()]);
        assert!(listening_ports(&pids).contains(&port));
        assert!(listening_ports(&HashSet::from([u32::MAX])).is_empty());
    }

    const TCP: &str = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:1435 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 41001 1 0000000000000000 100 0 0 10 0
   1: 00000000:0BB8 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 7 1 0000000000000000 100 0 0 10 0
   2: 0100007F:1435 0100007F:D2F0 01 00000000:00000000 00:00000000 00000000  1000        0 41001 1 0000000000000000 20 4 30 10 -1";
    const TCP6: &str = "  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000000000000000000001000000:0594 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 99001 1 0000000000000000 100 0 0 10 0";

    #[test]
    fn finds_only_listening_ports_owned_by_the_terminal_process_tree() {
        let inodes = HashSet::from([41001, 99001]);
        assert_eq!(listening_ports_from_tables([TCP, TCP6].into_iter(), &inodes), vec![1428, 5173]);
    }

    #[test]
    fn foreign_and_established_sockets_are_ignored() {
        assert!(listening_ports_from_tables([TCP].into_iter(), &HashSet::from([12345])).is_empty());
        let only_established = TCP.lines().take(1).chain(TCP.lines().skip(3)).collect::<Vec<_>>().join("\n");
        assert!(listening_ports_from_tables([only_established.as_str()].into_iter(), &HashSet::from([41001])).is_empty());
    }

    #[test]
    fn parses_socket_fd_links() {
        assert_eq!(socket_inode("socket:[41001]"), Some(41001));
        assert_eq!(socket_inode("pipe:[41001]"), None);
        assert_eq!(socket_inode("/dev/pts/3"), None);
        assert_eq!(socket_inode("socket:[x]"), None);
    }
}

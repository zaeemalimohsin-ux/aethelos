use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

const LOCAL_PORT: u16 = 8787;
const LOCAL_WS: &str = "ws://127.0.0.1:8787";
const TUNNEL_WAIT_MS: u64 = 120_000;

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalNodeStatus {
    pub local_url: String,
    pub public_url: Option<String>,
    pub running: bool,
    pub tunnel_ready: bool,
    pub cloudflared_available: bool,
}

struct LocalNodeState {
    relay_child: Option<Child>,
    tunnel_child: Option<Child>,
    public_url: Option<String>,
    cloudflared_available: bool,
}

static NODE: Mutex<Option<LocalNodeState>> = Mutex::new(None);

fn relay_script_path_dev() -> Option<PathBuf> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let script = manifest.join("../../relay/dist/index.js");
    if script.exists() {
        Some(script)
    } else {
        None
    }
}

fn resolve_relay_launch(app: Option<&tauri::AppHandle>) -> Result<(PathBuf, PathBuf), String> {
    #[cfg(debug_assertions)]
    {
        let script = relay_script_path_dev()
            .ok_or("relay script not found — run Start-AethelOS.bat or: pnpm --filter @aethelos/relay build")?;
        return Ok((PathBuf::from("node"), script));
    }

    #[cfg(not(debug_assertions))]
    {
        use tauri::Manager;
        let app = app.ok_or("internal: missing app handle")?;
        let script = app
            .path()
            .resolve("relay/server.cjs", tauri::path::BaseDirectory::Resource)
            .map_err(|e| format!("relay bundle missing: {e}"))?;
        let node = app
            .path()
            .resolve("node/win-x64/node.exe", tauri::path::BaseDirectory::Resource)
            .map_err(|e| format!("node runtime missing: {e}"))?;
        if !script.exists() {
            return Err(format!("relay bundle not found at {}", script.display()));
        }
        if !node.exists() {
            return Err(format!("node runtime not found at {}", node.display()));
        }
        Ok((node, script))
    }
}

fn extract_https_url(line: &str) -> Option<String> {
    if let Some(idx) = line.find("https://") {
        let rest = &line[idx..];
        let end = rest
            .find(|c: char| {
                !c.is_ascii_alphanumeric() && c != '-' && c != '.' && c != ':' && c != '/'
            })
            .unwrap_or(rest.len());
        let url = &rest[..end];
        if url.contains(".trycloudflare.com") && url.len() > "https://".len() {
            return Some(url.to_string());
        }
    }
    None
}

fn wait_for_relay_health() {
    for _ in 0..20 {
        if std::net::TcpStream::connect(format!("127.0.0.1:{LOCAL_PORT}")).is_ok() {
            return;
        }
        thread::sleep(Duration::from_millis(250));
    }
}

fn spawn_tunnel_url_reader(
    stream: impl std::io::Read + Send + 'static,
    slot: std::sync::Arc<Mutex<Option<String>>>,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines().map_while(Result::ok) {
            if let Some(url) = extract_https_url(&line) {
                if let Ok(mut guard) = slot.lock() {
                    if guard.is_none() {
                        *guard = Some(url);
                    }
                }
                break;
            }
        }
    });
}

fn wait_for_public_url(
    slot: &std::sync::Arc<Mutex<Option<String>>>,
    deadline: Instant,
) -> Option<String> {
    while Instant::now() < deadline {
        if let Ok(guard) = slot.lock() {
            if let Some(url) = guard.clone() {
                return Some(url);
            }
        }
        thread::sleep(Duration::from_millis(250));
    }
    slot.lock().ok().and_then(|g| g.clone())
}

fn build_status(state: &LocalNodeState) -> LocalNodeStatus {
    LocalNodeStatus {
        local_url: LOCAL_WS.to_string(),
        public_url: state.public_url.clone(),
        running: state.relay_child.is_some(),
        tunnel_ready: state.public_url.is_some(),
        cloudflared_available: state.cloudflared_available,
    }
}

fn spawn_relay(node: &Path, script: &Path) -> Result<Child, String> {
    Command::new(node)
        .arg(script)
        .env("PORT", LOCAL_PORT.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn relay: {e}"))
}

pub fn start_local_node(app: Option<&tauri::AppHandle>) -> Result<LocalNodeStatus, String> {
    let mut guard = NODE.lock().map_err(|e| e.to_string())?;
    if let Some(ref state) = *guard {
        if state.relay_child.is_some() {
            return Ok(build_status(state));
        }
    }

    let (node, script) = resolve_relay_launch(app)?;

    let relay_child = spawn_relay(&node, &script)?;

    wait_for_relay_health();

    let public_url_slot = std::sync::Arc::new(Mutex::new(None::<String>));

    let tunnel_spawn = Command::new("cloudflared")
        .args([
            "tunnel",
            "--url",
            &format!("http://127.0.0.1:{LOCAL_PORT}"),
            "--no-autoupdate",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    let cloudflared_available = tunnel_spawn.is_ok();
    let mut tunnel_handle = None;

    if let Ok(mut child) = tunnel_spawn {
        if let Some(stdout) = child.stdout.take() {
            spawn_tunnel_url_reader(stdout, public_url_slot.clone());
        }
        if let Some(stderr) = child.stderr.take() {
            spawn_tunnel_url_reader(stderr, public_url_slot.clone());
        }
        tunnel_handle = Some(child);
    }

    let deadline = Instant::now() + Duration::from_millis(TUNNEL_WAIT_MS);
    let public_url = if cloudflared_available {
        wait_for_public_url(&public_url_slot, deadline)
    } else {
        None
    };

    let node_state = LocalNodeState {
        relay_child: Some(relay_child),
        tunnel_child: tunnel_handle,
        public_url: public_url.clone(),
        cloudflared_available,
    };
    let status = build_status(&node_state);
    *guard = Some(node_state);
    Ok(status)
}

pub fn stop_local_node() -> Result<(), String> {
    let mut guard = NODE.lock().map_err(|e| e.to_string())?;
    if let Some(state) = guard.take() {
        if let Some(mut child) = state.tunnel_child {
            let _ = child.kill();
        }
        if let Some(mut child) = state.relay_child {
            let _ = child.kill();
        }
    }
    Ok(())
}

pub fn local_node_status() -> Result<LocalNodeStatus, String> {
    let guard = NODE.lock().map_err(|e| e.to_string())?;
    match guard.as_ref() {
        Some(state) if state.relay_child.is_some() => Ok(build_status(state)),
        _ => Ok(LocalNodeStatus {
            local_url: LOCAL_WS.to_string(),
            public_url: None,
            running: false,
            tunnel_ready: false,
            cloudflared_available: false,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_https_url_parses_trycloudflare_line() {
        let line = "|  https://earthquake-comparative-wisdom-forth.trycloudflare.com  |";
        let url = extract_https_url(line).expect("url");
        assert!(url.contains("trycloudflare.com"));
    }

    #[test]
    fn start_local_node_exposes_public_tunnel() {
        let _ = stop_local_node();
        let status = start_local_node(None).expect("start_local_node");
        assert!(status.running, "relay should be running");
        assert!(
            status.cloudflared_available,
            "cloudflared should be on PATH for desktop remote proof"
        );
        assert!(
            status.public_url.as_ref().is_some_and(|u| u.contains("trycloudflare.com")),
            "expected public trycloudflare URL, got {:?}",
            status.public_url
        );
        stop_local_node().expect("stop_local_node");
    }
}

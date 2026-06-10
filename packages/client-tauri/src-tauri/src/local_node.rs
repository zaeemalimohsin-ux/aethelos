use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

const LOCAL_PORT: u16 = 8787;
const LOCAL_WS: &str = "ws://127.0.0.1:8787";
const TUNNEL_WAIT_MS: u64 = 15000;

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

fn relay_script_path() -> Option<std::path::PathBuf> {
    let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let script = manifest.join("../../relay/dist/index.js");
    if script.exists() {
        Some(script)
    } else {
        None
    }
}

fn extract_https_url(line: &str) -> Option<String> {
    for word in line.split_whitespace() {
        if word.starts_with("https://") {
            let trimmed = word.trim_end_matches(|c: char| {
                !c.is_ascii_alphanumeric() && c != '-' && c != '.' && c != ':' && c != '/'
            });
            if trimmed.len() > "https://".len() {
                return Some(trimmed.to_string());
            }
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

pub fn start_local_node() -> Result<LocalNodeStatus, String> {
    let mut guard = NODE.lock().map_err(|e| e.to_string())?;
    if let Some(ref state) = *guard {
        if state.relay_child.is_some() {
            return Ok(build_status(state));
        }
    }

    let script = relay_script_path()
        .ok_or("relay script not found — run: pnpm --filter @aethelos/relay build")?;

    let relay_child = Command::new("node")
        .arg(script)
        .env("PORT", LOCAL_PORT.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn relay: {e}"))?;

    wait_for_relay_health();

    let public_url_slot = std::sync::Arc::new(Mutex::new(None::<String>));
    let slot_for_reader = public_url_slot.clone();

    let tunnel_spawn = Command::new("cloudflared")
        .args(["tunnel", "--url", &format!("http://127.0.0.1:{LOCAL_PORT}")])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    let cloudflared_available = tunnel_spawn.is_ok();
    let mut tunnel_handle = None;

    if let Ok(mut child) = tunnel_spawn {
        let stderr = child.stderr.take();
        if let Some(stderr) = stderr {
            thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().map_while(Result::ok) {
                    if let Some(url) = extract_https_url(&line) {
                        if let Ok(mut slot) = slot_for_reader.lock() {
                            *slot = Some(url);
                        }
                        break;
                    }
                }
            });
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
    if let Some(mut state) = guard.take() {
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

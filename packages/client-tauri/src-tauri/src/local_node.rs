use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

const RELAY_PORT: u16 = 8787;
const APP_PORT: u16 = 8080;
const DEV_APP_PORT: u16 = 5173;
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
    pub startup_error: Option<String>,
}

struct LocalNodeState {
    relay_child: Option<Child>,
    app_server_child: Option<Child>,
    tunnel_child: Option<Child>,
    public_url: Option<String>,
    public_url_slot: std::sync::Arc<Mutex<Option<String>>>,
    cloudflared_available: bool,
}

static NODE: Mutex<Option<LocalNodeState>> = Mutex::new(None);
static STARTUP_ERROR: Mutex<Option<String>> = Mutex::new(None);

fn set_startup_error(msg: Option<String>) {
    if let Ok(mut guard) = STARTUP_ERROR.lock() {
        *guard = msg;
    }
}

fn current_startup_error() -> Option<String> {
    STARTUP_ERROR.lock().ok().and_then(|g| g.clone())
}

pub fn record_startup_error(err: String) {
    set_startup_error(Some(err));
}

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
        let script = relay_script_path_dev().ok_or(
            "relay script not found — run Start-AethelOS.bat or: pnpm --filter @aethelos/relay build",
        )?;
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

fn resolve_app_server_launch(app: Option<&tauri::AppHandle>) -> Option<(PathBuf, PathBuf, PathBuf)> {
    #[cfg(not(debug_assertions))]
    {
        use tauri::Manager;
        let app = app?;
        let node = app
            .path()
            .resolve("node/win-x64/node.exe", tauri::path::BaseDirectory::Resource)
            .ok()?;
        let script = app
            .path()
            .resolve("app-server/server.cjs", tauri::path::BaseDirectory::Resource)
            .ok()?;
        let static_root = app
            .path()
            .resolve("static", tauri::path::BaseDirectory::Resource)
            .ok()?;
        if node.exists() && script.exists() && static_root.exists() {
            return Some((node, script, static_root));
        }
    }
    None
}

fn resolve_cloudflared(app: Option<&tauri::AppHandle>) -> (PathBuf, bool) {
    #[cfg(not(debug_assertions))]
    if let Some(app) = app {
        use tauri::Manager;
        if let Ok(path) = app.path().resolve(
            "cloudflared/win-x64/cloudflared.exe",
            tauri::path::BaseDirectory::Resource,
        ) {
            if path.exists() {
                return (path, true);
            }
        }
    }

    if let Ok(path) = which_cloudflared() {
        return (path, true);
    }

    (PathBuf::from("cloudflared"), false)
}

fn which_cloudflared() -> Result<PathBuf, ()> {
    Command::new("where")
        .arg("cloudflared")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.lines().next().map(PathBuf::from))
        .ok_or(())
}

pub fn is_quick_tunnel_url(url: &str) -> bool {
    if !url.starts_with("https://") {
        return false;
    }
    let host = url
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("");
    if !host.ends_with(".trycloudflare.com") {
        return false;
    }
    let subdomain = host.trim_end_matches(".trycloudflare.com");
    !subdomain.is_empty() && subdomain != "api" && !subdomain.contains('.')
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
        if is_quick_tunnel_url(url) {
            return Some(url.to_string());
        }
    }
    None
}

fn wait_for_port(port: u16) {
    for _ in 0..40 {
        if std::net::TcpStream::connect(format!("127.0.0.1:{port}")).is_ok() {
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

fn resolve_public_url(state: &LocalNodeState) -> Option<String> {
    if let Some(url) = state.public_url.clone() {
        return Some(url);
    }
    state
        .public_url_slot
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
}

fn build_status(state: &LocalNodeState) -> LocalNodeStatus {
    let public_url = resolve_public_url(state);
    LocalNodeStatus {
        local_url: LOCAL_WS.to_string(),
        public_url: public_url.clone(),
        running: state.relay_child.is_some(),
        tunnel_ready: public_url.is_some(),
        cloudflared_available: state.cloudflared_available,
        startup_error: None,
    }
}

fn spawn_relay(node: &Path, script: &Path) -> Result<Child, String> {
    Command::new(node)
        .arg(script)
        .env("PORT", RELAY_PORT.to_string())
        .env("RELAY_LISTEN_HOST", "127.0.0.1")
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn relay: {e}"))
}

fn spawn_app_server(node: &Path, script: &Path, static_root: &Path) -> Result<Child, String> {
    Command::new(node)
        .arg(script)
        .env("PORT", APP_PORT.to_string())
        .env("RELAY_PORT", RELAY_PORT.to_string())
        .env("STATIC_ROOT", static_root)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn app-server: {e}"))
}

fn tunnel_target() -> String {
    #[cfg(debug_assertions)]
    {
        format!("http://127.0.0.1:{DEV_APP_PORT}")
    }
    #[cfg(not(debug_assertions))]
    {
        format!("http://127.0.0.1:{APP_PORT}")
    }
}

pub fn start_local_node(app: Option<&tauri::AppHandle>) -> Result<LocalNodeStatus, String> {
    let mut guard = NODE.lock().map_err(|e| e.to_string())?;
    if let Some(ref state) = *guard {
        if state.relay_child.is_some() {
            return Ok(build_status(state));
        }
    }

    let (node, script) = match resolve_relay_launch(app) {
        Ok(v) => v,
        Err(e) => {
            record_startup_error(e.clone());
            return Err(e);
        }
    };
    let relay_child = match spawn_relay(&node, &script) {
        Ok(c) => c,
        Err(e) => {
            record_startup_error(e.clone());
            return Err(e);
        }
    };
    wait_for_port(RELAY_PORT);

    let mut app_server_child = None;
    if let Some((node_exe, server_script, static_root)) = resolve_app_server_launch(app) {
        app_server_child = match spawn_app_server(&node_exe, &server_script, &static_root) {
            Ok(c) => Some(c),
            Err(e) => {
                record_startup_error(e.clone());
                return Err(e);
            }
        };
        wait_for_port(APP_PORT);
    }

    #[cfg(debug_assertions)]
    {
        wait_for_port(DEV_APP_PORT);
    }

    let public_url_slot = std::sync::Arc::new(Mutex::new(None::<String>));
    let (cloudflared_bin, bundled) = resolve_cloudflared(app);
    let target = tunnel_target();

    let tunnel_spawn = Command::new(&cloudflared_bin)
        .args(["tunnel", "--url", &target, "--no-autoupdate"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    let cloudflared_available = tunnel_spawn.is_ok() && (bundled || which_cloudflared().is_ok());
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

    if cloudflared_available {
        let slot = public_url_slot.clone();
        let deadline = Instant::now() + Duration::from_millis(TUNNEL_WAIT_MS);
        thread::spawn(move || {
            if let Some(url) = wait_for_public_url(&slot, deadline) {
                if let Ok(mut guard) = NODE.lock() {
                    if let Some(ref mut state) = *guard {
                        state.public_url = Some(url);
                    }
                }
            }
        });
    }

    let node_state = LocalNodeState {
        relay_child: Some(relay_child),
        app_server_child,
        tunnel_child: tunnel_handle,
        public_url: None,
        public_url_slot,
        cloudflared_available,
    };
    let status = build_status(&node_state);
    *guard = Some(node_state);
    set_startup_error(None);
    Ok(status)
}

pub fn stop_local_node() -> Result<(), String> {
    let mut guard = NODE.lock().map_err(|e| e.to_string())?;
    if let Some(state) = guard.take() {
        if let Some(mut child) = state.tunnel_child {
            let _ = child.kill();
        }
        if let Some(mut child) = state.app_server_child {
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
            startup_error: current_startup_error(),
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
    fn extract_https_url_rejects_api_host() {
        let line = "INF | https://api.trycloudflare.com/tunnel |";
        assert!(extract_https_url(line).is_none());
    }
}

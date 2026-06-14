// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod local_node;

use local_node::LocalNodeStatus;

// Tauri command names must match the frontend `invoke("start_local_node")` etc.
#[tauri::command]
fn start_local_node(app: tauri::AppHandle) -> Result<LocalNodeStatus, String> {
    local_node::start_local_node(Some(&app))
}

#[tauri::command]
fn stop_local_node() -> Result<(), String> {
    local_node::stop_local_node()
}

#[tauri::command]
fn local_node_status() -> Result<LocalNodeStatus, String> {
    local_node::local_node_status()
}

#[tauri::command]
fn write_share_url_file(url: String) -> Result<(), String> {
    let path = std::env::var("AETHELOS_SHARE_URL_FILE")
        .map(std::path::PathBuf::from)
        .or_else(|_| {
            std::env::current_dir()
                .map(|d| d.join(".share-url"))
                .map_err(|e| e.to_string())
        })?;
    if url.is_empty() {
        let _ = std::fs::remove_file(&path);
        return Ok(());
    }
    if !local_node::is_quick_tunnel_url(&url) {
        return Err("share URL must be a quick tunnel (*.trycloudflare.com)".into());
    }
    std::fs::write(&path, format!("{url}\n")).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            {
                if let Err(err) = local_node::start_local_node(Some(&app.handle())) {
                    local_node::record_startup_error(err.clone());
                    let log = std::env::temp_dir().join("aethelos-local-node.log");
                    let _ = std::fs::write(log, err);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_local_node,
            stop_local_node,
            local_node_status,
            write_share_url_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AethelOS desktop");
}

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

fn main() {
    #[cfg(not(debug_assertions))]
    {
        tauri::Builder::default()
            .plugin(tauri_plugin_updater::Builder::new().build())
            .invoke_handler(tauri::generate_handler![
                start_local_node,
                stop_local_node,
                local_node_status,
            ])
            .run(tauri::generate_context!())
            .expect("error while running AethelOS desktop");
    }
    #[cfg(debug_assertions)]
    {
        tauri::Builder::default()
            .invoke_handler(tauri::generate_handler![
                start_local_node,
                stop_local_node,
                local_node_status,
            ])
            .run(tauri::generate_context!())
            .expect("error while running AethelOS desktop");
    }
}

// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod local_node;

use local_node::{local_node_status, start_local_node, stop_local_node, LocalNodeStatus};

#[tauri::command]
fn cmd_start_local_node() -> Result<LocalNodeStatus, String> {
    start_local_node()
}

#[tauri::command]
fn cmd_stop_local_node() -> Result<(), String> {
    stop_local_node()
}

#[tauri::command]
fn cmd_local_node_status() -> Result<LocalNodeStatus, String> {
    local_node_status()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            cmd_start_local_node,
            cmd_stop_local_node,
            cmd_local_node_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AethelOS desktop");
}

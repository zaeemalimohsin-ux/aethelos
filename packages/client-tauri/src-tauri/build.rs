fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "start_local_node",
                "stop_local_node",
                "local_node_status",
                "write_share_url_file",
            ]),
        ),
    )
    .expect("failed to run tauri build script");
}

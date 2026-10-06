use std::path::PathBuf;

#[tauri::command]
fn get_backend_port() -> u16 {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();

    if !home.is_empty() {
        let port_file = PathBuf::from(home).join(".alfred").join("port");
        if let Ok(content) = std::fs::read_to_string(port_file) {
            if let Ok(port) = content.trim().parse::<u16>() {
                return port;
            }
        }
    }
    8741
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![get_backend_port])
        .run(tauri::generate_context!())
        .expect("error while running Alfred application");
}

mod hub;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(hub::HubState::default())
        .setup(|app| {
            hub::start(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![hub::hub_connection])
        .build(tauri::generate_context!())
        .expect("error while building THE DAY")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                hub::stop(app);
            }
        });
}

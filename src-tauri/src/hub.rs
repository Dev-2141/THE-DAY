//! Starts and stops the Python connectivity hub next to the app.
//!
//! Windows release builds launch the hub as a hidden companion process bound
//! to 127.0.0.1 on a free port, with a fresh random token passed by
//! environment variable. The interface asks for { url, token } through the
//! `hub_connection` command. The hub exits when the app closes its stdin.
//!
//! The installer and the portable build carry their own Python (the official
//! embeddable distribution, in `python/` next to the app), so the user does
//! not need Python installed. `hub/hub.py` stays a plain file next to the app
//! and can still be edited after installation.
//!
//! In development `vite` owns the hub (tooling/vite-plugin-hub.ts), and on
//! Android there is no companion: the interface uses the exported hub.json.

use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

#[derive(Clone, Serialize)]
pub struct HubConnection {
    url: String,
    token: String,
}

#[derive(Default)]
pub struct HubState {
    connection: Mutex<Option<HubConnection>>,
    #[cfg(all(desktop, not(debug_assertions)))]
    child: Mutex<Option<std::process::Child>>,
}

#[tauri::command]
pub fn hub_connection(state: State<'_, HubState>) -> Option<HubConnection> {
    state.connection.lock().ok().and_then(|connection| connection.clone())
}

#[cfg(not(all(desktop, not(debug_assertions))))]
pub fn start(_app: &tauri::AppHandle) {}

#[cfg(not(all(desktop, not(debug_assertions))))]
pub fn stop(_app: &tauri::AppHandle) {}

#[cfg(all(desktop, not(debug_assertions)))]
pub use companion::{start, stop};

#[cfg(all(desktop, not(debug_assertions)))]
mod companion {
    use super::{HubConnection, HubState};
    use std::error::Error;
    use std::net::TcpListener;
    use std::path::{Path, PathBuf};
    use std::process::{Child, Command, Stdio};
    use tauri::{AppHandle, Manager};

    pub fn start(app: &AppHandle) {
        let (child, connection) = match spawn(app) {
            Ok(started) => started,
            // The interface keeps working without the hub.
            Err(error) => {
                eprintln!("[hub] not started: {error}");
                return;
            }
        };
        let state = app.state::<HubState>();
        if let Ok(mut slot) = state.child.lock() {
            *slot = Some(child);
        };
        if let Ok(mut slot) = state.connection.lock() {
            *slot = Some(connection);
        };
    }

    pub fn stop(app: &AppHandle) {
        let state = app.state::<HubState>();
        let child = state.child.lock().ok().and_then(|mut slot| slot.take());
        if let Some(mut child) = child {
            // Closing stdin lets the hub exit by itself; kill is the backstop.
            drop(child.stdin.take());
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    /// THE_DAY_PYTHON if set, then the bundled Python, then Python on the PATH.
    fn python(resources: &Path) -> PathBuf {
        if let Ok(path) = std::env::var("THE_DAY_PYTHON") {
            return PathBuf::from(path);
        }
        let bundled = resources.join("python").join(if cfg!(windows) { "python.exe" } else { "python3" });
        if bundled.is_file() {
            return bundled;
        }
        PathBuf::from(if cfg!(windows) { "python" } else { "python3" })
    }

    fn spawn(app: &AppHandle) -> Result<(Child, HubConnection), Box<dyn Error>> {
        let resources = app.path().resource_dir()?;
        let dir = resources.join("hub");
        let port = TcpListener::bind(("127.0.0.1", 0))?.local_addr()?.port();

        let mut bytes = [0u8; 32];
        getrandom::fill(&mut bytes).map_err(|error| error.to_string())?;
        let token: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();

        let mut command = Command::new(python(&resources));
        command
            .arg(dir.join("server.py"))
            .args(["--port", &port.to_string(), "--lifeline"])
            .current_dir(&dir)
            .env("THE_DAY_HUB_TOKEN", &token)
            .env("PYTHONDONTWRITEBYTECODE", "1")
            .env("PYTHONUTF8", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        let child = command.spawn()?;
        Ok((child, HubConnection { url: format!("http://127.0.0.1:{port}"), token }))
    }
}

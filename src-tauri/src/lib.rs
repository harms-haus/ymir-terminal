mod auth;
mod log;
mod sidecar;

use sidecar::SidecarManager;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;

#[derive(serde::Serialize, Clone)]
pub struct TauriConfig {
    pub port: u16,
    pub password: String,
}

pub struct AppState {
    pub port: u16,
    pub password: String,
    pub sidecar_child: Mutex<Option<CommandChild>>,
}

#[tauri::command]
fn get_tauri_config(state: tauri::State<'_, AppState>) -> TauriConfig {
    TauriConfig {
        port: state.port,
        password: state.password.clone(),
    }
}

pub fn run() {
    if let Err(e) = crate::log::init() {
        eprintln!("Failed to init logging: {}", e);
    }

    // Fix 1: Force X11 backend. WebKitGTK's begin_move_drag() doesn't relay
    // pointer grabs from WebView JS events to GDK on native Wayland.
    // (tauri #10686, tao #1218). XWayland supports this correctly.
    // Only override if the user hasn't explicitly set GDK_BACKEND.
    // Remove once tao PR #1218 ships in a Tauri release.
    if std::env::var("GDK_BACKEND").is_err() {
        std::env::set_var("GDK_BACKEND", "x11");
    }

    // Fix 2: Disable WebKit compositing. Without this, WebKitGTK fails with
    // "Failed to create GBM buffer" on NVIDIA + Wayland/XWayland setups.
    if std::env::var("WEBKIT_DISABLE_COMPOSITING_MODE").is_err() {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            if cfg!(debug_assertions) {
                // ── Dev mode ──────────────────────────────────────────
                // The server is already started by beforeDevCommand (bun run dev)
                // with --password=dev on port 3000. The webview loads from Vite
                // (devUrl in tauri.conf.json) which proxies /ws to localhost:3000.
                // We register dev state so get_tauri_config returns dev credentials
                // for the auto-login flow.
                crate::log::global_log("[ymir] Dev mode — server started by beforeDevCommand");
                app_handle.manage(AppState {
                    port: 3000,
                    password: "dev".to_string(),
                    sidecar_child: Mutex::new(None),
                });
            } else {
                // ── Production mode ───────────────────────────────────
                // Start the sidecar, wait for readiness, then set webview URL.
                let handle = tauri::async_runtime::spawn(async move {
                    // 1. Get config directory for password storage
                    let config_dir = app_handle
                        .path()
                        .app_config_dir()
                        .expect("failed to resolve app config dir");

                    // 2. Get or create password
                    let password = auth::get_or_create_password(&config_dir);
                    crate::log::global_log("[ymir] Password ready");

                    // 3. Resolve static files directory
                    let static_dir = SidecarManager::resolve_static_dir(&app_handle)
                        .expect("failed to resolve static dir");
                    // Note: static_dir is logged by resolve_static_dir

                    // 4. Start sidecar and wait for readiness (blocks until port is parsed)
                    let (child, port) =
                        SidecarManager::start_sidecar(&app_handle, &password, &static_dir)
                            .await
                            .expect("failed to start sidecar");
                    crate::log::global_log(&format!("[ymir] Sidecar started on port {}", port));

                    // 5. Store app state
                    app_handle.manage(AppState {
                        port,
                        password,
                        sidecar_child: Mutex::new(Some(child)),
                    });

                    // 6. Inject the sidecar port into the webview so the client can connect
                    // NOTE: We do NOT navigate the webview to the sidecar URL. The webview
                    // must stay on the tauri://localhost origin so that Tauri IPC commands
                    // (like get_tauri_config) remain accessible. The embedded frontend connects
                    // to the sidecar via WebSocket using the port injected here.
                    if let Some(window) = app_handle.get_webview_window("main") {
                        if let Err(e) = window.eval(&format!(
                            "window.__YMIR_SIDECAR_PORT = {};",
                            port
                        )) {
                            crate::log::global_log(&format!("[ymir] WARNING: failed to inject sidecar port into webview: {e}"));
                        } else {
                            crate::log::global_log(&format!("[ymir] Sidecar port {} injected into webview", port));
                        }
                    } else {
                        crate::log::global_log("[ymir] WARNING: main window not found");
                    }
                });

                // Block setup until sidecar is ready
                tauri::async_runtime::block_on(handle).expect("sidecar startup failed");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_tauri_config])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.try_state::<AppState>();
                if let Some(state) = state {
                    // Recover from mutex poisoning so the sidecar is always cleaned up.
                    let mut guard = state.sidecar_child.lock().unwrap_or_else(|e| e.into_inner());
                    if let Some(child) = guard.take() {
                        let _ = child.kill();
                        crate::log::global_log("[ymir] Sidecar killed on window close");
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

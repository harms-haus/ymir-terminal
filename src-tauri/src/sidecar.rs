use regex::Regex;
use std::path::PathBuf;
use std::time::Duration;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

const STARTUP_TIMEOUT_SECS: u64 = 15;

pub struct SidecarManager;

impl SidecarManager {
    /// Resolve the static files directory for the client SPA.
    /// In dev mode: uses CARGO_MANIFEST_DIR to find apps/client/dist relative to workspace root.
    /// In production: uses the Tauri resource directory.
    pub fn resolve_static_dir(_app: &tauri::AppHandle) -> Result<String, String> {
        #[cfg(debug_assertions)]
        {
            let manifest_dir =
                std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
            let path = PathBuf::from(manifest_dir)
                .parent()
                .ok_or("no parent dir")?
                .join("apps/client/dist");
            Ok(path.to_string_lossy().to_string())
        }

        #[cfg(not(debug_assertions))]
        {
            let resource_dir = app
                .path()
                .resource_dir()
                .map_err(|e| format!("failed to get resource dir: {}", e))?;
            Ok(resource_dir
                .join("client/dist")
                .to_string_lossy()
                .to_string())
        }
    }

    /// Start the sidecar process and wait for it to be ready.
    /// Returns (CommandChild, assigned_port).
    ///
    /// CRITICAL: This function BLOCKS (awaits) until the port line is parsed from stdout.
    /// The caller MUST NOT set the webview URL until this returns successfully.
    ///
    /// The password is passed via YMIR_PASSWORD environment variable (NOT CLI arg) to avoid
    /// exposure via /proc filesystem.
    pub async fn start_sidecar(
        app: &tauri::AppHandle,
        password: &str,
        static_dir: &str,
    ) -> Result<(tauri_plugin_shell::process::CommandChild, u16), String> {
        let (mut rx, child) = app
            .shell()
            .sidecar("binaries/ymir-server")
            .map_err(|e| format!("failed to create sidecar command: {}", e))?
            .args(["--port", "0", "--host", "127.0.0.1", "--staticDir", static_dir])
            .env("YMIR_PASSWORD", password)
            .spawn()
            .map_err(|e| format!("failed to spawn sidecar: {}", e))?;

        // Parse the port from stdout
        let port_re = Regex::new(r"Ymir server listening on 127\.0\.0\.1:(\d+)").unwrap();
        let timeout = tokio::time::timeout(
            Duration::from_secs(STARTUP_TIMEOUT_SECS),
            async {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let output = String::from_utf8_lossy(&line);
                            eprintln!("[sidecar stdout] {}", output);
                            if let Some(caps) = port_re.captures(&output) {
                                let port: u16 = caps[1]
                                    .parse()
                                    .map_err(|e: std::num::ParseIntError| e.to_string())?;
                                return Ok(port);
                            }
                        }
                        CommandEvent::Stderr(line) => {
                            let output = String::from_utf8_lossy(&line);
                            eprintln!("[sidecar stderr] {}", output);
                        }
                        CommandEvent::Terminated(payload) => {
                            return Err(format!(
                                "Sidecar exited prematurely with code: {:?}",
                                payload.code
                            ));
                        }
                        _ => {}
                    }
                }
                Err("Sidecar stdout closed without port line".to_string())
            },
        )
        .await;

        match timeout {
            Ok(Ok(port)) => Ok((child, port)),
            Ok(Err(e)) => {
                let _ = child.kill();
                Err(format!("Sidecar failed to start: {}", e))
            }
            Err(_) => {
                let _ = child.kill();
                Err(format!(
                    "Sidecar startup timed out after {} seconds",
                    STARTUP_TIMEOUT_SECS
                ))
            }
        }
    }
}

use regex::Regex;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

const STARTUP_TIMEOUT_SECS: u64 = 15;

pub struct SidecarManager;

impl SidecarManager {
    /// Resolve the static files directory for the client SPA.
    /// In dev mode: uses CARGO_MANIFEST_DIR to find apps/client/dist relative to workspace root.
    /// In production: uses the Tauri resource directory.
    #[allow(unused_variables)]
    pub fn resolve_static_dir(app: &tauri::AppHandle) -> Result<String, String> {
        // Check env var override first (for non-bundled installations)
        if let Ok(dir) = std::env::var("YMIR_STATIC_DIR") {
            let path = std::path::Path::new(&dir);
            if path.exists() {
                crate::log::global_log(&format!("[ymir] Using YMIR_STATIC_DIR={:?}", dir));
                return Ok(dir);
            }
            crate::log::global_log(&format!(
                "[ymir] WARNING: YMIR_STATIC_DIR={:?} does not exist, falling back",
                dir
            ));
        }

        #[cfg(debug_assertions)]
        {
            let manifest_dir =
                std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
            let path = PathBuf::from(manifest_dir)
                .parent()
                .ok_or("no parent dir")?
                .join("apps/client/dist");
            let resolved = path.to_string_lossy().to_string();
            crate::log::global_log(&format!("[ymir] Static dir: {}", resolved));
            Ok(resolved)
        }

        #[cfg(not(debug_assertions))]
        {
            let resource_dir = app
                .path()
                .resource_dir()
                .map_err(|e| format!("failed to get resource dir: {}", e))?;
            let resource_path = resource_dir.join("client/dist");

            if resource_path.exists() {
                let resolved = resource_path.to_string_lossy().to_string();
                crate::log::global_log(&format!("[ymir] Static dir: {}", resolved));
                return Ok(resolved);
            }

            // Fallbacks: check paths relative to the executable directory
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.to_path_buf()));

            let mut fallbacks: Vec<(String, std::path::PathBuf)> = Vec::new();

            if let Some(ref dir) = exe_dir {
                fallbacks.push((
                    "<exe_dir>/client-dist/".to_string(),
                    dir.join("client-dist"),
                ));
                fallbacks.push((
                    "<exe_dir>/../client-dist/".to_string(),
                    dir.parent().map(|p| p.join("client-dist")).unwrap_or_default(),
                ));
                fallbacks.push((
                    "<exe_dir>/../apps/client/dist/".to_string(),
                    dir.parent().map(|p| p.join("apps").join("client").join("dist")).unwrap_or_default(),
                ));
            }

            for (label, path) in &fallbacks {
                if path.exists() {
                    let resolved = path.to_string_lossy().to_string();
                    crate::log::global_log(&format!(
                        "[ymir] Static dir (fallback {}): {}",
                        label, resolved
                    ));
                    return Ok(resolved);
                }
            }

            // Nothing found — report all attempted paths
            let mut tried: Vec<String> = vec![format!(
                "resource_dir/client/dist: {:?}",
                resource_path
            )];
            for (label, path) in &fallbacks {
                tried.push(format!("{}: {:?}", label, path));
            }
            Err(format!(
                "Could not find static files. Tried:\n  {}",
                tried.join("\n  ")
            ))
        }
    }

    /// Configure a shell command with the standard sidecar args and environment.
    fn configure_command(
        cmd: tauri_plugin_shell::process::Command,
        static_dir: &str,
        password: &str,
    ) -> tauri_plugin_shell::process::Command {
        cmd.args(["--port", "0", "--host", "127.0.0.1", "--staticDir", static_dir])
            .env("YMIR_PASSWORD", password)
    }

    fn target_triple() -> &'static str {
        #[cfg(all(target_arch = "x86_64", target_os = "windows"))]
        { return "x86_64-pc-windows-msvc"; }
        #[cfg(all(target_arch = "aarch64", target_os = "windows"))]
        { return "aarch64-pc-windows-msvc"; }
        #[cfg(all(target_arch = "x86_64", target_os = "linux"))]
        { return "x86_64-unknown-linux-gnu"; }
        #[cfg(all(target_arch = "aarch64", target_os = "linux"))]
        { return "aarch64-unknown-linux-gnu"; }
        #[cfg(all(target_arch = "x86_64", target_os = "macos"))]
        { return "x86_64-apple-darwin"; }
        #[cfg(all(target_arch = "aarch64", target_os = "macos"))]
        { return "aarch64-apple-darwin"; }
        #[allow(unreachable_code)]
        { "unknown" }
    }

    /// Try to find the sidecar binary next to the current executable.
    /// Returns the full path if it exists, None otherwise.
    fn find_exe_relative_server() -> Option<PathBuf> {
        let exe_dir = std::env::current_exe().ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))?;
        let ext = if cfg!(windows) { ".exe" } else { "" };
        let triple = Self::target_triple();

        let candidates: Vec<PathBuf> = vec![
            // Flat: ymir-server.exe next to the exe
            exe_dir.join(format!("ymir-server{}", ext)),
            // With target triple next to the exe
            exe_dir.join(format!("ymir-server-{}{}", triple, ext)),
            // Build output: ../src-tauri/binaries/ymir-server-{triple}.exe
            exe_dir.parent().map(|p| p.join("src-tauri").join("binaries").join(format!("ymir-server-{}{}", triple, ext))).unwrap_or_default(),
        ];

        for candidate in candidates {
            if candidate.exists() {
                return Some(candidate);
            }
        }
        None
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
        // Resolve which server binary to use, in priority order:
        //   1. YMIR_SERVER_PATH env var
        //   2. exe-relative fallback (ymir-server next to current executable)
        //   3. Tauri sidecar resolution (with target triple)
        let (mut rx, child) = if let Ok(server_path) = std::env::var("YMIR_SERVER_PATH") {
            let path = std::path::Path::new(&server_path);
            if !path.exists() {
                return Err(format!("YMIR_SERVER_PATH does not exist: {}", server_path));
            }
            crate::log::global_log(&format!("[ymir] Using YMIR_SERVER_PATH={:?}", server_path));
            Self::configure_command(app.shell().command(&server_path), static_dir, password)
                .spawn()
                .map_err(|e| format!("failed to spawn server from YMIR_SERVER_PATH: {}", e))?
        } else if let Some(exe_relative) = Self::find_exe_relative_server() {
            crate::log::global_log(&format!(
                "[ymir] Using exe-relative sidecar: {:?}",
                exe_relative
            ));
            let path_str = exe_relative.to_str().ok_or_else(|| {
                format!("exe-relative path is not valid UTF-8: {:?}", exe_relative)
            })?;
            Self::configure_command(app.shell().command(path_str), static_dir, password)
                .spawn()
                .map_err(|e| format!("failed to spawn exe-relative server: {}", e))?
        } else {
            crate::log::global_log("[ymir] Using Tauri sidecar resolution");
            let sidecar_cmd = app
                .shell()
                .sidecar("binaries/ymir-server")
                .map_err(|e| format!("failed to create sidecar command: {}", e))?;
            Self::configure_command(sidecar_cmd, static_dir, password)
                .spawn()
                .map_err(|e| format!("failed to spawn sidecar: {}", e))?
        };

        // Parse the port from stdout
        let port_re = Regex::new(r"Ymir server listening on 127\.0\.0\.1:(\d+)").unwrap();
        let timeout = tokio::time::timeout(
            Duration::from_secs(STARTUP_TIMEOUT_SECS),
            async {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let output = String::from_utf8_lossy(&line);
                            crate::log::global_log(&format!("[sidecar stdout] {}", output));
                            if let Some(caps) = port_re.captures(&output) {
                                let port: u16 = caps[1]
                                    .parse()
                                    .map_err(|e: std::num::ParseIntError| e.to_string())?;
                                return Ok(port);
                            }
                        }
                        CommandEvent::Stderr(line) => {
                            let output = String::from_utf8_lossy(&line);
                            crate::log::global_log(&format!("[sidecar stderr] {}", output));
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

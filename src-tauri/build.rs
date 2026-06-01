fn main() {
    // In dev builds, create a placeholder sidecar binary if the real one doesn't exist.
    // tauri-build checks for sidecar binaries at compile time, but in dev mode
    // the server is started by beforeDevCommand (bun run dev), not the sidecar.
    // For production builds, `bun run build:sidecar` replaces this with the real binary.
    let target =
        std::env::var("TARGET").unwrap_or_else(|_| "x86_64-unknown-linux-gnu".to_string());
    let binary_name = format!("ymir-server-{}", target);
    let binary_name = if target.contains("windows") {
        format!("{}.exe", binary_name)
    } else {
        binary_name
    };
    let binaries_dir = std::path::PathBuf::from("binaries");
    let binary_path = binaries_dir.join(&binary_name);

    if !binary_path.exists() {
        std::fs::create_dir_all(&binaries_dir).ok();
        let content = if target.contains("windows") {
            Vec::new()
        } else {
            b"#!/bin/sh\necho 'Placeholder sidecar - not used in dev mode'\n".to_vec()
        };
        std::fs::write(&binary_path, content).ok();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&binary_path, std::fs::Permissions::from_mode(0o755)).ok();
        }
        println!(
            "cargo:warning=Created placeholder sidecar binary: {}",
            binary_path.display()
        );
    }

    // Create a minimal client dist directory if it doesn't exist.
    // tauri-build validates bundle.resources at compile time, but in dev mode
    // the webview loads from Vite, not bundled files.
    let dist_dir = std::path::PathBuf::from("../apps/client/dist");
    if !dist_dir.exists() {
        std::fs::create_dir_all(&dist_dir).ok();
        std::fs::write(dist_dir.join("index.html"), "<!DOCTYPE html><html><body>placeholder</body></html>").ok();
        println!("cargo:warning=Created placeholder client dist directory");
    }

    tauri_build::build()
}

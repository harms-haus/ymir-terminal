fn main() {
    // Validate required environment variables that Cargo always provides.
    // These are guaranteed by Cargo but explicit checks produce clear errors
    // instead of silent miscompilation when running outside Cargo (e.g. IDE
    // indexing or manual cargo invocations with broken env).
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
        .expect("CARGO_MANIFEST_DIR not set — build must run through Cargo");
    let target = std::env::var("TARGET")
        .expect("TARGET not set — build must run through Cargo");

    let manifest_path = std::path::PathBuf::from(&manifest_dir);
    assert!(
        manifest_path.exists(),
        "CARGO_MANIFEST_DIR does not exist: {:?}",
        manifest_path
    );

    // In dev builds, create a placeholder sidecar binary if the real one doesn't exist.
    // tauri-build checks for sidecar binaries at compile time, but in dev mode
    // the server is started by beforeDevCommand (bun run dev), not the sidecar.
    // For production builds, `bun run build:sidecar` replaces this with the real binary.
    let binary_name = format!("ymir-server-{}", target);
    let binary_name = if target.contains("windows") {
        format!("{}.exe", binary_name)
    } else {
        binary_name
    };
    let binaries_dir = manifest_path.join("binaries");
    let binary_path = binaries_dir.join(&binary_name);

    if !binary_path.exists() {
        std::fs::create_dir_all(&binaries_dir)
            .expect(&format!("failed to create binaries dir {:?}", binaries_dir));
        let content = if target.contains("windows") {
            Vec::new()
        } else {
            b"#!/bin/sh\necho 'Placeholder sidecar - not used in dev mode'\n".to_vec()
        };
        std::fs::write(&binary_path, &content)
            .expect(&format!("failed to write placeholder sidecar {:?}", binary_path));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&binary_path, std::fs::Permissions::from_mode(0o755))
                .expect(&format!("failed to chmod sidecar {:?}", binary_path));
        }
        println!(
            "cargo:warning=Created placeholder sidecar binary: {}",
            binary_path.display()
        );
    }

    // Create a minimal client dist directory if it doesn't exist.
    // tauri-build validates bundle.resources at compile time, but in dev mode
    // the webview loads from Vite, not bundled files.
    let dist_dir = manifest_path.parent()
        .expect("CARGO_MANIFEST_DIR has no parent")
        .join("apps/client/dist");
    if !dist_dir.exists() {
        std::fs::create_dir_all(&dist_dir)
            .expect(&format!("failed to create client dist dir {:?}", dist_dir));
        std::fs::write(dist_dir.join("index.html"), "<!DOCTYPE html><html><body>placeholder</body></html>")
            .expect(&format!("failed to write placeholder index.html in {:?}", dist_dir));
        println!("cargo:warning=Created placeholder client dist directory");
    }

    tauri_build::build()
}

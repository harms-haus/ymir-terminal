use std::fs;
use std::path::Path;

pub fn generate_password() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("failed to generate random bytes");
    hex::encode(bytes)
}

pub fn get_or_create_password(config_dir: &Path) -> String {
    let password_file = config_dir.join("tauri-password");
    if password_file.exists() {
        fs::read_to_string(&password_file)
            .expect("failed to read password file")
            .trim()
            .to_string()
    } else {
        let password = generate_password();
        fs::create_dir_all(config_dir).expect("failed to create config dir");
        fs::write(&password_file, &password).expect("failed to write password file");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&password_file, fs::Permissions::from_mode(0o600))
                .expect("failed to set password file permissions");
        }
        password
    }
}

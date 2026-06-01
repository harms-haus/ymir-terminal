use std::fs::{self, File};
use std::io::Write;
use std::panic;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

static LOG: OnceLock<Mutex<File>> = OnceLock::new();

pub fn init() -> Result<(), String> {
    let log_path = if cfg!(windows) {
        let local_app_data = std::env::var("LOCALAPPDATA")
            .map_err(|e| format!("failed to read %LOCALAPPDATA%: {e}"))?;
        let dir = std::path::PathBuf::from(local_app_data).join("ymir");
        fs::create_dir_all(&dir)
            .map_err(|e| format!("failed to create log directory {:?}: {e}", dir))?;
        dir.join("ymir.log")
    } else {
        let home = std::env::var("HOME")
            .map_err(|e| format!("failed to read $HOME: {e}"))?;
        let dir = std::path::PathBuf::from(home).join(".ymir");
        fs::create_dir_all(&dir)
            .map_err(|e| format!("failed to create log directory {:?}: {e}", dir))?;
        dir.join("ymir.log")
    };

    let file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("failed to open log file {:?}: {e}", log_path))?;

    LOG.set(Mutex::new(file))
        .map_err(|_| "log already initialized".to_string())?;

    setup_panic_hook();

    Ok(())
}

pub fn global_log(msg: &str) {
    let timestamp = format_timestamp();
    let line = format!("[{timestamp}] {msg}\n");
    eprint!("{line}");
    if let Some(mutex) = LOG.get() {
        if let Ok(mut file) = mutex.lock() {
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
        }
    }
}

fn format_timestamp() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let total_secs = duration.as_secs();

    // Days since epoch
    let days = total_secs / 86400;
    // Time of day
    let secs_of_day = total_secs % 86400;
    let hours = secs_of_day / 3600;
    let minutes = (secs_of_day % 3600) / 60;
    let seconds = secs_of_day % 60;

    // Compute year, month, day from days since epoch (UTC)
    let (year, month, day) = days_to_ymd(days);

    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        year, month, day, hours, minutes, seconds
    )
}

/// Convert days since Unix epoch to (year, month, day) in UTC.
fn days_to_ymd(mut days: u64) -> (u64, u64, u64) {
    // Algorithm from https://howardhinnant.github.io/date_algorithms.html
    // Shift to era starting March 1, 0000
    days += 719468; // offset from civil (Jan 1, 1970) to algorithm epoch
    let era = days / 146097; // 400-year era
    let doe = days - era * 146097; // day of era [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // year of era [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153; // month index [0, 11] starting from March
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

fn setup_panic_hook() {
    panic::set_hook(Box::new(|panic_info| {
        let payload = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "unknown panic payload".to_string()
        };

        let location = panic_info
            .location()
            .map(|loc| format!("at {}:{}:{}", loc.file(), loc.line(), loc.column()))
            .unwrap_or_else(|| "at unknown location".to_string());

        let msg = format!("PANIC: {payload} {location}");
        global_log(&msg);
    }));
}

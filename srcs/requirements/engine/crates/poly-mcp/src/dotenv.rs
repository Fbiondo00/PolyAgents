//! Minimal dotenv loader for the MCP server.
//!
//! OpenClaw spawns this server as a stdio child and (deliberately) does not
//! receive secrets inline. Instead we read them from a sidecar env file whose
//! path comes from `POLYAGENTS_ENV_FILE` (default `~/.openclaw/polyagents.env`,
//! created by `setup-openclaw.sh` from the repo `.env`, mode 0600).
//!
//! Variables already present in the process environment always win — this only
//! fills gaps. Comments (`#`) and blank lines are skipped; a single layer of
//! surrounding quotes is stripped from values.

use std::path::PathBuf;

/// Load the sidecar env file if it exists. Errors are logged and swallowed:
/// a missing/unreadable file is not fatal (the process env may already have
/// everything, e.g. when run directly from the shell during development).
pub fn load_sidecar() {
    let path = match resolve_path() {
        Some(p) => p,
        None => return,
    };
    if !path.exists() {
        return;
    }
    let contents = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("poly-mcp: could not read {}: {}", path.display(), e);
            return;
        }
    };
    for raw in contents.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') || !line.contains('=') {
            continue;
        }
        let (key, val) = line.split_once('=').unwrap();
        let key = key.trim();
        let mut val = val.trim().to_string();
        // strip one layer of surrounding quotes
        if (val.starts_with('"') && val.ends_with('"'))
            || (val.starts_with('\'') && val.ends_with('\''))
        {
            val = val[1..val.len() - 1].to_string();
        }
        // existing process env wins
        if std::env::var_os(key).is_none() {
            // SAFETY: this runs single-threaded at the very start of main,
            // before any async tasks or threads are spawned, so there is no
            // concurrent access to the process environment.
            unsafe { std::env::set_var(key, &val) };
        }
    }
}

fn resolve_path() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("POLYAGENTS_ENV_FILE") {
        return Some(PathBuf::from(p));
    }
    // default: ~/.openclaw/polyagents.env
    dirs_home().map(|h| h.join(".openclaw").join("polyagents.env"))
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

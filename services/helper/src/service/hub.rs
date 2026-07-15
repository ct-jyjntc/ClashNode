use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::VecDeque;
use std::fs::File;
use std::io::{BufRead, Error, Read};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::{io, thread};
use warp::{Filter, Reply};

/// Local control port — offset from FlClash (47890) to avoid collisions.
const LISTEN_PORT: u16 = 47891;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct StartParams {
    pub path: String,
    /// Single arg (FlClash-style). Prefer `args` for mihomo multi-flag launches.
    #[serde(default)]
    pub arg: String,
    #[serde(default)]
    pub args: Vec<String>,
    /// Working directory for the child process (mihomo `-d` home).
    #[serde(default)]
    pub cwd: Option<String>,
}

fn sha256_file(path: &str) -> Result<String, Error> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 4096];

    loop {
        let bytes_read = file.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

static LOGS: Lazy<Arc<Mutex<VecDeque<String>>>> =
    Lazy::new(|| Arc::new(Mutex::new(VecDeque::with_capacity(100))));
static PROCESS: Lazy<Arc<Mutex<Option<std::process::Child>>>> =
    Lazy::new(|| Arc::new(Mutex::new(None)));

fn start(start_params: StartParams) -> impl Reply {
    let token = env!("TOKEN");
    // Release builds: only allow the mihomo binary whose SHA256 was baked in as TOKEN.
    // Empty TOKEN (dev build without env) skips the check.
    if !cfg!(debug_assertions) && !token.is_empty() {
        let sha256 = sha256_file(start_params.path.as_str()).unwrap_or_default();
        if sha256 != token {
            return format!(
                "The SHA256 hash of the program requesting execution is: {}. \
                 The helper program only allows execution of applications with the SHA256 hash: {}.",
                sha256, token
            );
        }
    }

    stop_inner();

    let mut cmd = Command::new(&start_params.path);
    if let Some(cwd) = start_params.cwd.as_ref().filter(|s| !s.is_empty()) {
        cmd.current_dir(cwd);
    }
    cmd.stderr(Stdio::piped()).stdout(Stdio::null());

    if !start_params.args.is_empty() {
        cmd.args(&start_params.args);
    } else if !start_params.arg.is_empty() {
        cmd.arg(&start_params.arg);
    }

    let mut process = PROCESS.lock().unwrap();
    match cmd.spawn() {
        Ok(child) => {
            *process = Some(child);
            if let Some(ref mut child) = *process {
                if let Some(stderr) = child.stderr.take() {
                    let reader = io::BufReader::new(stderr);
                    thread::spawn(move || {
                        for line in reader.lines() {
                            match line {
                                Ok(output) => log_message(output),
                                Err(_) => break,
                            }
                        }
                    });
                }
            }
            "".to_string()
        }
        Err(e) => {
            log_message(e.to_string());
            e.to_string()
        }
    }
}

fn stop_inner() {
    let mut process = PROCESS.lock().unwrap();
    if let Some(mut child) = process.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    *process = None;
}

fn stop() -> impl Reply {
    stop_inner();
    "".to_string()
}

fn log_message(message: String) {
    let mut log_buffer = LOGS.lock().unwrap();
    if log_buffer.len() == 100 {
        log_buffer.pop_front();
    }
    log_buffer.push_back(format!("{}\n", message));
}

fn get_logs() -> impl Reply {
    let log_buffer = LOGS.lock().unwrap();
    let value = log_buffer
        .iter()
        .cloned()
        .collect::<Vec<String>>()
        .join("\n");
    warp::reply::with_header(value, "Content-Type", "text/plain")
}

pub async fn run_service() -> anyhow::Result<()> {
    let api_ping = warp::get().and(warp::path("ping")).map(|| env!("TOKEN"));

    let api_start = warp::post()
        .and(warp::path("start"))
        .and(warp::body::json())
        .map(|start_params: StartParams| start(start_params));

    let api_stop = warp::post().and(warp::path("stop")).map(|| stop());

    let api_logs = warp::get().and(warp::path("logs")).map(|| get_logs());

    warp::serve(api_ping.or(api_start).or(api_stop).or(api_logs))
        .run(([127, 0, 0, 1], LISTEN_PORT))
        .await;

    Ok(())
}

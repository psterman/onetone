use std::time::Instant;

use serde::Serialize;

use crate::AppState;

#[derive(Debug, Default)]
pub struct ProcessUsageSampler {
    last: Option<ProcessUsageSample>,
}

#[derive(Debug, Clone, Copy)]
struct ProcessUsageSample {
    at: Instant,
    cpu_time_100ns: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessUsageSnapshot {
    #[serde(rename = "supported")]
    pub supported: bool,
    #[serde(rename = "memoryBytes")]
    pub memory_bytes: u64,
    #[serde(rename = "memoryMb")]
    pub memory_mb: f64,
    #[serde(rename = "cpuPercent")]
    pub cpu_percent: f64,
    #[serde(rename = "coreCount")]
    pub core_count: u32,
}

#[cfg(windows)]
fn fallback_memory_bytes() -> u64 {
    use std::mem::size_of;

    use winapi::um::processthreadsapi::GetCurrentProcess;
    use winapi::um::psapi::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS_EX};

    unsafe {
        let mut counters: PROCESS_MEMORY_COUNTERS_EX = std::mem::zeroed();
        counters.cb = size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32;
        if GetProcessMemoryInfo(
            GetCurrentProcess(),
            &mut counters as *mut PROCESS_MEMORY_COUNTERS_EX as *mut _,
            size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32,
        ) != 0
        {
            counters.PrivateUsage as u64
        } else {
            0
        }
    }
}

impl ProcessUsageSampler {
    pub fn snapshot(&mut self) -> ProcessUsageSnapshot {
        snapshot_impl(&mut self.last)
    }
}

pub fn process_usage_status(state: &AppState) -> serde_json::Value {
    let mut sampler = state.process_usage_sampler.lock();
    let snapshot = sampler.snapshot();
    let memory_bytes = if snapshot.memory_bytes > 0 {
        snapshot.memory_bytes
    } else {
        #[cfg(windows)]
        {
            fallback_memory_bytes()
        }
        #[cfg(not(windows))]
        {
            0
        }
    };
    let final_snapshot = ProcessUsageSnapshot {
        supported: snapshot.supported || memory_bytes > 0,
        memory_bytes,
        memory_mb: memory_bytes as f64 / (1024.0 * 1024.0),
        cpu_percent: snapshot.cpu_percent,
        core_count: snapshot.core_count,
    };
    serde_json::to_value(final_snapshot).unwrap_or_else(|_| {
        serde_json::json!({
            "supported": true,
            "memoryBytes": memory_bytes,
            "memoryMb": memory_bytes as f64 / (1024.0 * 1024.0),
            "cpuPercent": 0.0,
            "coreCount": 1
        })
    })
}

#[cfg(windows)]
fn snapshot_impl(last: &mut Option<ProcessUsageSample>) -> ProcessUsageSnapshot {
    use std::mem::size_of;

    use winapi::shared::minwindef::FILETIME;
    use winapi::um::processthreadsapi::{GetCurrentProcess, GetProcessTimes};
    use winapi::um::psapi::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS_EX};

    fn filetime_to_u64(ft: FILETIME) -> u64 {
        ((ft.dwHighDateTime as u64) << 32) | ft.dwLowDateTime as u64
    }

    unsafe {
        let process = GetCurrentProcess();

        let mut counters: PROCESS_MEMORY_COUNTERS_EX = std::mem::zeroed();
        counters.cb = size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32;
        let memory_ok = GetProcessMemoryInfo(
            process,
            &mut counters as *mut PROCESS_MEMORY_COUNTERS_EX as *mut _,
            size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32,
        ) != 0;

        let mut created: FILETIME = std::mem::zeroed();
        let mut exited: FILETIME = std::mem::zeroed();
        let mut kernel: FILETIME = std::mem::zeroed();
        let mut user: FILETIME = std::mem::zeroed();
        let cpu_ok =
            GetProcessTimes(process, &mut created, &mut exited, &mut kernel, &mut user) != 0;

        let core_count = std::thread::available_parallelism()
            .map(|n| n.get() as u32)
            .unwrap_or(1);
        let now = Instant::now();
        let memory_bytes = if memory_ok { counters.PrivateUsage as u64 } else { 0 };
        let cpu_time_100ns = if cpu_ok {
            filetime_to_u64(kernel).saturating_add(filetime_to_u64(user))
        } else {
            0
        };

        let cpu_percent = if cpu_ok {
            if let Some(prev) = last.as_ref().copied() {
                let elapsed_100ns = now.duration_since(prev.at).as_secs_f64() * 10_000_000.0;
                if elapsed_100ns > 0.0 {
                    let delta = cpu_time_100ns.saturating_sub(prev.cpu_time_100ns) as f64;
                    (delta / elapsed_100ns * 100.0).clamp(0.0, f64::from(core_count) * 100.0)
                } else {
                    0.0
                }
            } else {
                0.0
            }
        } else {
            0.0
        };

        *last = Some(ProcessUsageSample {
            at: now,
            cpu_time_100ns,
        });

        ProcessUsageSnapshot {
            supported: memory_ok && cpu_ok,
            memory_bytes,
            memory_mb: memory_bytes as f64 / (1024.0 * 1024.0),
            cpu_percent,
            core_count,
        }
    }
}

#[cfg(not(windows))]
fn snapshot_impl(_last: &mut Option<ProcessUsageSample>) -> ProcessUsageSnapshot {
    ProcessUsageSnapshot {
        supported: false,
        memory_bytes: 0,
        memory_mb: 0.0,
        cpu_percent: 0.0,
        core_count: 1,
    }
}

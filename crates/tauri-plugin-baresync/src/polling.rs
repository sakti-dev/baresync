use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::{mpsc, Notify};
use tokio::time::{Duration, Instant};

use crate::commands::{PluginEvent, PluginEventSink};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PollingStatus {
    pub running: bool,
    pub paused: bool,
    pub last_sync_at: Option<String>,
}

pub struct PollingState {
    pub paused: bool,
    pub last_sync_at: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PollingSyncOutcome {
    pub data_changed: bool,
    pub status_changed: bool,
}

impl PollingSyncOutcome {
    pub fn completed(data_changed: bool) -> Self {
        Self {
            data_changed,
            status_changed: true,
        }
    }
}

pub enum ControlMsg {
    Pause,
    Resume,
    Stop,
    SyncCompleted,
}

fn try_begin_sync(sync_in_progress: &AtomicBool) -> bool {
    sync_in_progress
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_ok()
}

fn end_sync(sync_in_progress: &AtomicBool) {
    sync_in_progress.store(false, Ordering::Release);
}

async fn mark_sync_completed(state: &Arc<tokio::sync::Mutex<PollingState>>) {
    let mut st = state.lock().await;
    st.last_sync_at = Some(chrono::Utc::now().to_rfc3339());
}

pub async fn polling_loop<F, Fut>(
    scope_id: String,
    interval_secs: u64,
    sync_fn: F,
    event_sink: Arc<dyn PluginEventSink>,
    notify: Arc<Notify>,
    mut control_rx: mpsc::Receiver<ControlMsg>,
    sync_in_progress: Arc<AtomicBool>,
    state: Arc<tokio::sync::Mutex<PollingState>>,
) where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<PollingSyncOutcome, String>>,
{
    let interval = Duration::from_secs(interval_secs);
    let mut next_tick = Instant::now() + interval;

    loop {
        let timer = tokio::time::sleep_until(next_tick);

        tokio::select! {
            _ = timer => {
                {
                    let st = state.lock().await;
                    if st.paused {
                        next_tick = Instant::now() + interval;
                        continue;
                    }
                }

                if !try_begin_sync(&sync_in_progress) {
                    next_tick = Instant::now() + interval;
                    continue;
                }

                if let Ok(outcome) = sync_fn(scope_id.clone()).await {
                    if outcome.data_changed {
                        event_sink.emit(PluginEvent::DataChanged);
                    }
                    if outcome.status_changed {
                        event_sink.emit(PluginEvent::SyncStatusChanged);
                    }
                }
                end_sync(&sync_in_progress);

                mark_sync_completed(&state).await;
                next_tick = Instant::now() + interval;
            }

            _ = notify.notified() => {
                {
                    let st = state.lock().await;
                    if st.paused {
                        next_tick = Instant::now() + interval;
                        continue;
                    }
                }

                if !try_begin_sync(&sync_in_progress) {
                    next_tick = Instant::now() + interval;
                    continue;
                }

                if let Ok(outcome) = sync_fn(scope_id.clone()).await {
                    if outcome.data_changed {
                        event_sink.emit(PluginEvent::DataChanged);
                    }
                    if outcome.status_changed {
                        event_sink.emit(PluginEvent::SyncStatusChanged);
                    }
                }
                end_sync(&sync_in_progress);

                mark_sync_completed(&state).await;
                next_tick = Instant::now() + interval;
            }

            Some(msg) = control_rx.recv() => {
                match msg {
                    ControlMsg::Pause => {
                        let mut st = state.lock().await;
                        st.paused = true;
                    }
                    ControlMsg::Resume => {
                        let mut st = state.lock().await;
                        st.paused = false;
                        next_tick = Instant::now() + interval;
                    }
                    ControlMsg::Stop => {
                        break;
                    }
                    ControlMsg::SyncCompleted => {
                        {
                            let st = state.lock().await;
                            if st.paused {
                                next_tick = Instant::now() + interval;
                                continue;
                            }
                        }

                        mark_sync_completed(&state).await;
                        next_tick = Instant::now() + interval;
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{PluginEvent, PluginEventSink};
    use std::sync::atomic::AtomicUsize;

    #[derive(Clone, Default)]
    struct RecordingEventSink {
        events: Arc<std::sync::Mutex<Vec<PluginEvent>>>,
    }

    impl RecordingEventSink {
        fn events(&self) -> Vec<PluginEvent> {
            self.events
                .lock()
                .expect("event sink mutex poisoned")
                .clone()
        }
    }

    impl PluginEventSink for RecordingEventSink {
        fn emit(&self, event: PluginEvent) {
            self.events
                .lock()
                .expect("event sink mutex poisoned")
                .push(event);
        }
    }

    #[tokio::test]
    async fn timer_triggers_sync_and_resets() {
        let sync_count = Arc::new(AtomicUsize::new(0));
        let sync_count_clone = sync_count.clone();
        let sync_fn = move |_scope_id: String| {
            let count = sync_count_clone.clone();
            async move {
                count.fetch_add(1, Ordering::Relaxed);
                Ok(PollingSyncOutcome::completed(true))
            }
        };

        let event_sink = Arc::new(RecordingEventSink::default());
        let notify = Arc::new(Notify::new());
        let sync_in_progress = Arc::new(AtomicBool::new(false));
        let state = Arc::new(tokio::sync::Mutex::new(PollingState {
            paused: false,
            last_sync_at: None,
        }));
        let (tx, rx) = mpsc::channel(10);

        let handle = tokio::spawn(polling_loop(
            "test-scope".to_string(),
            1,
            sync_fn,
            event_sink.clone(),
            notify.clone(),
            rx,
            sync_in_progress,
            state.clone(),
        ));

        tokio::time::sleep(Duration::from_millis(1500)).await;
        tx.send(ControlMsg::Stop).await.unwrap();
        handle.await.unwrap();

        assert!(sync_count.load(Ordering::Relaxed) >= 1);
        let st = state.lock().await;
        assert!(st.last_sync_at.is_some());
        assert_eq!(
            event_sink.events(),
            vec![PluginEvent::DataChanged, PluginEvent::SyncStatusChanged]
        );
    }

    #[tokio::test]
    async fn notify_triggers_immediate_sync() {
        let sync_count = Arc::new(AtomicUsize::new(0));
        let sync_count_clone = sync_count.clone();
        let sync_fn = move |_scope_id: String| {
            let count = sync_count_clone.clone();
            async move {
                count.fetch_add(1, Ordering::Relaxed);
                Ok(PollingSyncOutcome::completed(true))
            }
        };

        let event_sink = Arc::new(RecordingEventSink::default());
        let notify = Arc::new(Notify::new());
        let sync_in_progress = Arc::new(AtomicBool::new(false));
        let state = Arc::new(tokio::sync::Mutex::new(PollingState {
            paused: false,
            last_sync_at: None,
        }));
        let (tx, rx) = mpsc::channel(10);

        let handle = tokio::spawn(polling_loop(
            "test-scope".to_string(),
            300,
            sync_fn,
            event_sink.clone(),
            notify.clone(),
            rx,
            sync_in_progress,
            state.clone(),
        ));

        tokio::time::sleep(Duration::from_millis(50)).await;
        notify.notify_one();
        tokio::time::sleep(Duration::from_millis(100)).await;

        tx.send(ControlMsg::Stop).await.unwrap();
        handle.await.unwrap();

        assert!(sync_count.load(Ordering::Relaxed) >= 1);
        assert_eq!(
            event_sink.events(),
            vec![PluginEvent::DataChanged, PluginEvent::SyncStatusChanged]
        );
    }

    #[tokio::test]
    async fn pause_stops_syncs() {
        let sync_count = Arc::new(AtomicUsize::new(0));
        let sync_count_clone = sync_count.clone();
        let sync_fn = move |_scope_id: String| {
            let count = sync_count_clone.clone();
            async move {
                count.fetch_add(1, Ordering::Relaxed);
                Ok(PollingSyncOutcome::completed(true))
            }
        };

        let event_sink = Arc::new(RecordingEventSink::default());
        let notify = Arc::new(Notify::new());
        let sync_in_progress = Arc::new(AtomicBool::new(false));
        let state = Arc::new(tokio::sync::Mutex::new(PollingState {
            paused: false,
            last_sync_at: None,
        }));
        let (tx, rx) = mpsc::channel(10);

        let handle = tokio::spawn(polling_loop(
            "test-scope".to_string(),
            1,
            sync_fn,
            event_sink,
            notify.clone(),
            rx,
            sync_in_progress,
            state.clone(),
        ));

        tokio::time::sleep(Duration::from_millis(50)).await;
        tx.send(ControlMsg::Pause).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;
        let count_at_pause = sync_count.load(Ordering::Relaxed);

        tokio::time::sleep(Duration::from_millis(1500)).await;
        assert_eq!(sync_count.load(Ordering::Relaxed), count_at_pause);

        tx.send(ControlMsg::Stop).await.unwrap();
        handle.await.unwrap();
    }

    #[tokio::test]
    async fn resume_resets_timer() {
        let sync_count = Arc::new(AtomicUsize::new(0));
        let sync_count_clone = sync_count.clone();
        let sync_fn = move |_scope_id: String| {
            let count = sync_count_clone.clone();
            async move {
                count.fetch_add(1, Ordering::Relaxed);
                Ok(PollingSyncOutcome::completed(false))
            }
        };

        let event_sink = Arc::new(RecordingEventSink::default());
        let notify = Arc::new(Notify::new());
        let sync_in_progress = Arc::new(AtomicBool::new(false));
        let state = Arc::new(tokio::sync::Mutex::new(PollingState {
            paused: false,
            last_sync_at: None,
        }));
        let (tx, rx) = mpsc::channel(10);

        let handle = tokio::spawn(polling_loop(
            "test-scope".to_string(),
            1,
            sync_fn,
            event_sink,
            notify.clone(),
            rx,
            sync_in_progress,
            state.clone(),
        ));

        tokio::time::sleep(Duration::from_millis(50)).await;
        tx.send(ControlMsg::Pause).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;

        tx.send(ControlMsg::Resume).await.unwrap();
        tokio::time::sleep(Duration::from_millis(1500)).await;

        tx.send(ControlMsg::Stop).await.unwrap();
        handle.await.unwrap();

        assert!(sync_count.load(Ordering::Relaxed) >= 1);
    }

    #[tokio::test]
    async fn concurrency_guard_skips_when_busy() {
        let sync_count = Arc::new(AtomicUsize::new(0));
        let sync_count_clone = sync_count.clone();
        let sync_fn = move |_scope_id: String| {
            let count = sync_count_clone.clone();
            async move {
                tokio::time::sleep(Duration::from_millis(200)).await;
                count.fetch_add(1, Ordering::Relaxed);
                Ok(PollingSyncOutcome::completed(false))
            }
        };

        let event_sink = Arc::new(RecordingEventSink::default());
        let notify = Arc::new(Notify::new());
        let sync_in_progress = Arc::new(AtomicBool::new(false));
        let state = Arc::new(tokio::sync::Mutex::new(PollingState {
            paused: false,
            last_sync_at: None,
        }));
        let (tx, rx) = mpsc::channel(10);

        let handle = tokio::spawn(polling_loop(
            "test-scope".to_string(),
            1,
            sync_fn,
            event_sink,
            notify.clone(),
            rx,
            sync_in_progress,
            state.clone(),
        ));

        tokio::time::sleep(Duration::from_millis(100)).await;
        notify.notify_one();
        notify.notify_one();
        tokio::time::sleep(Duration::from_millis(500)).await;

        tx.send(ControlMsg::Stop).await.unwrap();
        handle.await.unwrap();

        let count = sync_count.load(Ordering::Relaxed);
        assert!(count >= 1);
    }

    #[tokio::test]
    async fn sync_completed_resets_timer() {
        let sync_count = Arc::new(AtomicUsize::new(0));
        let sync_count_clone = sync_count.clone();
        let sync_fn = move |_scope_id: String| {
            let count = sync_count_clone.clone();
            async move {
                count.fetch_add(1, Ordering::Relaxed);
                Ok(PollingSyncOutcome::completed(false))
            }
        };

        let event_sink = Arc::new(RecordingEventSink::default());
        let notify = Arc::new(Notify::new());
        let sync_in_progress = Arc::new(AtomicBool::new(false));
        let state = Arc::new(tokio::sync::Mutex::new(PollingState {
            paused: false,
            last_sync_at: None,
        }));
        let (tx, rx) = mpsc::channel(10);

        let handle = tokio::spawn(polling_loop(
            "test-scope".to_string(),
            1,
            sync_fn,
            event_sink,
            notify.clone(),
            rx,
            sync_in_progress,
            state.clone(),
        ));

        tokio::time::sleep(Duration::from_millis(500)).await;
        tx.send(ControlMsg::SyncCompleted).await.unwrap();
        tokio::time::sleep(Duration::from_millis(700)).await;

        assert_eq!(sync_count.load(Ordering::Relaxed), 0);

        tx.send(ControlMsg::Stop).await.unwrap();
        handle.await.unwrap();
    }
}

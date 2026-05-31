import { useEffect, useRef, useState } from "react";
import { useSyncClient } from "../hooks/useBaresyncQuery";
import { useSyncState } from "../hooks/useSyncState";
import { POLL_INTERVAL_SECONDS } from "../lib/polling.constant";

const POLL_INTERVAL_MS = POLL_INTERVAL_SECONDS * 1000;

function getSecondsUntilNextPoll(lastSyncMs: number, nowMs: number) {
  const elapsedMs = Math.max(0, nowMs - lastSyncMs);
  const remainingMs = Math.max(0, POLL_INTERVAL_MS - elapsedMs);
  return Math.ceil(remainingMs / 1000);
}

function getPollingText(
  pollingStatus: ReturnType<typeof useSyncState>["pollingStatus"]
) {
  if (!pollingStatus) {
    return "—";
  }

  if (!pollingStatus.running) {
    return "Stopped";
  }

  if (pollingStatus.paused) {
    return "Paused";
  }

  return `Active, every ${POLL_INTERVAL_SECONDS}s`;
}

function getLastSyncText(input: {
  manualSyncCompletedAt: number | null;
  pluginLastSyncMs: number | null;
}) {
  if (input.pluginLastSyncMs) {
    return new Date(input.pluginLastSyncMs).toLocaleTimeString();
  }

  if (input.manualSyncCompletedAt) {
    return new Date(input.manualSyncCompletedAt).toLocaleTimeString();
  }

  return "Not yet";
}

function getLastSyncMs(input: {
  manualSyncCompletedAt: number | null;
  mountedAt: number;
  pluginLastSyncMs: number | null;
}) {
  const validPluginLastSyncMs = Number.isFinite(input.pluginLastSyncMs)
    ? (input.pluginLastSyncMs ?? 0)
    : 0;

  return Math.max(
    input.mountedAt,
    input.manualSyncCompletedAt ?? 0,
    validPluginLastSyncMs
  );
}

export function SyncPanel() {
  const client = useSyncClient();
  const { localState, pollingStatus, loading, refresh } = useSyncState();
  const mountedAt = useRef(Date.now());
  const [manualSyncCompletedAt, setManualSyncCompletedAt] = useState<
    number | null
  >(null);
  const [now, setNow] = useState(() => Date.now());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      await client.syncNow();
      setManualSyncCompletedAt(Date.now());
      await refresh();
    } finally {
      setSyncing(false);
    }
  }

  const pollingText = getPollingText(pollingStatus);
  const pluginLastSyncMs = pollingStatus?.last_sync_at
    ? Date.parse(pollingStatus.last_sync_at)
    : null;
  const lastSyncMs = getLastSyncMs({
    manualSyncCompletedAt,
    mountedAt: mountedAt.current,
    pluginLastSyncMs,
  });
  const nextPollSeconds =
    pollingStatus?.running && !pollingStatus.paused
      ? getSecondsUntilNextPoll(lastSyncMs, now)
      : null;
  const lastSyncText = getLastSyncText({
    manualSyncCompletedAt,
    pluginLastSyncMs,
  });

  return (
    <section className="rounded-3xl border border-cream-300 bg-cream-50 p-5 shadow-[0_24px_60px_rgba(49,33,17,0.08)]">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="font-medium font-serif text-wood-900 text-xl">Sync</h2>
        <button
          className="cursor-pointer rounded-full bg-forest-500 px-5 py-2 font-medium text-sm text-white transition-all hover:bg-forest-600 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          disabled={syncing}
          onClick={handleSync}
          type="button"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-wood-500">Loading sync state…</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
          <Stat
            label="Dirty rows"
            value={String(localState?.local_dirty_count ?? "—")}
          />
          <Stat
            label="Server cursor"
            value={localState?.last_server_watermark || "—"}
          />
          <Stat
            label="Needs baseline"
            value={localState?.needs_baseline_sync ? "Yes" : "No"}
          />
          <Stat label="Polling" value={pollingText} />
          <Stat label="Last sync" value={lastSyncText} />
          <Stat
            label="Next poll"
            value={nextPollSeconds === null ? "—" : `${nextPollSeconds}s`}
          />
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-forest-50/50 px-3.5 py-3">
      <dt className="text-wood-500 text-xs">{label}</dt>
      <dd className="mt-1.5 font-mono font-semibold text-sm text-wood-900">
        {value}
      </dd>
    </div>
  );
}

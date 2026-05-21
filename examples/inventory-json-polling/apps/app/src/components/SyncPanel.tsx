import { useState } from "react";
import { useSyncClient } from "../hooks/useBaresyncQuery";
import { useSyncState } from "../hooks/useSyncState";

export function SyncPanel() {
  const client = useSyncClient();
  const { localState, pollingStatus, loading } = useSyncState();
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      await client.syncNow();
    } finally {
      setSyncing(false);
    }
  }

  let pollingText = "—";
  if (pollingStatus) {
    if (!pollingStatus.running) {
      pollingText = "Stopped";
    } else if (pollingStatus.paused) {
      pollingText = "Paused";
    } else {
      const last = pollingStatus.last_sync_at
        ? new Date(pollingStatus.last_sync_at).toLocaleTimeString()
        : "never";
      pollingText = `Active (last: ${last})`;
    }
  }

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

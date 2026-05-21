interface SyncBadgeProps {
  synced: boolean;
}

export function SyncBadge({ synced }: SyncBadgeProps) {
  if (synced) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-forest-50 px-2.5 py-0.5 font-medium text-forest-700 text-xs">
        <span className="h-1.5 w-1.5 rounded-full bg-forest-500" />
        Synced
      </span>
    );
  }

  return (
    <span className="inline-flex animate-pulse-sync items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 font-medium text-amber-500 text-xs">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Unsynced
    </span>
  );
}

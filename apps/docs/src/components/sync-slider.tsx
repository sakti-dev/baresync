"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { SyncVisualization } from "./sync-visualization";

const AUTOPLAY_MS = 5000;

const STEPS = [
  {
    id: "schemas",
    title: "Define paired schemas",
    description:
      "Two Drizzle tables describe the same data from each side of the sync boundary. localSyncColumns() for a boolean dirty flag. apiSyncColumns() for cursor timestamps.",
    code: `import { localSyncColumns } from "baresync/schema";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  title: text("title").notNull(),
  completed: integer("completed").notNull().default(0),
  ...localSyncColumns(),
});`,
    lang: "typescript",
  },
  {
    id: "contract",
    title: "Generate the sync contract",
    description:
      "Run the CLI to produce a machine-readable contract, table ordering, and manifest. The contract is a frozen, date-stamped snapshot compiled into the Rust binary.",
    code: `$ bunx baresync doctor   # validate schemas
$ bunx baresync generate # write contract artifacts

# Generated:
#   sync-contract.json
#   sync-table-order.ts
#   sync-contract.manifest.json`,
    lang: "shell",
  },
  {
    id: "plugin",
    title: "Register the plugin",
    description:
      "The Tauri plugin owns SQLite, migrations, and the sync engine. It runs on a polling interval and emits events when data changes.",
    code: `BaresyncBuilder::new()
    .api_base_url("https://api.yourapp.com")
    .db_path("app.db")
    .contract_json(include_str!("../generated/sync-contract.json"))
    .migrations_path("migrations")
    .poll_interval_secs(30)
    .build()`,
    lang: "rust",
  },
  {
    id: "server",
    title: "Add three server routes",
    description:
      "Baresync decodes requests, validates limits, orders table writes, and handles idempotency. You write auth, scope resolution, and persistence.",
    code: `import { Hono } from "hono";
import {
  createSyncPushHandler,
  createSyncPullHandler,
  createSyncStatusHandler,
} from "baresync/server";
import { repository } from "./db/sync-repository";

const resolveScope = ({ scopeId }) => {
  if (!isAuthorized(scopeId)) {
    return { ok: false, status: 403, body: { error: "unauthorized" } };
  }
  return { ok: true, scope: { scopeId } };
};

const push = createSyncPushHandler({
  resolveScope,
  upsertOrder: repository.tableNames,
  applyPushChanges: async ({ changes, scope, syncUpdatedAt }) =>
    repository.applyPushChanges({ changes, scopeId: scope.scopeId, syncUpdatedAt }),
});

const pull = createSyncPullHandler({
  limit: 1000,
  resolveScope,
  loadPullChanges: async ({ cursor, scope, tables }) =>
    repository.loadPullChanges({ cursor, scopeId: scope.scopeId, tables }),
});

const status = createSyncStatusHandler({
  resolveScope,
  loadSyncStatus: async ({ cursor, scope }) =>
    repository.loadSyncStatus({ cursor, scopeId: scope.scopeId }),
});

const sync = new Hono();
sync.post("/push", (c) => push(c.req.raw, {}));
sync.post("/pull", (c) => pull(c.req.raw, {}));
sync.post("/status", (c) => status(c.req.raw, {}));

export default sync;`,
    lang: "typescript",
  },
] as const;

function CodeHighlight({ code, lang }: { code: string; lang: string }) {
  const lines = code.split("\n");

  return (
    <div className="font-mono text-sm leading-relaxed">
      {lines.map((line, i) => (
        <motion.div
          className="whitespace-nowrap"
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: i * 0.04, ease: "easeOut" }}
          key={i}
        >
          <CodeLine line={line} lang={lang} />
        </motion.div>
      ))}
    </div>
  );
}

function CodeLine({ line, lang }: { line: string; lang: string }) {
  if (line === "") {
    return <div>&nbsp;</div>;
  }

  if (lang === "shell") {
    if (line.startsWith("$")) {
      return (
        <div>
          <span className="text-fd-muted-foreground">{line.slice(0, 2)}</span>
          <span className="text-fd-foreground">{line.slice(2)}</span>
        </div>
      );
    }
    if (line.startsWith("#")) {
      return <div className="text-fd-muted-foreground">{line}</div>;
    }
    return <div className="text-fd-foreground">{line}</div>;
  }

  if (lang === "rust") {
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;
    return (
      <div style={{ paddingLeft: `${indent}ch` }}>
        {trimmed
          .split(
            /(\b(?:BaresyncBuilder|new|api_base_url|db_path|contract_json|include_str|migrations_path|poll_interval_secs|build)\b)/,
          )
          .map((part, j) => {
            if (
              /^(BaresyncBuilder|new|api_base_url|db_path|contract_json|include_str|migrations_path|poll_interval_secs|build)$/.test(
                part,
              )
            ) {
              return (
                <span className="text-fd-primary" key={j}>
                  {part}
                </span>
              );
            }
            if (/^"(.*)"$/.test(part)) {
              return (
                <span className="text-emerald-400" key={j}>
                  {part}
                </span>
              );
            }
            if (/^\d+$/.test(part)) {
              return (
                <span className="text-amber-400" key={j}>
                  {part}
                </span>
              );
            }
            return (
              <span className="text-fd-foreground" key={j}>
                {part}
              </span>
            );
          })}
      </div>
    );
  }

  // typescript
  const trimmed = line.trimStart();
  const indent = line.length - trimmed.length;

  if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) {
    return (
      <div style={{ paddingLeft: `${indent}ch` }}>
        <span className="text-blue-400">{trimmed.split(" ")[0]}</span>
        <span className="text-fd-foreground">
          {" "}
          {trimmed.slice(trimmed.indexOf(" ") + 1)}
        </span>
      </div>
    );
  }
  if (trimmed.startsWith("export ")) {
    return (
      <div style={{ paddingLeft: `${indent}ch` }}>
        <span className="text-blue-400">export</span>
        <span className="text-fd-foreground"> {trimmed.slice(7)}</span>
      </div>
    );
  }
  if (trimmed.startsWith("//")) {
    return (
      <div
        className="text-fd-muted-foreground"
        style={{ paddingLeft: `${indent}ch` }}
      >
        {trimmed}
      </div>
    );
  }
  if (trimmed.startsWith("const ") || trimmed.startsWith("async ")) {
    return (
      <div style={{ paddingLeft: `${indent}ch` }}>
        <span className="text-blue-400">{trimmed.split(" ")[0]}</span>
        <span className="text-fd-foreground">
          {" "}
          {trimmed.slice(trimmed.indexOf(" ") + 1)}
        </span>
      </div>
    );
  }
  if (trimmed.startsWith("return ")) {
    return (
      <div style={{ paddingLeft: `${indent}ch` }}>
        <span className="text-purple-400">return</span>
        <span className="text-fd-foreground"> {trimmed.slice(7)}</span>
      </div>
    );
  }

  return (
    <div className="text-fd-foreground" style={{ paddingLeft: `${indent}ch` }}>
      {trimmed}
    </div>
  );
}

export function SyncSlider() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const sectionRef = useRef<HTMLElement>(null);

  // Intersection Observer to detect if component is in viewport
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0.1 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Pause timer when not in viewport
  useEffect(() => {
    if (!isInView) {
      setIsPaused(true);
    } else {
      setIsPaused(false);
    }
  }, [isInView]);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const startTimer = useCallback(
    (index: number) => {
      clearTimers();
      startTimeRef.current = Date.now();
      setProgress(0);

      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        const pct = Math.min((elapsed / AUTOPLAY_MS) * 100, 100);
        setProgress(pct);
      }, 30);

      timerRef.current = setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % STEPS.length);
      }, AUTOPLAY_MS);
    },
    [clearTimers],
  );

  useEffect(() => {
    if (!isPaused) {
      startTimer(activeIndex);
    }
    return clearTimers;
  }, [activeIndex, isPaused, startTimer, clearTimers]);

  const handleTabClick = (index: number) => {
    setActiveIndex(index);
  };

  return (
    <section ref={sectionRef}>
      <div className="border-fd-border border-b">
        <div className="mx-auto max-w-4xl px-6 py-14 text-center">
          <h2
            className="mb-4 text-balance font-semibold text-2xl text-fd-foreground sm:text-3xl"
            style={{ textWrap: "balance" }}
          >
            How sync works
          </h2>
          <p className="mb-0 text-fd-muted-foreground leading-relaxed">
            Every write goes through the outbox. The sync engine pushes pending
            changes to your server and pulls back server state. Server-wins
            reconciliation means your server is always the source of truth.
          </p>
        </div>
      </div>

      <SyncVisualization />

      <div className="grid grid-cols-1 border-fd-border border-b md:grid-cols-5 md:divide-x md:divide-fd-border">
        {/* Left: Tabs */}
        <div className="flex flex-col md:col-span-2">
          {STEPS.map((step, index) => {
            const isActive = index === activeIndex;
            const isLast = index === STEPS.length - 1;
            return (
              <button
                className={`group relative select-text border-fd-border border-b px-6 py-4 text-left transition-colors duration-200 ${
                  isActive ? "bg-fd-muted flex-1" : "hover:bg-fd-muted/50"
                } ${isLast ? "border-b-0" : ""}`}
                key={step.id}
                onClick={() => handleTabClick(index)}
                type="button"
              >
                {/* Progress bar */}
                {isActive && (
                  <div className="absolute bottom-0 left-0 h-[2px] w-full overflow-hidden">
                    <div className="h-full bg-fd-border" />
                    <motion.div
                      className="absolute bottom-0 left-0 h-full bg-fd-primary origin-left"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}

                <h3
                  className={`font-semibold transition-colors duration-200 ${
                    isActive
                      ? "text-fd-foreground"
                      : "text-fd-muted-foreground group-hover:text-fd-foreground"
                  }`}
                >
                  {step.title}
                </h3>

                <div
                  className="grid"
                  style={{
                    gridTemplateRows: isActive ? "1fr" : "0fr",
                    opacity: isActive ? 1 : 0,
                    transition: isActive
                      ? "grid-template-rows 300ms cubic-bezier(0.25, 1, 0.5, 1), opacity 250ms cubic-bezier(0.25, 1, 0.5, 1)"
                      : "opacity 150ms cubic-bezier(0.25, 1, 0.5, 1), grid-template-rows 300ms cubic-bezier(0.25, 1, 0.5, 1) 50ms",
                  }}
                >
                  <div className="min-h-0 overflow-hidden">
                    <p className="mt-2 text-fd-muted-foreground text-sm leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: Content */}
        <div
          className="flex flex-col md:col-span-3"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="h-[420px] overflow-auto p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
              >
                <CodeHighlight
                  code={STEPS[activeIndex].code}
                  lang={STEPS[activeIndex].lang}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

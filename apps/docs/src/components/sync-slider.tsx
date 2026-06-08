"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SyncVisualization } from "./sync-visualization";

const AUTOPLAY_MS = 5000;

const RUST_KEYWORDS_REGEX =
  /(\b(?:BaresyncBuilder|new|api_base_url|db_path|contract_json|include_str|migrations_path|poll_interval_secs|build)\b)/;
const RUST_KEYWORD_TEST_REGEX =
  /^(BaresyncBuilder|new|api_base_url|db_path|contract_json|include_str|migrations_path|poll_interval_secs|build)$/;
const STRING_LITERAL_REGEX = /^"(.*)"$/;
const NUMBER_REGEX = /^\d+$/;

const STEPS = [
  {
    id: "schemas",
    title: "Define paired schemas",
    description:
      "Two Drizzle schema files describe the same table from each side of the sync boundary. localSyncColumns() for the client. apiSyncColumns() for the server.",
    code: `// src/local-synced-schema.ts
import { localSyncColumns } from "baresync/schema";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const todos = sqliteTable("todos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  completed: integer("completed").notNull().default(0),
  ...localSyncColumns(),
});

// src/api-synced-schema.ts
import { apiSyncColumns } from "baresync/schema";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const todos = sqliteTable(
  "todos",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    completed: integer("completed").notNull().default(0),
    ...apiSyncColumns(),
  },
  (table) => [index("todos_sync_idx").on(table.syncUpdatedAt)]
);`,
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
import { createSyncServer } from "baresync/server";
import { repository } from "./db/sync-repository";

const resolveScope = ({ scopeId }) => {
  if (!isAuthorized(scopeId)) {
    return { ok: false, status: 403, body: { error: "unauthorized" } };
  }
  return { ok: true, scope: { scopeId } };
};

const syncServer = createSyncServer({
  db,
  resolveScope,
  push: {
    upsertOrder: repository.tableNames,
    applyPushChanges: async ({ changes, scope, syncUpdatedAt }) =>
      repository.applyPushChanges({ changes, scopeId: scope.scopeId, syncUpdatedAt }),
  },
  pull: {
    limit: 1000,
    loadPullChanges: async ({ cursor, scope, tables }) =>
      repository.loadPullChanges({ cursor, scopeId: scope.scopeId, tables }),
  },
  status: {
    loadSyncStatus: async ({ cursor, scope }) =>
      repository.loadSyncStatus({ cursor, scopeId: scope.scopeId }),
  },
});

const sync = new Hono();
sync.post("/push", (c) => syncServer.push(c.req.raw, {}));
sync.post("/pull", (c) => syncServer.pull(c.req.raw, {}));
sync.post("/status", (c) => syncServer.status(c.req.raw, {}));

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
          animate={{ opacity: 1, x: 0 }}
          className="whitespace-nowrap"
          initial={{ opacity: 0, x: -4 }}
          key={line}
          transition={{ duration: 0.3, delay: i * 0.04, ease: "easeOut" }}
        >
          <CodeLine lang={lang} line={line} />
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
        {trimmed.split(RUST_KEYWORDS_REGEX).map((part, _j) => {
          if (RUST_KEYWORD_TEST_REGEX.test(part)) {
            return (
              <span className="text-fd-primary" key={part}>
                {part}
              </span>
            );
          }
          if (STRING_LITERAL_REGEX.test(part)) {
            return (
              <span className="text-emerald-400" key={part}>
                {part}
              </span>
            );
          }
          if (NUMBER_REGEX.test(part)) {
            return (
              <span className="text-amber-400" key={part}>
                {part}
              </span>
            );
          }
          return (
            <span className="text-fd-foreground" key={part}>
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
  const sectionRef = useRef<HTMLDivElement>(null);

  // Intersection Observer to detect if component is in viewport
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0.6 }
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Pause timer when not in viewport
  useEffect(() => {
    if (isInView) {
      setIsPaused(false);
    } else {
      setIsPaused(true);
    }
  }, [isInView]);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  }, []);

  const startTimer = useCallback(
    (_index: number) => {
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
    [clearTimers]
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
    <section>
      <div className="border-fd-border border-b">
        <div className="mx-auto max-w-4xl px-6 py-14 text-center">
          <h2
            className="mb-4 text-balance font-semibold text-2xl text-fd-foreground sm:text-3xl"
            style={{ textWrap: "balance" }}
          >
            How sync works
          </h2>
          <p className="mb-0 text-fd-muted-foreground leading-relaxed">
            Baresync is local-first: reads and writes stay in SQLite in the app,
            while Baresync manages sync on both the app side and the server side
            without adding another server.
          </p>
        </div>
      </div>

      <SyncVisualization />

      <div
        className="grid grid-cols-1 border-fd-border border-b md:grid-cols-5 md:divide-x md:divide-fd-border"
        ref={sectionRef}
      >
        {/* Left: Tabs */}
        <div className="flex flex-col md:col-span-2">
          {STEPS.map((step, index) => {
            const isActive = index === activeIndex;
            const isLast = index === STEPS.length - 1;
            return (
              <button
                className={`group/tab relative select-text border-fd-border border-b py-4 pr-6 text-left transition-colors duration-200 ${
                  isActive ? "flex-1" : "hover:bg-fd-muted/50"
                } ${isLast ? "border-b-0" : ""}`}
                key={step.id}
                onClick={() => handleTabClick(index)}
                type="button"
              >
                {isActive && (
                  <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-fd-muted/60 to-transparent" />
                )}

                {/* Progress bar */}
                {isActive && (
                  <div className="absolute bottom-0 left-0 z-20 h-[2px] w-full overflow-hidden">
                    <div className="h-full bg-fd-border" />
                    <motion.div
                      className="absolute bottom-0 left-0 h-full origin-left bg-fd-primary"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}

                <h3
                  className={`relative z-10 pl-7 font-semibold transition-colors duration-200 ${
                    isActive
                      ? "text-fd-foreground"
                      : "text-fd-muted-foreground group-hover/tab:text-fd-foreground"
                  }`}
                >
                  {/* Left floating indicator */}
                  <div
                    className={`absolute inset-y-0 left-0 w-1 origin-center rounded-tr-full rounded-br-full transition-all duration-200 ${
                      isActive
                        ? "h-8 bg-fd-primary"
                        : "h-6 bg-fd-border group-hover/tab:h-8 group-hover/tab:bg-fd-primary"
                    }`}
                  />
                  {step.title}
                </h3>

                <AnimatePresence initial={false}>
                  {isActive && (
                    <motion.div
                      animate={{ height: "auto", opacity: 1 }}
                      className="relative z-10 overflow-hidden pl-7"
                      exit={{ height: 0, opacity: 0 }}
                      initial={{ height: 0, opacity: 0 }}
                      key="description"
                      transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                    >
                      <p className="mt-2 text-fd-muted-foreground text-sm leading-relaxed">
                        {step.description}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </div>

        {/* Right: Content */}
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: hover to pause autoplay is intentional */}
        <section
          className="flex flex-col md:col-span-3"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          role="region"
          tabIndex={-1}
        >
          <div className="h-[420px] overflow-auto p-6">
            <AnimatePresence mode="wait">
              <motion.div
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                key={activeIndex}
                transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
              >
                <CodeHighlight
                  code={STEPS[activeIndex].code}
                  lang={STEPS[activeIndex].lang}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </div>
    </section>
  );
}

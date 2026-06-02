import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { useState } from "react";
import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="mx-auto w-full max-w-screen-xl border-fd-border border-x">
          <HeroSection />
          <FeatureGrid />
          <HowSyncWorks />
          <WhatYouControl />
          <QuickStart />
          <Footer />
        </div>
      </main>
    </HomeLayout>
  );
}

const PM_TABS = ["bun", "npm", "pnpm", "yarn"] as const;
type Pm = (typeof PM_TABS)[number];
const PM_COMMANDS: Record<Pm, string> = {
  bun: "bunx create-baresync my-app",
  npm: "npx create-baresync my-app",
  pnpm: "pnpm create-baresync my-app",
  yarn: "yarn create baresync my-app",
};

function HeroSection() {
  const [pm, setPm] = useState<Pm>("bun");

  return (
    <section className="border-fd-border border-b px-6 py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-4xl text-center">
        <h1
          className="mb-6 text-balance font-bold text-4xl text-fd-foreground tracking-tight sm:text-5xl lg:text-6xl"
          style={{ letterSpacing: "-0.02em" }}
        >
          SQLite sync for Tauri apps.{" "}
          <span className="text-fd-muted-foreground">You own the backend.</span>
        </h1>
        <p className="mx-auto mb-10 max-w-xl text-base text-fd-muted-foreground leading-relaxed">
          Define Drizzle schemas. Generate a sync contract. Register the plugin.
          Add three server routes. Your local database stays in sync — Baresync
          handles the rest.
        </p>

        <div className="mx-auto max-w-md">
          <div className="overflow-hidden rounded-xl border border-fd-border bg-fd-background">
            <div className="flex border-fd-border border-b">
              {PM_TABS.map((t) => (
                <button
                  className={`px-4 py-2 font-mono text-xs transition-colors ${
                    pm === t
                      ? "border-fd-primary border-b-2 text-fd-foreground"
                      : "text-fd-muted-foreground hover:text-fd-foreground"
                  }`}
                  key={t}
                  onClick={() => setPm(t)}
                  type="button"
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <code className="font-mono text-fd-foreground text-sm">
                {PM_COMMANDS[pm]}
              </code>
              <CopyButton text={PM_COMMANDS[pm]} />
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            className="inline-flex items-center rounded-lg bg-fd-primary px-5 py-2.5 font-semibold text-fd-primary-foreground text-sm transition-colors hover:bg-fd-primary/90"
            params={{ _splat: "getting-started/quick-start" }}
            to="/docs/$"
          >
            Get started
          </Link>
          <a
            className="inline-flex items-center rounded-lg border border-fd-border px-5 py-2.5 font-medium text-fd-foreground text-sm transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
            href="https://github.com/eekrain/baresync"
            rel="noopener noreferrer"
            target="_blank"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="rounded-md p-1.5 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      title="Copy to clipboard"
      type="button"
    >
      {copied ? (
        <svg
          aria-hidden="true"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            d="M5 13l4 4L19 7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <rect height="13" rx="2" ry="2" width="13" x="9" y="9" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  );
}

function FeatureGrid() {
  const features = [
    {
      tag: "Reliability",
      tagColor: "emerald",
      title: "Outbox pattern",
      description:
        "Every write queues a sync change atomically. No lost writes, no dual-writes, no eventual consistency surprises.",
    },
    {
      tag: "Consistency",
      tagColor: "amber",
      title: "Server-wins reconciliation",
      description:
        "Your server is always the source of truth. Conflicts resolve predictably. The client converges to server state.",
    },
    {
      tag: "Performance",
      tagColor: "sky",
      title: "Incremental pull",
      description:
        "Cursor-based sync. Only fetch rows that changed since the last pull. No full-table scans on reconnect.",
    },
    {
      tag: "Reliability",
      tagColor: "emerald",
      title: "Idempotent by default",
      description:
        "Retries don't create duplicates. Safe to push the same batch again. Network interruptions are non-events.",
    },
    {
      tag: "Performance",
      tagColor: "sky",
      title: "Automatic chunking",
      description:
        "Large payloads split into server-safe batches. You write normally. Baresync handles the boundaries.",
    },
    {
      tag: "Architecture",
      tagColor: "violet",
      title: "App-owned backend",
      description:
        "No hosted service. No vendor lock-in. Your server, your auth, your persistence. Baresync is infrastructure, not a platform.",
    },
  ];

  return (
    <section>
      <div className="border-fd-border border-y">
        <div className="mx-auto max-w-4xl px-6 py-6 text-center">
          <h2 className="mb-4 text-balance font-semibold text-2xl text-fd-foreground sm:text-3xl">
            What Baresync gives you
          </h2>
          <p className="mb-0 text-fd-muted-foreground leading-relaxed">
            Six things you get out of the box. No configuration, no boilerplate,
            no third-party services.
          </p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-fd-border">
        {features.map((f) => (
          <div className="border-fd-border border-b p-6" key={f.title}>
            <span
              className="mb-3 inline-block rounded-md px-2 py-0.5 font-mono text-xs"
              style={{
                backgroundColor: TAG_COLORS[f.tagColor].bg,
                color: TAG_COLORS[f.tagColor].text,
              }}
            >
              {f.tag}
            </span>
            <h3 className="mb-2 font-semibold text-fd-foreground text-sm">
              {f.title}
            </h3>
            <p className="text-fd-muted-foreground text-sm leading-relaxed">
              {f.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  emerald: { bg: "rgba(16,185,129,0.15)", text: "rgb(52,211,153)" },
  amber: { bg: "rgba(245,158,11,0.15)", text: "rgb(251,191,36)" },
  sky: { bg: "rgba(14,165,233,0.15)", text: "rgb(56,189,248)" },
  violet: { bg: "rgba(139,92,246,0.15)", text: "rgb(167,139,250)" },
};

function HowSyncWorks() {
  return (
    <section>
      <div className="border-fd-border border-y">
        <div className="mx-auto max-w-4xl px-6 py-6 text-center">
          <h2 className="mb-4 text-balance font-semibold text-2xl text-fd-foreground sm:text-3xl">
            How sync works
          </h2>
          <p className="mb-0 text-fd-muted-foreground leading-relaxed">
            Every write goes through the outbox. The sync engine pushes pending
            changes to your server and pulls back server state. Server-wins
            reconciliation means your server is always the source of truth.
          </p>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="mx-auto max-w-4xl space-y-8">
          <SyncStep
            code={`import { localSyncColumns } from "baresync/schema";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  title: text("title").notNull(),
  completed: integer("completed").notNull().default(0),
  ...localSyncColumns(),
});`}
            description="Two Drizzle tables describe the same data from each side of the sync boundary. Local uses localSyncColumns() for a boolean dirty flag. API uses apiSyncColumns() for cursor timestamps."
            number={1}
            title="Define paired schemas"
          />

          <SyncStep
            code={`$ bunx baresync doctor   # validate schemas
$ bunx baresync generate # write contract artifacts

# Generated:
#   sync-contract.json
#   sync-table-order.ts
#   sync-contract.manifest.json`}
            description="Run the CLI to produce a machine-readable contract, table ordering, and manifest. The contract is a frozen, date-stamped snapshot compiled into the Rust binary."
            isShell
            number={2}
            title="Generate the sync contract"
          />

          <SyncStep
            code={`BaresyncBuilder::new()
    .api_base_url("https://api.yourapp.com")
    .db_path("app.db")
    .contract_json(include_str!("../generated/sync-contract.json"))
    .migrations_path("migrations")
    .poll_interval_secs(30)
    .build()`}
            description="The Tauri plugin owns SQLite, migrations, and the sync engine. It runs on a polling interval and emits events when data changes."
            number={3}
            title="Register the plugin"
          />

          <SyncStep
            code={`import { createSyncPushHandler } from "baresync/server";

const push = createSyncPushHandler({
  encoding: "json",
  upsertOrder: SYNC_UPSERT_ORDER,
  resolveScope: async ({ scopeId, session }) => {
    return verifyAccess(session, scopeId);
  },
  applyPushChanges: async ({ changes, scope }) => {
    return applyToDatabase(changes, scope);
  },
});`}
            description="Baresync decodes requests, validates limits, orders table writes, and handles idempotency. You write auth, scope resolution, and persistence."
            number={4}
            title="Add three server routes"
          />
        </div>
      </div>
    </section>
  );
}

function SyncStep({
  number,
  title,
  description,
  code,
  isShell,
}: {
  number: number;
  title: string;
  description: string;
  code: string;
  isShell?: boolean;
}) {
  return (
    <div className="group relative">
      <div className="flex gap-5">
        <div className="flex flex-col items-center">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-fd-primary/30 bg-fd-primary/10 font-mono text-fd-primary text-xs">
            {number}
          </div>
          {number < 4 && <div className="mt-2 w-px flex-1 bg-fd-primary/15" />}
        </div>
        <div className="flex-1 pb-2">
          <h3 className="mb-1.5 font-semibold text-fd-foreground text-lg">
            {title}
          </h3>
          <p className="mb-4 text-fd-muted-foreground text-sm leading-relaxed">
            {description}
          </p>
          <pre className="overflow-x-auto rounded-lg border border-fd-border bg-fd-background p-4 text-sm leading-relaxed">
            <code
              className={`font-mono ${isShell ? "text-fd-muted-foreground" : "text-fd-foreground"}`}
            >
              {code}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}

function WhatYouControl() {
  return (
    <section>
      <div className="border-fd-border border-y">
        <div className="mx-auto max-w-4xl px-6 py-6 text-center">
          <h2 className="mb-4 text-balance font-semibold text-2xl text-fd-foreground sm:text-3xl">
            What you control
          </h2>
          <p className="mb-0 text-fd-muted-foreground leading-relaxed">
            Baresync is infrastructure, not a service. There is no hosted
            backend, no vendor lock-in, no runtime schema negotiation. Your
            server decides who can access which scope and how rows are
            persisted.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-fd-border">
        <div className="border-fd-border border-b p-6">
          <span
            className="mb-3 inline-block rounded-md px-2 py-0.5 font-mono text-xs"
            style={{
              backgroundColor: "rgba(16,185,129,0.15)",
              color: "rgb(52,211,153)",
            }}
          >
            Your code
          </span>
          <ul className="space-y-3 text-fd-muted-foreground text-sm">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fd-primary" />
              <span>
                Auth and session validation in{" "}
                <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-fd-foreground text-xs">
                  resolveScope
                </code>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fd-primary" />
              <span>Which rows to persist and how to apply them</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fd-primary" />
              <span>Your Drizzle schemas, server database, and migrations</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fd-primary" />
              <span>
                React UI with the sync client provider and Drizzle queries
              </span>
            </li>
          </ul>
        </div>
        <div className="border-fd-border border-b p-6">
          <span
            className="mb-3 inline-block rounded-md px-2 py-0.5 font-mono text-xs"
            style={{
              backgroundColor: "rgba(100,116,139,0.15)",
              color: "rgb(148,163,184)",
            }}
          >
            Baresync
          </span>
          <ul className="space-y-3 text-fd-muted-foreground text-sm">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fd-border" />
              <span>
                Outbox tracking: every write queues a sync change atomically
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fd-border" />
              <span>Push chunking, idempotency keys, and retry logic</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fd-border" />
              <span>Incremental pull with cursor management</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fd-border" />
              <span>
                Table ordering, soft-delete cleanup, and server-wins
                reconciliation
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function QuickStart() {
  return (
    <section className="border-fd-border border-b px-6 py-12 lg:py-16">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="mb-4 font-semibold text-2xl text-fd-foreground sm:text-3xl">
          Get started in seven commands
        </h2>
        <p className="mb-8 text-balance text-fd-muted-foreground">
          The scaffold creates a monorepo with a Tauri app, a Hono server, and a
          shared sync contract package.
        </p>
        <pre className="mx-auto max-w-md overflow-x-auto rounded-lg border border-fd-border bg-fd-background p-5 text-left text-sm">
          <code className="font-mono text-fd-foreground">
            <span className="text-fd-muted-foreground">$</span> bunx
            create-baresync my-app{"\n"}
            <span className="text-fd-muted-foreground">$</span> cd my-app{"\n"}
            <span className="text-fd-muted-foreground">$</span> bun install
            {"\n"}
            <span className="text-fd-muted-foreground">$</span> bun run
            generate:sync{"\n"}
            <span className="text-fd-muted-foreground">$</span> bun run
            migrate:local{"\n"}
            <span className="text-fd-muted-foreground">$</span> bun run
            migrate:server{"\n"}
            <span className="text-fd-muted-foreground">$</span> bun run dev
          </code>
        </pre>
        <div className="mt-8">
          <Link
            className="inline-flex items-center font-medium text-fd-primary text-sm transition-colors hover:text-fd-primary/80"
            params={{ _splat: "getting-started/quick-start" }}
            to="/docs/$"
          >
            Read the full getting started guide
            <svg
              aria-hidden="true"
              className="ms-1.5 size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                d="M13 7l5 5-5 5M6 12h12"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="px-6 py-12">
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-fd-muted-foreground text-sm">
          Baresync is open source.{" "}
          <a
            className="text-fd-primary underline underline-offset-2 transition-colors hover:text-fd-primary/80"
            href="https://github.com/eekrain/baresync"
            rel="noopener noreferrer"
            target="_blank"
          >
            Star it on GitHub
          </a>
          .
        </p>
      </div>
    </footer>
  );
}

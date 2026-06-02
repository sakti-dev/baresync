import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import {
  Database,
  GitMerge,
  Layers,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";
import { useRef } from "react";
import { AuroraBackground } from "@/components/aurora-background";
import { PmCommandBlock } from "@/components/mdx/pm-command-block";
import { SyncSlider } from "@/components/sync-slider";
import {
  BackgroundRippleEffect,
  useRipple,
} from "@/components/ui/background-ripple-effect";
import { WaveBackground } from "@/components/wave-background";
import { baseOptions } from "@/lib/layout.shared";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="mx-auto w-full max-w-7xl border-fd-border border-x">
          <HeroSection />
          <SyncSlider />
          <FeatureGrid />
          <SkillsSection />
          <WhatYouControl />
          <QuickStart />
          <Footer />
        </div>
      </main>
    </HomeLayout>
  );
}

const CELL_SIZE = 56;
const COLS = 30;
const ROWS = 10;

function HeroSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { clickedCell, hoveredCell, rippleKey, setHoveredCell, triggerRipple } =
    useRipple();

  const getCellFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const section = sectionRef.current;
    if (!section) {
      return null;
    }
    const rect = section.getBoundingClientRect();
    const gridWidth = COLS * CELL_SIZE;
    const offsetX = (rect.width - gridWidth) / 2;
    const x = e.clientX - rect.left - offsetX;
    const y = e.clientY - rect.top;
    const col = Math.floor(x / CELL_SIZE);
    const row = Math.floor(y / CELL_SIZE);
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
      return null;
    }
    return { row, col };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const cell = getCellFromEvent(e);
    setHoveredCell(cell);
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const cell = getCellFromEvent(e);
    if (cell) {
      triggerRipple(cell.row, cell.col);
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: decorative ripple container
    <div
      className="relative overflow-hidden border-fd-border border-b"
      onClick={handleClick}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      ref={sectionRef}
      role="presentation"
    >
      <BackgroundRippleEffect
        cellSize={CELL_SIZE}
        clickedCell={clickedCell}
        cols={COLS}
        hoveredCell={hoveredCell}
        key={rippleKey}
        rows={ROWS}
      />
      <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
        <div className="mx-auto max-w-4xl text-center">
          <h1
            className="mb-6 text-balance font-bold text-4xl text-fd-foreground tracking-tight sm:text-5xl lg:text-6xl"
            style={{ letterSpacing: "-0.02em" }}
          >
            SQLite sync for Tauri apps.{" "}
            <span className="text-fd-muted-foreground">
              You own the backend.
            </span>
          </h1>
          <p className="mx-auto mb-10 max-w-xl text-base text-fd-muted-foreground leading-relaxed">
            Define Drizzle schemas. Generate a sync contract. Register the
            plugin. Add three server routes. Your local database stays in sync,
            and Baresync handles the rest.
          </p>

          <div className="mx-auto max-w-md">
            <PmCommandBlock className="rounded-none" />
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
              className="inline-flex items-center rounded-lg bg-fd-muted px-5 py-2.5 font-medium text-fd-foreground text-sm transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
              href="https://github.com/sakti-dev/baresync"
              rel="noopener noreferrer"
              target="_blank"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureGrid() {
  const features = [
    {
      title: "Outbox pattern",
      description:
        "Every write queues a sync change atomically. No lost writes, no dual-writes, no eventual consistency surprises.",
      icon: <Database />,
    },
    {
      title: "Server-wins reconciliation",
      description:
        "Your server is always the source of truth. Conflicts resolve predictably. The client converges to server state.",
      icon: <GitMerge />,
    },
    {
      title: "Incremental pull",
      description:
        "Cursor-based sync. Only fetch rows that changed since the last pull. No full-table scans on reconnect.",
      icon: <RefreshCw />,
    },
    {
      title: "Idempotent by default",
      description:
        "Retries don't create duplicates. Safe to push the same batch again. Network interruptions are non-events.",
      icon: <Zap />,
    },
    {
      title: "Automatic chunking",
      description:
        "Large payloads split into server-safe batches. You write normally. Baresync handles the boundaries.",
      icon: <Layers />,
    },
    {
      title: "App-owned backend",
      description:
        "No hosted service. No vendor lock-in. Your server, your auth, your persistence. Baresync is infrastructure, not a platform.",
      icon: <Server />,
    },
  ];

  return (
    <section>
      <div className="border-fd-border border-b">
        <div className="mx-auto max-w-4xl px-6 py-14 text-center">
          <h2 className="mb-4 text-balance font-semibold text-2xl text-fd-foreground sm:text-3xl">
            What Baresync gives you
          </h2>
          <p className="mb-0 text-fd-muted-foreground leading-relaxed">
            What you get out of the box. No configuration, no boilerplate, no
            third-party services.
          </p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, index) => (
          <Feature index={index} key={feature.title} {...feature} />
        ))}
      </div>
    </section>
  );
}

const Feature = ({
  title,
  description,
  icon,
  index,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  index: number;
}) => {
  const cols = 3;
  const isTopRow = index < cols;

  return (
    <div
      className={cn(
        "group/feature relative flex flex-col border-fd-border border-b py-10",
        "lg:border-r"
      )}
    >
      {isTopRow ? (
        <div className="pointer-events-none absolute inset-0 h-full w-full bg-linear-to-t from-fd-muted/50 to-transparent opacity-0 transition-opacity duration-200 group-hover/feature:opacity-100" />
      ) : (
        <div className="pointer-events-none absolute inset-0 h-full w-full bg-linear-to-b from-fd-muted/50 to-transparent opacity-0 transition-opacity duration-200 group-hover/feature:opacity-100" />
      )}
      <div className="relative z-10 mb-4 px-10 text-fd-muted-foreground">
        {icon}
      </div>
      <div className="relative z-10 mb-2 px-10 font-bold text-lg">
        <div className="absolute inset-y-0 left-0 h-6 w-1 origin-center rounded-tr-full rounded-br-full bg-fd-border transition-all duration-200 group-hover/feature:h-8 group-hover/feature:bg-fd-primary" />
        <span className="inline-block text-fd-foreground transition duration-200 group-hover/feature:translate-x-2">
          {title}
        </span>
      </div>
      <p className="relative z-10 max-w-xs px-10 text-fd-muted-foreground text-sm">
        {description}
      </p>
    </div>
  );
};

function SkillsSection() {
  return (
    <AuroraBackground className="h-auto border-fd-border border-b">
      <section className="relative z-10 px-6 py-14">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 text-balance font-semibold text-2xl text-fd-foreground sm:text-3xl">
            AI assistants that know Baresync
          </h2>
          <p className="mb-8 text-balance text-fd-muted-foreground leading-relaxed">
            Your AI assistant generates Baresync code from the actual source,
            not stale training data. One command installs skills for your
            editor.
          </p>
          <div className="mx-auto max-w-md">
            <PmCommandBlock className="rounded-none" kind="npx" />
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-fd-muted-foreground text-sm">
            {[
              "Claude Code",
              "Cursor",
              "Copilot",
              "Gemini",
              "Windsurf",
              "Kilo",
              "Amp",
            ].map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </div>
      </section>
    </AuroraBackground>
  );
}

function WhatYouControl() {
  const yourCodeItems = [
    "Auth and session validation in resolveScope",
    "Which rows to persist and how to apply them",
    "Your Drizzle schemas, server database, and migrations",
    "Integrate UI with the sync client and Drizzle queries",
  ];

  const baresyncItems = [
    "Outbox tracking: every write queues a sync change atomically",
    "Push chunking, idempotency keys, and retry logic",
    "Incremental pull with cursor management",
    "Table ordering, soft-delete cleanup, and server-wins reconciliation",
  ];

  return (
    <section>
      <div className="border-fd-border border-b">
        <div className="mx-auto max-w-4xl px-6 py-14 text-center">
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

      <div className="grid sm:grid-cols-2">
        <div className="group/feature relative border-fd-border border-b py-10 lg:border-r">
          <div className="pointer-events-none absolute inset-0 h-full w-full bg-linear-to-t from-fd-muted/50 to-transparent opacity-0 transition-opacity duration-200 group-hover/feature:opacity-100" />
          <div className="relative z-10 mb-4 px-10 font-bold text-lg">
            <div className="absolute inset-y-0 left-0 h-6 w-1 origin-center rounded-tr-full rounded-br-full bg-fd-border transition-all duration-200 group-hover/feature:h-8 group-hover/feature:bg-fd-primary" />
            <span className="inline-block text-fd-primary transition duration-200 group-hover/feature:translate-x-2">
              Your code
            </span>
          </div>
          <ul className="relative z-10 space-y-3 px-10 text-fd-muted-foreground text-sm">
            {yourCodeItems.map((item) => (
              <li className="flex items-start gap-2" key={item}>
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fd-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="group/feature relative border-fd-border border-b py-10">
          <div className="pointer-events-none absolute inset-0 h-full w-full bg-linear-to-b from-fd-muted/50 to-transparent opacity-0 transition-opacity duration-200 group-hover/feature:opacity-100" />
          <div className="relative z-10 mb-4 px-10 font-bold text-lg">
            <div className="absolute inset-y-0 left-0 h-6 w-1 origin-center rounded-tr-full rounded-br-full bg-fd-border transition-all duration-200 group-hover/feature:h-8 group-hover/feature:bg-fd-primary" />
            <span className="inline-block text-fd-foreground transition duration-200 group-hover/feature:translate-x-2">
              Baresync
            </span>
          </div>
          <ul className="relative z-10 space-y-3 px-10 text-fd-muted-foreground text-sm">
            {baresyncItems.map((item) => (
              <li className="flex items-start gap-2" key={item}>
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fd-border" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function QuickStart() {
  return (
    <WaveBackground className="border-fd-border border-b">
      <section className="relative z-10 px-6 py-14">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 flex items-center justify-center gap-2 font-semibold text-2xl text-fd-foreground sm:text-3xl">
            Start building with{" "}
            <img
              alt="Baresync"
              className="inline h-7 sm:h-8"
              height={28}
              src="/baresync-logo-full-web.svg"
              width={120}
            />
          </h2>
          <p className="mb-2 text-balance text-fd-muted-foreground">
            The scaffold creates a monorepo with a Tauri app, a Hono server, and
            a shared sync contract package.
          </p>
          <p className="mb-8 text-balance text-fd-muted-foreground">
            It also includes a framework-agnostic sync client — wire it into
            your frontend to start syncing.
          </p>
          <div className="not-prose mx-auto max-w-md">
            <pre className="overflow-x-auto rounded-none border border-fd-border bg-fd-card/60 p-5 text-left text-sm">
              <code className="font-mono text-fd-foreground">
                <span className="text-fd-muted-foreground">$</span> bun create
                baresync@latest{"\n"}
                <span className="text-fd-muted-foreground">$</span> cd my-app
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
          </div>
          <div className="mt-8">
            <Link
              className="inline-flex items-center rounded-md bg-fd-primary px-6 py-2.5 font-medium text-fd-primary-foreground text-sm transition-colors hover:bg-fd-primary/90"
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
    </WaveBackground>
  );
}

function Footer() {
  return (
    <footer className="border-fd-border border-t p-6">
      <div className="mx-auto max-w-4xl text-center">
        <p className="mb-6 text-fd-muted-foreground text-sm">
          Baresync is open source.{" "}
          <a
            className="text-fd-primary underline underline-offset-2 transition-colors hover:text-fd-primary/80"
            href="https://github.com/sakti-dev/baresync"
            rel="noopener noreferrer"
            target="_blank"
          >
            Star it on GitHub
          </a>
          .
        </p>
        <nav className="flex items-center justify-center gap-6 text-fd-muted-foreground text-sm">
          <a
            className="transition-colors hover:text-fd-foreground"
            href="/docs/getting-started/quick-start"
          >
            Docs
          </a>
          <a
            className="transition-colors hover:text-fd-foreground"
            href="https://github.com/sakti-dev/baresync"
            rel="noopener noreferrer"
            target="_blank"
          >
            GitHub
          </a>
          <a
            className="transition-colors hover:text-fd-foreground"
            href="https://github.com/sakti-dev/baresync/tree/main/examples"
          >
            Examples
          </a>
        </nav>
      </div>
    </footer>
  );
}

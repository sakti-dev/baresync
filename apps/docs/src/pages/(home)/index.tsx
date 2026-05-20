import { Link } from "waku";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-5xl flex-1 flex-col justify-center px-6 py-20">
      <p className="mb-4 font-mono text-sm uppercase tracking-[0.18em] text-fd-muted-foreground">
        SQLite-first sync for Tauri
      </p>
      <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
        Baresync keeps local-first apps honest about sync.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-fd-muted-foreground">
        Define a typed sync contract from Drizzle tables, generate the runtime
        pieces, and connect a Tauri app to app-owned push and pull routes.
      </p>
      <Link
        to="/docs"
        className="mt-8 w-fit rounded-md bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground text-sm"
      >
        Read the docs
      </Link>
    </div>
  );
}

export async function getConfig() {
  return {
    render: "static",
  };
}

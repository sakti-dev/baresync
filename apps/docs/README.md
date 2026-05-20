# Baresync Docs

This is the public documentation site for Baresync, built with Waku and Fumadocs.

## Development

```bash
bun run dev
```

## Checks

```bash
bun run types:check
bun run build
```

From the repository root, also run:

```bash
bun x ultracite check
bun run typecheck
```

## Content

Docs live in `content/docs`. Mermaid diagrams are supported through `remarkMdxMermaid` and the local `Mermaid` MDX component in `src/components/mdx/mermaid.tsx`.

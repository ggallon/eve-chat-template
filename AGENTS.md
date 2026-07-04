<!-- BEGIN:nextjs-agent-rules -->
 
# Next.js: ALWAYS read docs before coding
 
Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.
 
<!-- END:nextjs-agent-rules -->

# eve Agent App

This project uses the eve framework. Before writing code, always read the relevant guide in `node_modules/eve/dist/docs/public/`.

Use `eve` lowercase in user-facing copy, docs, prompts, and comments. Do not
title-case it unless it is part of an exact external title or quoted text.

## Quick Reference

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start nextjs + eve dev server |
| `pnpm build` | Production build |
| `pnpm typecheck` | TypeScript check |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply migrations |

## Structure

```
eve-chat-template/
├── agent/          # eve agent (channels, connections, skills, tools )
├── app/            # Nextjs UI (pages, components, composables)
└── docs/           # Architecture, environment, customization
```

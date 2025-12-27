# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Start dev server (0.0.0.0:3000)
npm run build        # Build for production (runs prisma generate first)
npm run start        # Start production server (0.0.0.0:3004)
npm run lint         # Run ESLint
```

Database commands:
```bash
npx prisma generate  # Generate Prisma client (auto-runs on build/postinstall)
npx prisma db push   # Push schema changes to database
npx prisma studio    # Open Prisma Studio GUI
```

## Architecture Overview

NanoBanana is a Next.js 16 app providing an infinite canvas for AI-powered content generation (images, music, video, PPT, TTS, etc.). Uses React Flow for the canvas interface.

### Core Layers

**Frontend Canvas** (`src/components/`)
- `InfiniteCanvas.tsx` - Main React Flow canvas container
- `nodes/*.tsx` - Node types for different content (ImageNode, MusicNode, VideoGenNode, etc.)
- Generator nodes (`*GenNode.tsx`) handle input/config, result nodes display output
- `CanvasContext.tsx` - Shared state for node management, selection, slideshow mode

**API Routes** (`src/app/api/`)
- Task-based async pattern: create task → poll status → get result
- `/api/generate-*` - Start generation tasks
- `/api/*-task` - Poll task status (GET by taskId)
- `/api/image-models` - Dynamic model list from adapters

**Agent Systems** (`src/lib/`)
- `super-agent/` - ReAct loop agent with tool calling (web search, image gen, deep research)
- `chat-agent/` - Similar agent for chat interface with SSE streaming
- `scrollytelling-agent/` - Generates immersive scrolling webpages

### Image Generation Adapter System

Located in `src/lib/image-generation/`:
- `base-adapter.ts` - Abstract adapter class
- `adapters/` - Implementations (GeminiAdapter, SeedreamAdapter)
- `index.ts` - `generateImage()` entry point, routes to adapters by model ID

To add a new adapter:
1. Create adapter in `adapters/` extending `ImageGenerationAdapter`
2. Register in `index.ts` adapters array
3. Add model to `src/types/image-gen.ts` IMAGE_MODELS
4. Add rate limits in `src/lib/rate-limiter.ts`

### Rate Limiting

`src/lib/rate-limiter.ts` implements RPM-based queuing per model type with configurable concurrency limits. Use `enqueue(model, fn)` to wrap API calls.

### Database

MySQL via Prisma. Schema in `prisma/schema.prisma`. Key models:
- `User` - Auth, balance, permissions
- `*Task` - Async task status (ImageTask, MusicTask, VideoTask, etc.)
- `Canvas` - Saved canvas state (JSON)
- `ApiKey` - External API key rotation (Gemini, Seedream)

### File Storage

R2/S3 for generated assets. Upload utilities in `src/lib/image-utils.ts`.

## Key Patterns

**Task Polling**: Frontend polls `/api/*-task?taskId=X` until status is `completed` or `failed`.

**Node Communication**: Nodes connect via React Flow edges. Use `getConnectedImageNodes()` from CanvasContext to find connected images for multi-image operations.

**Model Permissions**: Users have base models by default. Premium models require `UserModelPermission` records. Check with `getAvailableModelsForUser()`.

**Streaming**: Chat agents use SSE via `createSSEStream()` from `src/lib/chat-agent/sse-handler.ts`.

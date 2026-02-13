# AGENTS.md

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

**Examples:**
- `feat(webhook): add message status tracking`
- `fix(mcp): handle media download timeout`
- `docs: update API documentation`
- `chore(deps): upgrade prisma to 6.x`

---

## Project Overview

**Pons** is an open-source WhatsApp Business Cloud API bridge that exposes messaging capabilities via MCP (Model Context Protocol), allowing AI agents like Claude to read and send WhatsApp messages.

### What it does

1. **Receives webhooks** from WhatsApp Cloud API (messages, status updates)
2. **Stores messages** in PostgreSQL (Neon)
3. **Downloads media** to Cloudflare R2 (since Meta URLs expire in 5 minutes)
4. **Exposes MCP server** for AI agents to interact with conversations
5. **Provides web dashboard** for manual message management

---

## Architecture

```
                                    ┌─────────────────┐
                                    │   Claude/AI     │
                                    │   (MCP Client)  │
                                    └────────┬────────┘
                                             │ MCP (HTTP)
                                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            Next.js App (Vercel)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐       │
│  │  /api/webhook  │     │  /api/mcp      │     │  Dashboard     │       │
│  │  (Meta calls)  │     │  (MCP HTTP)    │     │  + Auth        │       │
│  └───────┬────────┘     └───────┬────────┘     └────────────────┘       │
│          │                      │                                        │
│          ▼                      ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │                    Vercel Workflows                          │        │
│  │                                                              │        │
│  │  processIncomingMessage    sendOutboundMessage              │        │
│  │  ├─ parseWebhook           ├─ callMetaAPI                   │        │
│  │  ├─ downloadMedia          ├─ storeMessage                  │        │
│  │  ├─ uploadToR2             └─ updateStatus                  │        │
│  │  └─ storeMessage                                            │        │
│  └──────────────────────────────┬──────────────────────────────┘        │
│                                 │                                        │
│          ┌──────────────────────┴──────────────────────┐                │
│          ▼                                              ▼                │
│  ┌───────────────┐                             ┌───────────────┐        │
│  │ Neon Postgres │                             │ Cloudflare R2 │        │
│  │ (via Prisma)  │                             │ (Media files) │        │
│  └───────────────┘                             └───────────────┘        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                             │
                                             │ HTTPS
                                             ▼
                                    ┌─────────────────┐
                                    │  Meta Cloud API │
                                    │  (graph.fb.com) │
                                    └─────────────────┘
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL via Neon |
| ORM | Prisma |
| Auth | Better Auth |
| API | tRPC |
| Workflows | Vercel Workflows (`workflow` package) |
| MCP | `@modelcontextprotocol/sdk` |
| Media Storage | Cloudflare R2 |
| Hosting | Vercel |

---

## Data Model

### Core Entities

```
Account (WhatsApp Business Account)
    │
    ├── Contact (Customer phone numbers)
    │       │
    │       └── Conversation (Thread with a contact)
    │               │
    │               └── Message (Individual messages)
    │                       │
    │                       └── Media (Images, videos, docs in R2)
    │
    ├── Template (Pre-approved message templates)
    │
    └── WebhookLog (Raw payloads for debugging)
```

### Key Design Decisions

1. **Multi-tenant**: Multiple WhatsApp Business Accounts per deployment
2. **Media stored in R2**: Meta URLs expire in 5 minutes, we download immediately
3. **Raw webhook logs**: Stored for debugging and replay
4. **24-hour window tracking**: `Conversation.windowExpiresAt` for template-only periods

---

## MCP Tools

The MCP server exposes these tools to AI agents:

### Reading
- `list_conversations` - List all conversations with pagination
- `get_conversation` - Get messages for a specific contact
- `search_messages` - Full-text search across messages

### Sending
- `send_text` - Send a text message
- `send_image` - Send an image with optional caption
- `send_template` - Send a pre-approved template message

### Metadata
- `get_templates` - List available message templates
- `get_media_url` - Get R2 URL for a media attachment

---

## Webhook Flow

```
Meta sends webhook
        │
        ▼
┌───────────────────┐
│ POST /api/webhook │
│ • Verify signature│
│ • Return 200 fast │
│ • Start workflow  │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ processIncoming   │  (Vercel Workflow)
│ Workflow          │
└────────┬──────────┘
         │
         ├──► parseWebhookPayload (step)
         │
         ├──► downloadMedia (step, if media)
         │         │
         │         └──► GET graph.facebook.com/{media_id}
         │         └──► Download binary (within 5 min!)
         │         └──► Upload to R2
         │
         ├──► storeMessage (step)
         │         │
         │         └──► Upsert Contact
         │         └──► Upsert Conversation
         │         └──► Create Message
         │
         └──► updateConversationWindow (step)
```

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://...

# Better Auth
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=https://your-domain.com

# WhatsApp Cloud API (per-account, stored in DB)
# These are stored encrypted in the Account table

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=pons-media
R2_PUBLIC_URL=https://media.your-domain.com

# Vercel Workflows (auto-configured on Vercel)
WORKFLOW_SECRET=
```

---

## Directory Structure

```
src/
├── app/
│   ├── api/
│   │   ├── webhook/          # WhatsApp webhook endpoint
│   │   ├── mcp/              # MCP HTTP transport
│   │   ├── auth/             # Better Auth routes
│   │   └── trpc/             # tRPC API
│   ├── dashboard/            # Web UI for manual messaging
│   └── (marketing)/          # Landing page
├── server/
│   ├── api/                  # tRPC routers
│   ├── better-auth/          # Auth configuration
│   ├── db.ts                 # Prisma client
│   ├── whatsapp/             # WhatsApp API client
│   │   ├── client.ts         # Send messages
│   │   ├── webhook.ts        # Parse webhooks
│   │   └── media.ts          # Download/upload media
│   └── mcp/                  # MCP server implementation
│       ├── server.ts         # MCP server setup
│       └── tools/            # Individual tool handlers
├── workflows/                # Vercel Workflows
│   ├── process-incoming.ts   # Handle incoming messages
│   └── send-outbound.ts      # Handle outgoing messages
├── lib/
│   ├── r2.ts                 # Cloudflare R2 client
│   └── crypto.ts             # Encryption for tokens
└── prisma/
    └── schema.prisma         # Database schema
```

---

## Development

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Fill in your values

# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:push

# Start dev server
pnpm dev
```

### Testing Webhooks Locally

```bash
# Use ngrok to expose local server
ngrok http 3000

# Configure Meta webhook URL to:
# https://your-ngrok-url.ngrok.io/api/webhook
```

---

## Deployment

1. Push to GitHub
2. Connect to Vercel
3. Add environment variables
4. Deploy

Vercel will automatically:
- Build the Next.js app
- Configure Workflows
- Set up the serverless functions

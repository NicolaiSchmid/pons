<div align="center">

<br />

```
 ┌─────────────────────────────────────────┐
 │                                         │
 │   ██████╗  ██████╗ ███╗   ██╗███████╗   │
 │   ██╔══██╗██╔═══██╗████╗  ██║██╔════╝   │
 │   ██████╔╝██║   ██║██╔██╗ ██║███████╗   │
 │   ██╔═══╝ ██║   ██║██║╚██╗██║╚════██║   │
 │   ██║     ╚██████╔╝██║ ╚████║███████║   │
 │   ╚═╝      ╚═════╝ ╚═╝  ╚═══╝╚══════╝   │
 │                                         │
 └─────────────────────────────────────────┘
```

**WhatsApp in your terminal. Messages in your AI.**

Bridge the WhatsApp Business Cloud API to any MCP-compatible client.<br />
Send and receive messages from Claude, Cursor, or your own tools.

[pons.chat](https://pons.chat) · [Report Bug](https://github.com/NicolaiSchmid/pons/issues) · [Request Feature](https://github.com/NicolaiSchmid/pons/issues)

<br />

</div>

---

## The Problem

WhatsApp Business has a powerful API, but it's locked behind REST calls, webhook plumbing, and token management. There's no way to plug it into the tools you actually use — AI assistants, dev environments, automation pipelines.

**Pons** (_Latin for "bridge"_) connects WhatsApp to the [Model Context Protocol](https://modelcontextprotocol.io/), so your AI assistant can read, search, and send WhatsApp messages as naturally as it reads files or searches the web.

## What It Does

- **Full WhatsApp inbox** — real-time web UI with conversations, media, delivery receipts
- **MCP server** — expose WhatsApp as tools for Claude Desktop, Cursor, or any MCP client
- **Multi-tenant** — multiple WhatsApp Business Accounts, multiple users per account
- **Media handling** — images, videos, documents auto-downloaded to Convex storage (Meta URLs expire in 5 min)
- **24h window tracking** — know when you can send free-form vs. template-only messages
- **API key management** — scoped keys for different clients with expiration

## Tech Stack

| Layer | Choice |
|:------|:-------|
| Framework | **Next.js 16** (App Router, Turbopack) |
| Backend | **Convex** (database, auth, file storage, scheduled actions) |
| Auth | **Convex Auth** (Google OAuth) |
| MCP | `@modelcontextprotocol/sdk` — Streamable HTTP transport |
| UI | **shadcn/ui** + Tailwind CSS v4 |
| Domain | **[pons.chat](https://pons.chat)** |
| Hosting | **Vercel** (FRA1) + **Convex Cloud** (eu-west-1) |

## Quick Start

### Prerequisites

- Node.js 18+, pnpm
- A [Meta Business App](https://developers.facebook.com) with WhatsApp Cloud API access

### 1. Install & configure

```bash
git clone https://github.com/NicolaiSchmid/pons.git
cd pons
pnpm install

# Start Convex dev (opens browser for auth on first run)
npx convex dev

# In another terminal
pnpm run dev:next
```

### 2. Connect WhatsApp

1. Create a Meta Business App → add WhatsApp product → get test phone number
2. Sign in to Pons at `http://localhost:3000`
3. Create an Account with your WABA ID, Phone Number ID, Access Token, and App Secret
4. Set webhook URL in Meta to `https://your-domain.com/api/webhook`
5. Use the generated Webhook Verify Token to verify

### 3. Connect your AI

Go to **API Keys** in the dashboard, create a key, and add to your MCP config:

```json
{
  "mcpServers": {
    "pons": {
      "url": "https://your-pons-domain.com/api/mcp",
      "headers": {
        "Authorization": "Bearer pons_your_api_key_here"
      }
    }
  }
}
```

## MCP Tools

| Tool | Scope | Description |
|:-----|:------|:------------|
| `list_conversations` | read | List recent conversations with preview |
| `get_conversation` | read | Get full conversation with messages |
| `search_messages` | read | Search messages by content |
| `send_text` | send | Send a text message |
| `send_template` | send | Send a template message (for closed windows) |
| `list_templates` | read | List available message templates |
| `mark_as_read` | write | Mark conversation as read |
| `send_reaction` | write | React to a message with emoji |

**Scopes**: `read` (view), `write` (mark read, react), `send` (send messages). Assign per key.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│              │     │              │     │              │
│  Claude /    │────▶│  Pons MCP    │────▶│   Convex     │
│  Cursor      │ MCP │  Endpoint    │     │   Backend    │
│              │     │  (Next.js)   │     │              │
└──────────────┘     └──────┬───────┘     └──────┬───────┘
                            │                    │
                     ┌──────┴───────┐     ┌──────┴───────┐
                     │              │     │              │
                     │  Pons Web    │     │  Meta Graph  │
                     │  Dashboard   │     │  API v22.0   │
                     │              │     │              │
                     └──────────────┘     └──────────────┘
```

### Data Model

```
Account (WhatsApp Business Account)
├── AccountMember (owner / admin / member)
├── Contact (customer phone numbers)
│   └── Conversation (thread with a contact)
│       └── Message (text, media, location, reaction...)
├── Template (pre-approved message templates)
├── ApiKey (scoped MCP authentication)
└── WebhookLog (raw payloads for debugging)
```

## Project Structure

```
pons/
├── convex/                 # Backend
│   ├── schema.ts           # Database schema
│   ├── auth.ts             # Convex Auth (Google OAuth)
│   ├── accounts.ts         # Account + member management
│   ├── conversations.ts    # Conversation queries
│   ├── messages.ts         # Message CRUD
│   ├── mcp.ts              # MCP queries + API key management
│   ├── mcpNode.ts          # Crypto operations (Node.js runtime)
│   ├── webhook.ts          # Webhook ingestion + media download
│   └── whatsapp.ts         # Meta Graph API actions
├── src/
│   ├── app/
│   │   ├── api/mcp/        # MCP HTTP endpoint
│   │   ├── api/webhook/    # WhatsApp webhook handler
│   │   └── page.tsx        # Landing + auth gate
│   ├── components/
│   │   ├── Dashboard.tsx           # Main shell
│   │   ├── ConversationList.tsx    # Sidebar
│   │   ├── MessageThread.tsx       # Chat view
│   │   ├── AccountSettings.tsx     # Settings + member management
│   │   ├── ApiKeyManager.tsx       # API key CRUD
│   │   ├── AccountSelector.tsx     # Account switcher
│   │   └── SetupAccount.tsx        # Onboarding
│   └── components/ui/      # shadcn/ui primitives
├── middleware.ts            # Auth middleware (webhook excluded)
└── vercel.json             # Vercel config (FRA1 region)
```

## Development

```bash
pnpm dev              # Convex + Next.js in parallel
pnpm run check:write  # Biome lint + format (auto-fix)
pnpm run typecheck    # TypeScript check
pnpm run build        # Production build
```

## Deployment

1. Connect GitHub repo to **Vercel**
2. Set environment variables: `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOY_KEY`
3. Build command is pre-configured: `pnpm convex deploy --cmd 'pnpm run build'`
4. Disable Vercel Deployment Protection for production (webhook needs unauthenticated access)

## License

MIT

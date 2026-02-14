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
- `chore(deps): upgrade convex`

---

## Project Overview

**Pons** is an open-source WhatsApp Business Cloud API bridge that exposes messaging capabilities via MCP (Model Context Protocol), allowing AI agents like Claude to read and send WhatsApp messages.

### What it does

1. **Receives webhooks** from WhatsApp Cloud API (messages, status updates)
2. **Stores messages** in Convex database (real-time sync)
3. **Downloads media** to Convex file storage (since Meta URLs expire in 5 minutes)
4. **Exposes MCP server** for AI agents to interact with conversations
5. **Provides web dashboard** for manual message management (real-time updates)

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
│                         Next.js App (Vercel)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐       │
│  │  /api/webhook  │     │  /api/mcp      │     │  Dashboard     │       │
│  │  (Meta calls)  │     │  (MCP HTTP)    │     │  (real-time)   │       │
│  └───────┬────────┘     └───────┬────────┘     └───────┬────────┘       │
│          │                      │                      │                 │
└──────────┼──────────────────────┼──────────────────────┼─────────────────┘
           │                      │                      │
           ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              Convex                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Mutations  │  │   Queries   │  │   Actions   │  │ Convex Auth │    │
│  │             │  │             │  │  (external) │  │             │    │
│  │ storeMsg    │  │ listConvos  │  │             │  │ email/pass  │    │
│  │ updateStatus│  │ getMessages │  │ downloadMed │  │ sessions    │    │
│  │ upsertContact│ │ searchMsgs  │  │ callMetaAPI │  │             │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      Convex Database                             │    │
│  │  accounts | contacts | conversations | messages | templates      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Convex File Storage                           │    │
│  │              (images, videos, audio, documents)                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
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
| Backend | Convex (database, auth, file storage, actions) |
| Auth | Convex Auth (email/password) |
| MCP | `@modelcontextprotocol/sdk` |
| Hosting | Vercel (Next.js) + Convex Cloud |

### Why Convex?

- **Real-time by default** - Conversations update instantly across all clients
- **Integrated auth** - No separate auth service needed
- **File storage** - Built-in media storage with automatic URLs
- **Actions** - Background jobs for webhook processing, calling Meta API
- **Type-safe** - End-to-end TypeScript from DB to frontend

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
    │                       └── Media (in Convex file storage)
    │
    ├── Template (Pre-approved message templates)
    │
    └── WebhookLog (Raw payloads for debugging)
```

### Convex Schema

```typescript
// convex/schema.ts
accounts: defineTable({
  name: v.string(),
  wabaId: v.string(),              // WhatsApp Business Account ID
  phoneNumberId: v.string(),        // Meta's phone number ID
  phoneNumber: v.string(),          // Display: +1 555 123 4567
  accessToken: v.string(),          // Encrypted
  webhookVerifyToken: v.string(),
  appSecret: v.string(),            // Encrypted
  ownerId: v.id("users"),
})

contacts: defineTable({
  accountId: v.id("accounts"),
  waId: v.string(),                 // WhatsApp ID (phone)
  phone: v.string(),                // E.164 format
  name: v.optional(v.string()),     // Profile name
})

conversations: defineTable({
  accountId: v.id("accounts"),
  contactId: v.id("contacts"),
  lastMessageAt: v.optional(v.number()),
  lastMessagePreview: v.optional(v.string()),
  unreadCount: v.number(),
  windowExpiresAt: v.optional(v.number()),  // 24h window
})

messages: defineTable({
  accountId: v.id("accounts"),
  conversationId: v.id("conversations"),
  waMessageId: v.string(),          // Meta's message ID
  direction: v.union(v.literal("inbound"), v.literal("outbound")),
  type: v.union(...),               // text, image, video, etc.
  
  // Content (varies by type)
  text: v.optional(v.string()),
  caption: v.optional(v.string()),
  mediaId: v.optional(v.id("_storage")),  // Convex file storage
  
  // Status tracking
  status: v.union(...),             // pending, sent, delivered, read, failed
  timestamp: v.number(),
})

templates: defineTable({
  accountId: v.id("accounts"),
  name: v.string(),
  language: v.string(),
  category: v.union(...),           // marketing, utility, authentication
  status: v.union(...),             // approved, pending, rejected
  components: v.any(),
})

webhookLogs: defineTable({
  accountId: v.optional(v.id("accounts")),
  payload: v.any(),
  processed: v.boolean(),
  error: v.optional(v.string()),
})
```

### Key Design Decisions

1. **Multi-tenant**: Multiple WhatsApp Business Accounts per deployment
2. **Media in Convex storage**: Meta URLs expire in 5 minutes, downloaded immediately via action
3. **Raw webhook logs**: Stored for debugging and replay
4. **24-hour window tracking**: `Conversation.windowExpiresAt` for template-only periods
5. **Real-time subscriptions**: Dashboard updates instantly when messages arrive

---

## Convex Functions

### Queries (real-time)
```typescript
// convex/conversations.ts
export const list = query({...})           // List conversations for account
export const get = query({...})            // Get single conversation with messages
export const search = query({...})         // Search messages

// convex/messages.ts  
export const list = query({...})           // List messages in conversation
export const get = query({...})            // Get single message
```

### Mutations
```typescript
// convex/messages.ts
export const store = mutation({...})       // Store incoming message
export const updateStatus = mutation({...}) // Update message status
export const markRead = mutation({...})    // Mark conversation as read

// convex/contacts.ts
export const upsert = mutation({...})      // Create/update contact
```

### Actions (external API calls)
```typescript
// convex/whatsapp.ts
export const sendText = action({...})      // Send text via Meta API
export const sendTemplate = action({...})  // Send template via Meta API
export const sendMedia = action({...})     // Send media via Meta API
export const downloadMedia = action({...}) // Download from Meta, upload to Convex storage
```

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
- `get_media_url` - Get URL for a media attachment

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
│ • Call Convex     │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ Convex Action:    │
│ processWebhook    │
└────────┬──────────┘
         │
         ├──► Parse webhook payload
         │
         ├──► If media message:
         │    │
         │    └──► downloadMedia action
         │         • GET graph.facebook.com/{media_id}
         │         • Download binary (within 5 min!)
         │         • Upload to Convex storage
         │
         ├──► mutations.contacts.upsert
         │
         ├──► mutations.conversations.upsert
         │
         └──► mutations.messages.store
                    │
                    └──► Real-time update to all subscribed clients!
```

---

## Environment Variables

```env
# Convex
CONVEX_DEPLOYMENT=your-deployment-name
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# WhatsApp (per-account credentials stored in Convex DB)
# Only needed for initial setup or single-tenant mode:
# WHATSAPP_ACCESS_TOKEN=
# WHATSAPP_PHONE_NUMBER_ID=
# WHATSAPP_VERIFY_TOKEN=
# WHATSAPP_APP_SECRET=
```

---

## Directory Structure

```
src/
├── app/
│   ├── api/
│   │   ├── webhook/           # WhatsApp webhook endpoint
│   │   └── mcp/               # MCP HTTP transport
│   ├── dashboard/             # Web UI (real-time with Convex)
│   ├── auth/                  # Auth pages (Convex Auth)
│   └── (marketing)/           # Landing page
├── components/                # React components
├── lib/
│   ├── mcp/                   # MCP server implementation
│   │   ├── server.ts
│   │   └── tools/
│   └── whatsapp/              # WhatsApp helpers
│       ├── signature.ts       # Webhook signature verification
│       └── types.ts           # Meta API types
convex/
├── schema.ts                  # Database schema
├── auth.ts                    # Convex Auth config
├── accounts.ts                # Account queries/mutations
├── contacts.ts                # Contact queries/mutations
├── conversations.ts           # Conversation queries/mutations
├── messages.ts                # Message queries/mutations
├── templates.ts               # Template queries/mutations
├── webhookLogs.ts             # Webhook log mutations
└── whatsapp.ts                # Actions for Meta API calls
```

---

## Development

```bash
# Install dependencies
pnpm install

# Set up Convex
npx convex dev

# In another terminal, start Next.js
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

1. **Convex**: Automatically deployed when you push (via `convex dev` or CI)
2. **Next.js**: Push to GitHub, Vercel auto-deploys
3. **Environment**: Add `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` to Vercel

```bash
# Deploy Convex to production
npx convex deploy

# Vercel will pick up the Next.js app automatically
```

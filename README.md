# Pons

WhatsApp Business Cloud API bridge with MCP (Model Context Protocol) support. Send and receive WhatsApp messages from Claude, Cursor, or any MCP-compatible client.

## Features

- **Multi-tenant**: Support multiple WhatsApp Business Accounts per deployment
- **Real-time**: Live message updates via Convex subscriptions
- **MCP Integration**: Expose WhatsApp messaging as tools for AI assistants
- **Media Handling**: Automatic download of images, videos, documents to Convex storage (Meta URLs expire in 5 minutes)
- **24-hour Window Tracking**: Know when you can send free-form messages vs templates only

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Backend | Convex (database, auth, file storage, actions) |
| Auth | Convex Auth (email/password) |
| MCP | `@modelcontextprotocol/sdk` with Streamable HTTP transport |
| Hosting | Vercel + Convex Cloud |

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- A Meta Business App with WhatsApp Cloud API access

### Setup

```bash
# Clone and install
git clone https://github.com/NicolaiSchmid/pons.git
cd pons
pnpm install

# Start Convex (opens browser for auth on first run)
npx convex dev

# Generate auth secret
openssl rand -base64 32
# Add this to both .env.local AND Convex dashboard (Settings > Environment Variables)

# Create .env.local
cat > .env.local << EOF
NEXT_PUBLIC_CONVEX_URL="https://your-project.convex.cloud"
CONVEX_AUTH_SECRET="<your-generated-secret>"
EOF

# Run dev server
pnpm dev
```

### WhatsApp Setup

1. Create a Meta Business App at [developers.facebook.com](https://developers.facebook.com)
2. Add WhatsApp product and get a test phone number
3. Sign up/login to Pons at `http://localhost:3000`
4. Create an Account with:
   - **WABA ID**: WhatsApp Business Account ID
   - **Phone Number ID**: Meta's phone number ID
   - **Access Token**: Permanent access token (create via System Users)
   - **Webhook Verify Token**: Random string (click "Generate")
   - **App Secret**: From Meta App Settings > Basic
5. Set webhook URL in Meta to `https://your-domain.com/api/webhook`

## MCP Integration

Pons exposes WhatsApp messaging via MCP, allowing AI assistants to send/receive messages.

### Available Tools

| Tool | Description |
|------|-------------|
| `list_conversations` | List recent conversations with preview |
| `get_conversation` | Get conversation details with messages |
| `search_messages` | Search messages by content |
| `send_text` | Send a text message |
| `send_template` | Send a template message (for closed windows) |
| `list_templates` | List available message templates |
| `mark_as_read` | Mark conversation as read |
| `send_reaction` | React to a message with emoji |

### Setup in Claude Desktop / Cursor

1. Go to **API Keys** in the Pons dashboard
2. Create a new API key with desired scopes
3. Add to your MCP config:

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

### API Key Scopes

| Scope | Permissions |
|-------|-------------|
| `read` | View conversations and messages |
| `write` | Mark as read, react to messages |
| `send` | Send text messages and templates |

## Project Structure

```
pons/
├── convex/
│   ├── schema.ts          # Database schema
│   ├── auth.ts            # Convex Auth config
│   ├── accounts.ts        # WhatsApp account management
│   ├── conversations.ts   # Conversation queries
│   ├── messages.ts        # Message storage
│   ├── mcp.ts             # MCP queries/mutations
│   ├── mcpNode.ts         # API key crypto (Node.js)
│   ├── webhook.ts         # Webhook processing
│   └── whatsapp.ts        # Meta API actions
├── src/
│   ├── app/
│   │   ├── api/mcp/       # MCP HTTP endpoint
│   │   ├── api/webhook/   # WhatsApp webhook
│   │   └── page.tsx       # Dashboard
│   ├── components/
│   │   ├── Dashboard.tsx
│   │   ├── ConversationList.tsx
│   │   ├── MessageThread.tsx
│   │   ├── ApiKeyManager.tsx
│   │   └── SetupAccount.tsx
│   └── lib/
│       └── mcp-server.ts  # MCP server definition
└── biome.json             # Linting config
```

## Data Model

```
Account (WhatsApp Business Account)
├── Contact (Customer phone numbers)
│   └── Conversation (Thread with a contact)
│       └── Message (with media in Convex storage)
├── Template (Pre-approved message templates)
├── ApiKey (MCP authentication)
└── WebhookLog (Raw payloads for debugging)
```

## Development

```bash
# Run all checks
pnpm run check

# Auto-fix lint/format issues
pnpm run check:write

# Type check
pnpm run typecheck

# Build
pnpm run build
```

## Deployment

### Vercel

1. Connect your GitHub repo to Vercel
2. Add environment variables:
   - `NEXT_PUBLIC_CONVEX_URL`
   - `CONVEX_AUTH_SECRET`
3. Deploy

### Convex

Convex deploys automatically when you run `npx convex deploy` or via CI.

## License

MIT

# 🐝 Token Hive

> A token registry and launcher for the Starknet ecosystem — powered by the [StarkZap SDK](https://docs.starknet.io/build/starkzap).

Token Hive lets anyone register, discover, and verify ERC-20 tokens on Starknet Mainnet and Sepolia Testnet. It also lets connected wallet users deploy new ERC-20 contracts directly from the browser in a few clicks.

---

## ✨ Features

- **Token Registry** — Browse, search and filter all registered Starknet tokens
- **One-click Deploy** — Deploy a new ERC-20 to mainnet or testnet via your connected Argent X or Braavos wallet
- **Verification System** — Token owners can request official verification with email notification via Resend
- **API** — Public REST API at `/api/v1/*` for wallets and apps to consume token metadata
- **StarkZap Integration** — Server-side token resolution, amount formatting, and treasury balance powered by the StarkZap SDK

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Database | Supabase (Postgres + Storage) |
| Email | Resend |
| Blockchain | Starknet (Mainnet + Sepolia) |
| Wallet SDK | **StarkZap v2** |
| Auth | JWT + bcrypt (admin) |
| Deploy target | Render |

---

## 🔗 StarkZap SDK Integration

This project uses [StarkZap](https://github.com/keep-starknet-strange/starkzap) — Starknet's official TypeScript SDK — in two layers:

### Server-side (`starkzap-integration.js`)

Imported by `api/server.js` to handle:

| Feature | StarkZap API used |
|---|---|
| On-chain token metadata resolution | `sdk.getTokenMetadata(fromAddress(addr))` |
| Treasury STRK balance check | `wallet.balanceOf(mainnetTokens.STRK)` |
| Safe amount formatting | `Amount.fromRaw(raw, { decimals }).toFormatted()` |
| Safe amount parsing | `Amount.parse(human, { decimals }).raw` |
| Verification fee calculation | `Amount.parse(fee, { decimals }).toFormatted(4)` |

```js
import { StarkZap, StarkSigner, Amount, fromAddress, mainnetTokens } from 'starkzap';

// Resolve token metadata from chain
const sdk = new StarkZap({ network: 'mainnet' });
const meta = await sdk.getTokenMetadata(fromAddress(contractAddress));
// → { name: 'My Token', symbol: 'MTK', decimals: 18 }

// Check treasury balance
const signer = new StarkSigner(process.env.TREASURY_PRIVATE_KEY);
const wallet = await sdk.connectWallet({ account: { signer } });
const balance = await wallet.balanceOf(mainnetTokens.STRK);
console.log(balance.toFormatted()); // "42.50 STRK"

// Format an amount safely (no float drift)
const amount = Amount.fromRaw(1500000000000000000n, { decimals: 18 });
console.log(amount.toFormatted()); // "1.500000"
```

### Browser-side (`starkzap-browser.js`)

Loaded as an ES module in `index.html`. Exposes `window.StarkZapHelpers` for use in `app.js`:

| Helper | StarkZap API used |
|---|---|
| `formatAmount(raw, decimals, symbol)` | `Amount.fromRaw().toFormatted()` |
| `parseAmount(human, decimals)` | `Amount.parse().raw` |
| `normaliseAddress(raw)` | `fromAddress()` + `isValidAddress()` |
| `getPresetToken(symbol, network)` | `mainnetTokens` / `sepoliaTokens` |
| `computeFeeStrk(strkUsdPrice)` | `Amount.parse().toFormatted(4)` |

```js
import { StarkZapHelpers } from './starkzap-browser.js';

// Format a raw on-chain amount
StarkZapHelpers.formatAmount('1000000000000000000', 18, 'STRK');
// → "1.000000 STRK"

// Validate + normalise an address
StarkZapHelpers.normaliseAddress('0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d');
// → { valid: true, normalised: '0x04718f...' }

// Get canonical STRK address from StarkZap's preset registry
StarkZapHelpers.getPresetTokenAddress('STRK', 'mainnet');
// → '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'

// Compute verification fee in STRK
StarkZapHelpers.computeFeeStrk(2.00); // STRK at $2.00
// → "0.3750"
```

### Why StarkZap for amount math?

JavaScript's native `Number` loses precision above 2^53. Starknet amounts are 256-bit integers — a raw STRK balance can be `1500000000000000000` (18 zeros). Dividing naively with `/` or `*` introduces silent rounding errors. StarkZap's `Amount` type uses `BigInt` internally and handles decimal shifting correctly, so displayed balances and fee calculations are always exact.

---

## 📁 Project Structure

```
TokenHive/
├── api/
│   └── server.js            # Express API server
├── admin/
│   └── index.html           # Admin panel (private route)
├── starkzap-integration.js  # StarkZap server-side module  ← NEW
├── starkzap-browser.js      # StarkZap browser helpers     ← NEW
├── registry.js              # In-memory token registry (browser)
├── app.js                   # Frontend app logic
├── index.html               # Main UI
├── style.css                # Styles
└── package.json
```

---

## 🚀 Running Locally

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project with a `tokens` table and `verification_requests` table
- A [Resend](https://resend.com) API key for email notifications

### 1. Clone & install

### 2. Environment variables

Create a `.env` file (never commit this):

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Auth
ADMIN_PASSWORD=your-admin-password
JWT_SECRET=a-long-random-secret

# Email
RESEND_API_KEY=re_xxxxxxxxxxxx

# Starknet
TREASURY_WALLET=0x...
TREASURY_PRIVATE_KEY=0x...   # optional — enables balance checks via StarkZap

# Optional
PORT=3001
NODE_ENV=development
```

### 3. Run

```bash
node api/server.js
```

Open `http://localhost:3001` in your browser.

---

## 🌐 API Reference

Base URL: `https://tokenhive.onrender.com/api/v1`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/tokens` | List all tokens (supports `network`, `verified`, `limit`, `offset`) |
| GET | `/tokens/:address` | Get token by contract address |
| GET | `/tokens/search?q=` | Full-text search across name, symbol, address, tags |
| POST | `/tokens/register` | Register a new token |
| PATCH | `/tokens/:address` | Update token metadata (owner only) |
| GET | `/resolve/:address` | Resolve address → token metadata |
| GET | `/stats` | Registry statistics |
| GET | `/health` | Health check |
| GET | `/ping` | Uptime ping — returns `pong` |

---

## 🚢 Deploying to Render

1. Push this repo to GitHub (make sure `.gitignore` excludes `.env`, `node_modules/`, `supabase_data.txt`, `deployment on mainnet`, `future_deployment.txt`)
2. Create a new **Web Service** on [Render](https://render.com)
3. Connect your GitHub repo
4. Set:
   - **Build command:** `npm install`
   - **Start command:** `node api/server.js`
5. Add all `.env` values under **Environment** in the Render dashboard

---

## 📜 License

MIT

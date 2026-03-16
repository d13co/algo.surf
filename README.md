# Algo Surf

A modern Algorand blockchain explorer. Evolved from [dappflow](https://github.com/intelli-scripts/dappflow).

Live at [algo.surf](https://algo.surf).

## Features

### Live Dashboard
- Real-time block and transaction feeds with smooth animations
- Live network stats: transactions per second (TPS), average block time, total transaction count

### Block Explorer
- Block details with proposer, rewards, bonus, and suspended accounts
- Transaction type summary per block
- Keyboard navigation between blocks (arrow keys)

### Transaction Viewer
- All Algorand transaction types: payments, asset transfers, asset config/freeze, application calls, key registration, state proofs, heartbeats
- Inner transaction hierarchy for inner transactions
- Application (escrow) account resolution
- Transaction notes decoded in multiple formats (UTF-8, Base64, JSON, MessagePack, Hex)
- Multisig and LogicSig signature details
- Rekey detection and display
- Visual link between grouped transactions

### Account Explorer
- Balance, status, transaction history
- Searchable asset holdings, created assets
  - Blazing fast asset lookups: ~10 seconds to [load 16,000+ assets](https://algo.surf/account/XSKED5VKZZCSYNDWXZJI65JM2HP7HZFJWCOBIMOONKHTK5UVKENBNVDEYM/assets) from the chain
- Searchable account applications by Algokit deployer name
- Validator participation data with earnings analysis
- Controller account relationships (rekeyed-to)
- NFD domain resolution
- Address book with custom labels
- Application (escrow) account resolution on all networks

### Asset Explorer
- Asset metadata, supply info, freeze/clawback status
- Verified asset badges (Pera)
- Transaction history per asset

### Application (Smart Contract) Explorer
- TEAL program viewer with decompilation
- Program word frequency analysis
- Global and local state inspection with multi-format value display
- Box storage viewer with ARC-4 type parsing and decoding
- Box search with advanced filtering

### Group Transaction Analysis
- Grouped transaction viewer
- Balance impact calculation showing algo/asset movements per participant

### Search
- Universal search across accounts, transactions, assets, applications, blocks, and .algo NFD domains
- Verified asset name/unit search
- Keyboard shortcut (Ctrl+K or /)
- Search by URL - just append your query to `algo.surf`:
  - Account: [algo.surf/DTHIRTEENNLSYGLSEXTXC6X4SVDWMFRCPAOAUCXWIXJRCVBWIIGLYARNQE](https://algo.surf/DTHIRTEENNLSYGLSEXTXC6X4SVDWMFRCPAOAUCXWIXJRCVBWIIGLYARNQE)
  - NFD: [algo.surf/d13.algo](https://algo.surf/d13.algo)
  - Asset name (verified only): [algo.surf/usdc](https://algo.surf/usdc)
  - Asset ID: [algo.surf/312769](https://algo.surf/312769)
  - Application ID: [algo.surf/987654321](https://algo.surf/987654321)
  - Block: [algo.surf/1000000/](https://algo.surf/1000000/)
  - Txn ID: [algo.surf/7MK6WLKFBPC323ATSEKNEKUTQZ23TCCM75SJNSFAHEM65GYJ5ANQ](https://algo.surf/7MK6WLKFBPC323ATSEKNEKUTQZ23TCCM75SJNSFAHEM65GYJ5ANQ)
- "Did you mean" suggestions: [algo.surf/312769](https://algo.surf/312769)

### Multi-Network Support
- Mainnet, Testnet, Betanet, Localnet, Fnet
- Network switcher in footer
- Shortcut subdomains for quick navigation:
  - [t.algo.surf](https://t.algo.surf) > testnet
  - [l.algo.surf](https://l.algo.surf) > localnet
  - [b.algo.surf](https://b.algo.surf) > betanet
  - [f.algo.surf](https://f.algo.surf) > fnet

## Architecture

Algo Surf is a zero-backend explorer. All data is fetched directly from algod and indexer nodes (powered by [Nodely](https://nodely.io)) in the browser - there is no intermediary server. On-chain reads that would normally require many round-trips are batched using simulate calls.

The one exception is validator proposal/earnings data, which comes from a lightweight analytics API.

### Supporting libraries

- [abel-ghost-sdk](https://github.com/d13co/abel-ghost-sdk) - Batch asset metadata lookups via simulate. Provides Pera verified asset labels and the Abel label registry on mainnet
- [@d13co/algo-metrics-sdk](https://github.com/d13co/algo-metrics-sdk) - Batch block data fetch, live block watching with sliding-window TPS, average block time, and transaction count calculations
- [@d13co/algo-metrics-react](https://github.com/d13co/algo-metrics-react) - React hooks and shared provider for algo-metrics-sdk
- [@d13co/algo-group-balance-impact](https://github.com/d13co/algo-group-balance-impact) - Net balance impact (deltas) across all participants in a transaction group
- [@d13co/escreg-sdk](https://github.com/d13co/escreg-sdk) - On-chain escrow registry lookups via simulate. Resolves application escrow accounts on all networks
- [@d13co/open-in](https://github.com/d13co/open-in) - Registry of Algorand explorers and dApps for "Open in..." cross-linking

## Tech Stack

React 18, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui, TanStack Query + Table, algosdk v3, AlgoKit Utils

## Getting Started

1. Install Node.js
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`

Opens at [http://localhost:5173](http://localhost:5173).

### Network-specific dev servers

```
npm run dev:mainnet
npm run dev:testnet
npm run dev:betanet
npm run dev:localnet
npm run dev:fnet
```

Or pass the env var directly: `REACT_APP_NETWORK="Localnet" npm start`

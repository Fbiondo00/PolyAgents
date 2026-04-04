No, VaultPilot doesn't need Supabase (or any traditional database) for the ETHGlobal prototype. The architecture relies entirely on sponsor-native on-chain primitives: Arc EVM contracts for positions, Hedera HTS for tokens/HBAR payments/HCS logs (via JS SDK), ENS text records for commitments, and Polymarket API for market data—no off-chain persistence required beyond localStorage for the frontend demo.
Why No Database
Hedera HCS handles immutable decision/access logs (one topic per vault). Query via Mirror Node REST API.[1]
Arc EVM stores USDC positions/PnL directly.[3]
HTS tokens track operator access and trade NFTs. Balances queried via SDK.[1]
ENS publishes public stats (policy hash, PnL, mode).[3]
Frontend uses localStorage for vault drafts, mock activity, and user state—persists across reloads without backend.[2]
This keeps the stack lean (23h build), sponsor-focused (zero non-sponsor deps), and demo-ready (no DB setup/seed/migration). Post-hackathon, Supabase could add user accounts or RAG embeddings if scaling to multi-vault/multi-operator, but it's unnecessary here.

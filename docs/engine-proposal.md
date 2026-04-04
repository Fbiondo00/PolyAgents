SPECIFICA TECNICA — Polymarket BTC 5M Research Bot
Versione target: research / paper trading / simulation
Stack obbligatorio: Next.js 15 App Router, TypeScript, Supabase, Postgres, Edge-safe frontend + Node runtime per servizi server
Obiettivo: implementare nel progetto un sistema completo per monitorare i mercati BTC “Up or Down - 5 Minutes” di Polymarket, simulare la strategia di passive market making a prezzi estremi, tracciare eventi/orderbook/fill simulati, persistere stato e mostrare dashboard operativa.
Contesto prodotto
Voglio costruire un modulo backend + dashboard frontend nel mio progetto Next.js con database Supabase per analizzare e simulare una strategia su Polymarket BTC 5 minuti.
La strategia da simulare è:
Non direzionale, totalmente passiva
Scopre il mercato BTC 5M attivo
Monitora order book e best bid/ask
Inserisce virtualmente buy limit a 0.01 su entrambi i lati (UP e DOWN), solo se non viola passive-only rules
Se un ordine simulato viene considerato fillato, crea istantaneamente un sell limit virtuale a 0.02
Blocca nuovi ingressi negli ultimi N secondi prima della scadenza
Cancella buy virtuali a expiry
Mantiene sell virtuali per un grace period configurabile
Esegue riconciliazione stato locale periodica
Tiene log completo di eventi, ordini, inventory, PnL, rollover mercato
Importante:
NON implementare live trading, wallet signing o invio di ordini reali. Tutto deve essere paper-trading / simulation-first, con separazione chiara tra adapter simulato e un futuro adapter live.
Vincoli architetturali
Usa:
Next.js App Router
TypeScript strict
Supabase Postgres
Supabase server client per operazioni backend
Zod per validazione
React Server Components dove utile
Route handlers / server actions solo dove sensato
Long-running jobs solo in runtime Node
Nessuna logica critica di trading nel client browser
Repository pattern per accesso dati
Dependency injection semplice e pulita
Codice modulare, production-grade, testabile
Fonti dati da modellare
Il sistema deve essere progettato per usare questi concetti Polymarket:
Gamma API per market discovery
CLOB API per order book / spread / prezzi
CLOB WebSocket market channel per aggiornamenti quasi real-time
User channel NON attivo nella modalità simulation, ma prevedi interfaccia astratta compatibile
Mercati binari con token UP/DOWN, expiry, tick size, best bid, best ask, last trade
Prevedi adapter con interfaccia:
MarketDiscoveryProvider
OrderBookProvider
MarketStreamProvider
ExchangeAdapter
e fornisci una implementazione:
PolymarketReadOnlyAdapter
SimulatedExchangeAdapter
Obiettivi funzionali
Implementa queste capability:
Discover del mercato BTC 5M corrente
Tracking del lifecycle del mercato attivo
Subscription al relativo order book stream
State machine strategica
Simulazione ordini e fill
Inventory ledger per token lato UP/DOWN
Risk controls configurabili
Persistenza stato su Supabase
Dashboard operativa
Cron/reconciliation loop
Audit trail completo
Possibilità di replay storico dei mercati salvati
Strategia da implementare
Parametri configurabili
enabled: boolean
entry_price: decimal = 0.01
exit_price: decimal = 0.02
order_size: decimal = 10
max_capital_usdc: decimal
max_trades_per_market: integer
no_new_entries_last_seconds: integer = 10
keep_sell_orders_after_expiry_seconds: integer = 10
reconcile_interval_seconds: integer
min_spread_required: decimal
strict_passive_only: boolean = true
allow_both_sides: boolean = true
Regole strategiche
Lavora solo sul mercato BTC 5M attivo
Considera entrambi i lati del mercato come indipendenti
Se non ci sono posizioni aperte o ordini buy attivi per quel lato, prova a quotare 0.01
Non inserire nuovi ordini se manca meno di no_new_entries_last_seconds alla scadenza
Se strict_passive_only=true, non quotare se entry_price >= best_ask
Valida che il prezzo rispetti il tick size del mercato
Se un buy simulato viene fillato, incrementa inventory e crea sell simulato a 0.02
Non creare sell superiori all’inventory disponibile
A expiry cancella tutti i buy aperti
Mantieni sell fino a grace period
Al rollover archivia il mercato vecchio e passa al nuovo
La riconciliazione deve ricalcolare inventory attesa, ordini aperti, fill e PnL
Modalità simulation
Devi implementare un motore di simulazione realistico ma prudente.
Regole per fill simulati:
Un buy limit può essere considerato fillato solo se il mercato tocca/scende sotto quel prezzo nel book/trade stream o se una regola deterministica configurabile lo consente
Un sell limit può essere considerato fillato solo se il best bid raggiunge o supera il prezzo
Supporta partial fills
Salva sempre il motivo del fill simulato:
touched_price
crossed_top_of_book
expiry_close
manual_reconcile
replay_engine
Non inventare fill casuali senza una regola esplicita.
State machine
Definisci una state machine chiara con stati:
IDLE
DISCOVERING_MARKET
SYNCING_MARKET
READY
QUOTING
HOLDING_INVENTORY
EXPIRY_GUARD
ROLLING_OVER
RECONCILING
PAUSED
ERROR
Ogni transizione deve avere:
trigger
preconditions
side effects
persisted event log
Struttura del progetto richiesta
Genera un’architettura tipo:
src/
  app/
    dashboard/polymarket/page.tsx
    dashboard/polymarket/markets/page.tsx
    dashboard/polymarket/markets/
[[marketId]]
/page.tsx
    dashboard/polymarket/orders/page.tsx
    dashboard/polymarket/fills/page.tsx
    dashboard/polymarket/settings/page.tsx
    api/polymarket/engine/start/route.ts
    api/polymarket/engine/stop/route.ts
    api/polymarket/engine/reconcile/route.ts
    api/polymarket/markets/active/route.ts
    api/polymarket/stream/health/route.ts
  lib/
    polymarket/
      domain/
        entities/
        value-objects/
        events/
      application/
        use-cases/
        services/
      infrastructure/
        adapters/
        repositories/
        websocket/
        gamma/
        clob/
      strategy/
        engine.ts
        state-machine.ts
        risk-engine.ts
        fill-simulator.ts
        rollover.ts
        reconciliation.ts
      shared/
        types.ts
        constants.ts
        schemas.ts
        utils.ts
  components/
    polymarket/
      dashboard/
      tables/
      charts/
      status/
  supabase/
    migrations/
Schema database Supabase richiesto
Progetta e scrivi SQL migration complete per queste tabelle:
polymarket_markets
id uuid pk
external_market_id text unique
slug text
question text
market_type text
status text
chain_id int
condition_id text
token_up_id text
token_down_id text
start_time timestamptz
end_time timestamptz
active boolean
closed boolean
resolved boolean
winning_side text null
tick_size numeric
min_order_size numeric
raw_payload jsonb
created_at timestamptz
updated_at timestamptz
polymarket_market_snapshots
id uuid pk
market_id uuid fk
captured_at timestamptz
best_bid_up numeric
best_ask_up numeric
best_bid_down numeric
best_ask_down numeric
spread_up numeric
spread_down numeric
last_trade_up numeric
last_trade_down numeric
book_hash_up text
book_hash_down text
raw_payload jsonb
polymarket_strategy_configs
id uuid pk
name text
enabled boolean
mode text check in ('simulation','replay')
entry_price numeric
exit_price numeric
order_size numeric
max_capital_usdc numeric
max_trades_per_market int
no_new_entries_last_seconds int
keep_sell_orders_after_expiry_seconds int
reconcile_interval_seconds int
min_spread_required numeric
strict_passive_only boolean
allow_both_sides boolean
created_at timestamptz
updated_at timestamptz
polymarket_engine_runs
id uuid pk
config_id uuid fk
status text
started_at timestamptz
stopped_at timestamptz
current_market_id uuid null fk
current_state text
last_heartbeat_at timestamptz
last_error text null
metadata jsonb
polymarket_virtual_orders
id uuid pk
engine_run_id uuid fk
market_id uuid fk
side text check in ('UP','DOWN')
action text check in ('BUY','SELL')
status text check in ('OPEN','PARTIAL','FILLED','CANCELLED','EXPIRED','REJECTED')
order_kind text check in ('LIMIT')
price numeric
size numeric
filled_size numeric
remaining_size numeric
simulated boolean default true
client_order_id text unique
external_order_id text null
placed_at timestamptz
updated_at timestamptz
expires_at timestamptz null
rejection_reason text null
metadata jsonb
polymarket_virtual_fills
id uuid pk
order_id uuid fk
market_id uuid fk
side text
action text
fill_price numeric
fill_size numeric
fill_notional numeric
fill_reason text
event_time timestamptz
raw_payload jsonb
polymarket_inventory_ledger
id uuid pk
engine_run_id uuid fk
market_id uuid fk
side text
qty_total numeric
qty_available numeric
qty_reserved numeric
avg_cost numeric
updated_at timestamptz
polymarket_engine_events
id uuid pk
engine_run_id uuid fk
market_id uuid null fk
event_type text
severity text
state_from text null
state_to text null
message text
payload jsonb
created_at timestamptz
polymarket_reconciliations
id uuid pk
engine_run_id uuid fk
market_id uuid null fk
status text
summary jsonb
started_at timestamptz
completed_at timestamptz
polymarket_pnl_snapshots
id uuid pk
engine_run_id uuid fk
market_id uuid fk
snapshot_time timestamptz
realized_pnl numeric
unrealized_pnl numeric
inventory_cost numeric
inventory_mark_value numeric
open_orders_notional numeric
total_exposure numeric
Crea anche:
indici utili
updated_at trigger
viste dashboard
RLS di default disabilitata per service role, ma pronta per attivazione su letture user-specific in futuro
Use case richiesti
Implementa questi use case server-side:
getActiveBtc5mMarket()
syncActiveMarket()
startEngine(configId)
stopEngine(runId)
processMarketTick(event)
placeVirtualBuyQuotes()
processSimulatedFill()
placeVirtualExitOrder()
cancelExpiredBuys()
handleMarketExpiry()
rolloverToNextMarket()
reconcileRunState()
computeRunPnL()
getDashboardSummary()
listOrders(filters)
listFills(filters)
getMarketReplay(marketId)
Risk engine richiesto
Implementa un modulo risk-engine con questi controlli:
capital cap globale
max trades per market
no new entries vicino a expiry
passive-only validation
tick-size validation
oversell prevention
duplicate order prevention
stale market guard
websocket stale data guard
emergency pause su errori ripetuti
Ogni reject deve produrre un evento persistito con codice macchina e messaggio umano.
WebSocket manager richiesto
Implementa un manager robusto con:
subscribe/unsubscribe per token ids
backoff esponenziale
ping/heartbeat
detection stale stream
reconnect automatico
event normalization
debounce opzionale per update ad alta frequenza
persistenza snapshot sintetici a intervallo configurabile
API interne da esporre
Crea route handlers REST interni:
POST /api/polymarket/engine/start
POST /api/polymarket/engine/stop
POST /api/polymarket/engine/reconcile
POST /api/polymarket/engine/pause
POST /api/polymarket/engine/resume
GET /api/polymarket/engine/status
GET /api/polymarket/markets/active
GET /api/polymarket/markets/history
GET /api/polymarket/orders
GET /api/polymarket/fills
GET /api/polymarket/pnl
GET /api/polymarket/events
Usa validazione Zod su input/output.
Dashboard frontend richiesta
Crea una dashboard professionale con shadcn/ui o componenti equivalenti.
Pagine richieste:
Overview
Mercato attivo
Ordini virtuali
Fill simulati
Inventory
Event log
PnL
Configurazione strategia
Replay mercato
Widget richiesti:
stato engine
mercato attivo con countdown
best bid/ask UP e DOWN
spread
ordini aperti
inventory lato UP/DOWN
fill recenti
PnL realizzato/non realizzato
ultimi eventi di rischio
health websocket
ultimo heartbeat
Requisiti UI/UX
Layout scuro professionale
Tabelle dense ma leggibili
Badge stato colore-consistenti
Auto-refresh lato dashboard via polling o SSE interno
Nessuna logica sensibile nel client
Countdown expiry accurato
Timeline eventi chiara
Pagine ottimizzate per desktop
Logging e osservabilità
Implementa:
structured logs
event sourcing leggero per azioni critiche
correlation id per engine run
error taxonomy
health checks
metriche base:
ordini aperti
fill count
fill ratio
avg hold time
pnl per market
error count
reconnect count
Test richiesti
Genera:
unit test per risk-engine
unit test per fill-simulator
unit test per state-machine
integration test per repositories
test del rollover
test di expiry handling
test di duplicate prevention
test di reconciliation
fixture realistiche per market data
Usa Vitest.
Seed e dati demo
Fornisci:
seed SQL o script TS per una config di default
un engine run demo
mercati demo
snapshots demo
ordini/fill demo
eventi demo
Output richiesto
Voglio che tu generi nell’ordine:
Architettura tecnica sintetica
Albero file completo
SQL migration Supabase completa
Type definitions e Zod schemas
Repository interfaces + implementazioni
Adapter Polymarket read-only
SimulatedExchangeAdapter
Strategy engine e state machine
API routes
Dashboard pages/components
Test principali
README operativo
Regole di qualità codice
Nessun pseudo-codice
Nessun TODO vuoto
Ogni file deve essere pronto da incollare
Tipi forti ovunque
Separazione netta tra dominio, app e infrastruttura
Funzioni piccole e nominate bene
Nessuna dipendenza inutile
Nessun accesso diretto al DB fuori dai repository
Nessun segreto hardcodato
Variabili env documentate
Commenti brevi e solo dove servono
Env vars da supportare
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
POLYMARKET_GAMMA_BASE_URL
POLYMARKET_CLOB_BASE_URL
POLYMARKET_WS_BASE_URL
ENGINE_HEARTBEAT_INTERVAL_MS
MARKET_SNAPSHOT_INTERVAL_MS
DEFAULT_TIMEZONE
Deliverable finale
Il risultato deve essere un modulo integrabile nel mio progetto Next.js esistente, con Supabase come source of truth, focalizzato su simulation/paper trading dei mercati BTC 5M di Polymarket, pronto per essere eseguito in locale e poi deployato su infrastruttura server Node compatibile.
Se devi fare assunzioni tecniche, dichiarale esplicitamente all’inizio prima di generare il codice.

# PolyAgents — ETHGlobal Cannes 2026
# AI-powered autonomous trading vault for Polymarket BTC 5-minute markets
#
# Services (srcs/docker-compose.yml):
#   db        — PostgreSQL 15 on the compose network
#   engine    — Rust axum API + trading engine on :8080
#   frontend  — Next.js 16 standalone on :3000
#   mcp       — poly-mcp stdio server (optional profile)

.PHONY: all setup build stop start restart clean fclean re dev \
       engine-build engine-check engine-run engine-test engine-clean \
       mcp-build mcp-run

NAME = polyagents
COMPOSE_FILE = srcs/docker-compose.yml
REQS = srcs/requirements
FRONTEND = $(REQS)/frontend
ENGINE = $(REQS)/engine

GREEN = \033[0;32m
RED = \033[0;31m
CYAN = \033[0;36m
RESET = \033[0m

# Default: build packages and start dev
all: setup build

# ── Setup ──────────────────────────────────────────────────────────────

setup:
	@printf "$(CYAN)Setting up environment...$(RESET)\n"
	@if [ ! -f .env ]; then cp .env.example .env; printf "$(GREEN)Created .env from .env.example$(RESET)\n"; fi
	@printf "$(CYAN)Installing dependencies...$(RESET)\n"
	@cd $(FRONTEND) && npm install --silent

# ── Build (packages in dependency order) ───────────────────────────────

build:
	@printf "$(GREEN)Building Rust MCP server...$(RESET)\n"
	@cd $(ENGINE) && cargo build --release -p poly-mcp
	@printf "$(GREEN)Building frontend...$(RESET)\n"
	@cd $(FRONTEND) && npm run build
	@printf "$(GREEN)All packages built successfully.$(RESET)\n"

# ── Development ────────────────────────────────────────────────────────

dev:
	@cd $(FRONTEND) && npm run dev

# ── Docker Compose ─────────────────────────────────────────────────────

up:
	@printf "$(GREEN)Starting containers...$(RESET)\n"
	@docker compose -f $(COMPOSE_FILE) up -d

down:
	@printf "$(RED)Stopping containers...$(RESET)\n"
	@docker compose -f $(COMPOSE_FILE) down

stop:
	@printf "$(RED)Stopping containers...$(RESET)\n"
	@docker compose -f $(COMPOSE_FILE) stop

start:
	@printf "$(GREEN)Starting containers...$(RESET)\n"
	@docker compose -f $(COMPOSE_FILE) start

restart:
	@printf "$(CYAN)Restarting containers...$(RESET)\n"
	@docker compose -f $(COMPOSE_FILE) restart

# ── Clean ──────────────────────────────────────────────────────────────

clean:
	@printf "$(RED)Cleaning build artifacts...$(RESET)\n"
	@rm -rf $(FRONTEND)/.next
	@docker compose -f $(COMPOSE_FILE) down -v 2>/dev/null || true

fclean: clean
	@printf "$(RED)Deep cleaning...$(RESET)\n"
	@rm -rf $(FRONTEND)/node_modules
	@docker system prune -af 2>/dev/null

re: fclean all

# ── Rust Engine ────────────────────────────────────────────────────────

engine-check:
	@printf "$(CYAN)Checking Rust engine...$(RESET)\n"
	@cd $(ENGINE) && cargo check

engine-build:
	@printf "$(GREEN)Building Rust engine (release)...$(RESET)\n"
	@cd $(ENGINE) && cargo build --release

engine-run:
	@printf "$(GREEN)Running Rust engine...$(RESET)\n"
	@cd $(ENGINE) && cargo run --release

engine-test:
	@printf "$(CYAN)Running Rust tests...$(RESET)\n"
	@cd $(ENGINE) && cargo test

engine-clean:
	@printf "$(RED)Cleaning Rust build artifacts...$(RESET)\n"
	@cd $(ENGINE) && cargo clean

mcp-build:
	@printf "$(GREEN)Building poly-mcp MCP server (release)...$(RESET)\n"
	@cd $(ENGINE) && cargo build --release -p poly-mcp

mcp-run:
	@printf "$(GREEN)Running poly-mcp MCP server...$(RESET)\n"
	@cd $(ENGINE) && cargo run --release -p poly-mcp

# PolyAgents — ETHGlobal Cannes 2026
# AI-powered autonomous trading vault for Polymarket BTC 5-minute markets
#
# Services:
#   frontend  — Next.js 16 (Turbopack) on :3000
#   supabase  — Local PostgreSQL + Studio on :54321

.PHONY: all setup build stop start restart clean fclean re dev

NAME = polyagents
COMPOSE_FILE = srcs/docker-compose.yml
REQS = srcs/requirements
FRONTEND = $(REQS)/frontend
SCHEMA = $(REQS)/schema
SDK = $(REQS)/sdk
MCP = $(REQS)/mcp

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
	@cd $(SCHEMA) && npm install --silent
	@cd $(SDK) && npm install --silent
	@cd $(FRONTEND) && npm install --silent
	@cd $(MCP) && npm install --silent
	@printf "$(CYAN)Starting Supabase...$(RESET)\n"
	@cd $(REQS)/supabase && supabase start 2>/dev/null || true

# ── Build (packages in dependency order) ───────────────────────────────

build:
	@printf "$(GREEN)Building schema...$(RESET)\n"
	@cd $(SCHEMA) && npm run build
	@printf "$(GREEN)Building SDK...$(RESET)\n"
	@cd $(SDK) && npm run build
	@printf "$(GREEN)Building MCP server...$(RESET)\n"
	@cd $(MCP) && npm run build
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
	@rm -rf $(SCHEMA)/dist $(SDK)/dist $(MCP)/dist $(FRONTEND)/.next
	@docker compose -f $(COMPOSE_FILE) down -v 2>/dev/null || true
	@cd $(REQS)/supabase && supabase stop 2>/dev/null || true

fclean: clean
	@printf "$(RED)Deep cleaning...$(RESET)\n"
	@rm -rf $(FRONTEND)/node_modules $(SCHEMA)/node_modules $(SDK)/node_modules $(MCP)/node_modules
	@docker system prune -af 2>/dev/null

re: fclean all

# Terraform MCP Server

The [HashiCorp Terraform MCP Server](https://github.com/hashicorp/terraform-mcp-server) provides MCP tools for Terraform Registry lookups and HCP Terraform/Terraform Enterprise workspace management. It's configured as a stdio MCP server in this project.

## Setup

The server is registered in `.mcp.json` at the project root. It was installed from source:

```bash
cd /Users/ppezz/Desktop/Craftale/hackathon/Cannes2026/terraform-mcp-server
go install ./cmd/terraform-mcp-server
claude mcp add terraform -s project -t stdio -- /Users/ppezz/go/bin/terraform-mcp-server stdio
```

Alternatively, run via Docker (requires Docker daemon):

```bash
claude mcp add terraform -s project -t stdio -- docker run -i --rm hashicorp/terraform-mcp-server:0.5.2
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TFE_TOKEN` | HCP Terraform / TFE API token | Only for workspace operations |
| `TFE_ADDRESS` | HCP Terraform / TFE address (default: `https://app.terraform.io`) | No |

For registry-only usage (provider/module/policy lookups), no credentials are needed.

### Configuration

The project's `.mcp.json`:

```json
{
  "mcpServers": {
    "terraform": {
      "type": "stdio",
      "command": "/Users/ppezz/go/bin/terraform-mcp-server",
      "args": ["stdio"]
    }
  }
}
```

## Available Tools

The server exposes tools grouped into three toolsets:

### Registry (default, no auth required)

Provider, module, and policy lookups against the public Terraform Registry:

| Tool | Description |
|------|-------------|
| `search_providers` | Search Terraform providers by name |
| `get_provider_details` | Get provider metadata, versions, and docs |
| `get_latest_provider_version` | Get the latest version of a provider |
| `get_provider_capabilities` | Get provider resource/data source capabilities |
| `search_modules` | Search Terraform modules |
| `get_module_details` | Get module metadata and versions |
| `get_latest_module_version` | Get the latest version of a module |
| `search_policies` | Search Sentinel policies |
| `get_policy_details` | Get policy metadata |

### Private Registry (`TFE_TOKEN` required)

Private module and provider access in HCP Terraform / TFE organizations:

| Tool | Description |
|------|-------------|
| `search_private_modules` | Search private modules in your org |
| `get_private_module_details` | Get private module metadata |
| `search_private_providers` | Search private providers in your org |
| `get_private_provider_details` | Get private provider metadata |

### Terraform (`TFE_TOKEN` required)

Workspace, run, and variable management:

| Tool | Description |
|------|-------------|
| `list_terraform_orgs` | List organizations |
| `list_terraform_projects` | List projects in an org |
| `list_workspaces` | List workspaces in a project |
| `get_workspace_details` | Get workspace config and state |
| `create_workspace` | Create a new workspace |
| `update_workspace` | Update workspace settings |
| `delete_workspace_safely` | Delete a workspace |
| `list_runs` | List runs in a workspace |
| `get_run_details` | Get run status and metadata |
| `get_plan_details` / `get_plan_logs` | Get plan output |
| `get_apply_details` / `get_apply_logs` | Get apply output |
| `create_run` | Trigger a new run |
| `list_workspace_variables` | List workspace variables |
| `create_workspace_variable` | Create a variable |
| `update_workspace_variable` | Update a variable |

Full tool reference: <https://developer.hashicorp.com/terraform/docs/tools/mcp-server/reference>

## Usage in This Project

The Terraform MCP is used alongside our `infra/terraform/` configuration to:

1. **Look up provider versions** — ensure `hashicorp/aws` and other providers use compatible versions
2. **Search modules** — find community modules for VPC, RDS, ECS, etc.
3. **Get provider docs** — check available resources, arguments, and attributes without leaving the editor
4. **Manage workspaces** (when `TFE_TOKEN` is set) — list runs, check plan output, trigger applies

### Example Prompts

```
# Find the latest AWS provider version
"Search for the hashicorp/aws provider and get its latest version"

# Find a VPC module
"Search for terraform modules that create a VPC on AWS"

# Check provider resource docs
"What resources does the hashicorp/aws provider support for ECS?"

# Trigger a run (requires TFE_TOKEN)
"List workspaces in my org and show the latest run status"
```

## Terraform Infra Reference

The project's Terraform config lives at `srcs/requirements/infra/terraform/`:

- `main.tf` — AWS EC2 instance + RDS Postgres + security groups for the engine deployment
- `variables.tf` — Configurable variables (region, instance type, DB class, passwords)
- `user-data.sh` — Cloud-init script that installs Rust, clones the repo, starts the engine

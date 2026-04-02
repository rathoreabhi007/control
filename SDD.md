# Software Design Document (SDD)
## Generic Control Dashboard

| Document Version | 1.0 |
|------------------|-----|
| Date | January 2026 |
| Status | Draft |
| Classification | Internal |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Architecture](#3-architecture)
4. [Component Specifications](#4-component-specifications)
5. [Data Flow Diagrams](#5-data-flow-diagrams)
6. [Security Design](#6-security-design)
7. [API Specifications](#7-api-specifications)
8. [Technology Stack](#8-technology-stack)
9. [Deployment Architecture](#9-deployment-architecture)
10. [Appendices](#10-appendices)

---

## 1. Executive Summary

### 1.1 Purpose
The Generic Control Dashboard is an in-house reconciliation framework providing monitoring and management tools for data reconciliation processes, control execution, ETL workflows, and system monitoring.

### 1.2 Scope
- Data reconciliation control execution (Completeness, Quality)
- Airflow-style control run management
- Visual workflow builder for ETL pipelines
- Real-time system monitoring
- AI-assisted data analysis
- Role-based access control

### 1.3 Key Design Decisions
| Decision | Rationale |
|----------|-----------|
| File-based persistence | Eliminates DB dependencies, enables horizontal scaling |
| Stateless backend | Gunicorn-compatible, survives worker restarts |
| External subprocess execution | Decouples tasks from API worker lifecycle |
| WebSocket + REST fallback | Real-time updates with guaranteed delivery |
| Polars over Pandas | 10-100x faster data processing |

---

## 2. System Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Dashboard  │  │  Control    │  │  Workflow   │  │    AI       │    │
│  │    Home     │  │    Runs     │  │   Builder   │  │ Assistant   │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │            │
│  ┌──────┴────────────────┴────────────────┴────────────────┴──────┐    │
│  │                    React Router (SPA)                           │    │
│  │              UserContext | DataOutputContext                    │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│  ┌──────────────────────────────┴──────────────────────────────────┐    │
│  │              API Service (REST) | WebSocket Client              │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
└─────────────────────────────────┼───────────────────────────────────────┘
                                  │ HTTP/WS
┌─────────────────────────────────┼───────────────────────────────────────┐
│                              BACKEND                                     │
│  ┌──────────────────────────────┴──────────────────────────────────┐    │
│  │                    FastAPI Application                          │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │    │
│  │  │ System  │ │  ETL    │ │Controls │ │  Data   │ │  Users  │   │    │
│  │  │ Router  │ │ Router  │ │ Router  │ │ Router  │ │ Router  │   │    │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │    │
│  └───────┼──────────┼──────────┼──────────┼──────────┼────────────┘    │
│          │          │          │          │          │                  │
│  ┌───────┴──────────┴──────────┴──────────┴──────────┴────────────┐    │
│  │                    Service Layer                                │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │    │
│  │  │  Parquet    │  │  Control    │  │  Transform  │             │    │
│  │  │  Service    │  │  Execution  │  │  Operations │             │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │    │
│  └─────────┼────────────────┼────────────────┼────────────────────┘    │
│            │                │                │                          │
│  ┌─────────┴────────────────┴────────────────┴────────────────────┐    │
│  │                    File-Based Storage                           │    │
│  │  task_storage/  │  workflow_storage/  │  judgment_storage/     │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Core Capabilities

| Capability | Description |
|------------|-------------|
| Control Runs | Airflow-style task execution with scheduling |
| ETL Execution | Step-based data transformation pipelines |
| Workflow Builder | Visual drag-and-drop ETL design |
| Data Operations | Parquet/CSV read, transform, aggregate |
| AI Assistant | LLM-powered chat and judgment evaluation |
| Monitoring | Real-time CPU/memory metrics |

---

## 3. Architecture

### 3.1 Frontend Architecture

```
src/
├── App.js                     # Route definitions, UserProvider wrapper
├── page.js                    # Homepage with feature cards
├── instances/                 # Feature-specific pages (tab-based)
│   ├── completeness/         # Completeness control instance
│   ├── quality/              # Quality control instance
│   ├── workflow/             # Workflow builder instance
│   ├── ai-assistant/         # AI chat instance
│   └── control-status/       # Control status instance
├── controls/                  # Reusable control implementations
│   ├── control-runs/         # Airflow-style execution UI
│   ├── workflow/             # ReactFlow workflow builder
│   └── validator/            # Transform validator
├── components/               # Shared UI components
│   ├── DataGrid/            # AG Grid wrapper
│   └── UserSwitcher.js      # User role switcher
├── contexts/                 # React Context providers
│   ├── UserContext.js       # User auth & permissions
│   └── DataOutputContext.js # Shared data state
└── services/                 # API & WebSocket clients
    ├── api.js               # REST API service
    └── websocket.js         # WebSocket client
```

#### 3.1.1 Route Structure

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | HomePage | Main dashboard |
| `/control-runs` | ControlRunsPage | Task execution management |
| `/instances/{type}/{id}` | Instance pages | Feature-specific with unique ID |
| `/monitoring` | SystemMonitoring | System metrics |
| `/validator` | TransformValidator | Data transformation testing |
| `/auto-config-deployment` | AutoConfigDeployment | Config deployment tool |

#### 3.1.2 State Management

```
┌────────────────────────────────────────────────────────────┐
│                    UserContext                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ currentUser: { id, name, email, roles, permissions } │  │
│  │ hasAccess(pageId): boolean                           │  │
│  │ loading: boolean                                     │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│              Component-Level State                          │
│  - Task execution status                                    │
│  - Form inputs                                              │
│  - UI toggles                                               │
└────────────────────────────────────────────────────────────┘
```

### 3.2 Backend Architecture

```
api/
├── main_v2.py                # FastAPI app entry point
├── routers/                  # API route handlers
│   ├── system.py            # Health, stats
│   ├── etl.py               # ETL step execution
│   ├── controls.py          # Legacy control tasks
│   ├── control_runs.py      # Airflow-style execution
│   ├── data.py              # Parquet/CSV operations
│   ├── monitoring.py        # System metrics
│   ├── workflows.py         # Workflow management
│   ├── users.py             # User management
│   ├── ai_assistant.py      # AI chat endpoints
│   ├── judgments.py         # Judgment analytics
│   ├── auto_config.py       # Auto-config deployment
│   ├── websocket.py         # Real-time updates
│   ├── models.py            # Pydantic models
│   └── utils.py             # Shared utilities
├── control_execution/        # Task execution system
│   ├── control_runner.py    # Main orchestrator
│   ├── subprocess_manager.py # Process management
│   ├── task_persistence.py  # File-based state
│   ├── log_manager.py       # Log handling
│   └── status_monitor.py    # Background monitoring
├── transform_operations/     # DataFrame transformations
├── parquet_service.py       # High-performance data access
├── judgment_service.py      # LLM judgment storage
├── task_storage/            # Runtime state files
├── workflow_storage/        # Workflow definitions
└── judgment_storage/        # Judgment records
```

#### 3.2.1 Router Summary

| Router | Prefix | Purpose |
|--------|--------|---------|
| system | `/` | Health checks, system stats |
| etl | `/` | ETL step execution |
| controls | `/api/controls` | Legacy control tasks |
| control_runs | `/api/control-runs` | Airflow-style execution |
| data | `/data` | Parquet/CSV operations |
| monitoring | `/monitoring` | System metrics |
| workflows | `/api/workflows` | Workflow CRUD |
| users | `/api/users` | User management |
| ai_assistant | `/api/ai` | AI chat, LLM judge |
| judgments | `/api/judgments` | Judgment analytics |
| websocket | `/ws` | Real-time updates |

---

## 4. Component Specifications

### 4.1 Control Execution System

#### 4.1.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                 Control Execution System                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐      ┌─────────────────┐              │
│  │ ControlRunner   │──────│ TaskPersistence │              │
│  │                 │      │                 │              │
│  │ - start_task()  │      │ - save_task()   │              │
│  │ - stop_task()   │      │ - load_task()   │              │
│  │ - get_status()  │      │ - update_task() │              │
│  └────────┬────────┘      └────────┬────────┘              │
│           │                        │                        │
│           ▼                        ▼                        │
│  ┌─────────────────┐      ┌─────────────────┐              │
│  │ SubprocessMgr   │      │ task_storage/   │              │
│  │                 │      │                 │              │
│  │ - spawn()       │      │ control_tasks/  │              │
│  │ - terminate()   │      │ control_logs/   │              │
│  │ - get_output()  │      │                 │              │
│  └────────┬────────┘      └─────────────────┘              │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────┐      ┌─────────────────┐              │
│  │ External Python │      │ StatusMonitor   │              │
│  │ Subprocess      │◄─────│                 │              │
│  │                 │      │ - check_status()│              │
│  │ generic_        │      │ - broadcast()   │              │
│  │ controller.py   │      │                 │              │
│  └─────────────────┘      └─────────────────┘              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 4.1.2 Task State Machine

```
                    ┌─────────┐
                    │ PENDING │
                    └────┬────┘
                         │ start_task()
                         ▼
                    ┌─────────┐
         ┌─────────│ RUNNING │─────────┐
         │         └────┬────┘         │
         │              │              │
    stop_task()    complete()     error()
         │              │              │
         ▼              ▼              ▼
    ┌─────────┐   ┌──────────┐   ┌────────┐
    │ STOPPED │   │ COMPLETED│   │ FAILED │
    └─────────┘   └──────────┘   └────────┘
```

#### 4.1.3 Task State File Schema

```json
{
  "task_id": "string (UUID)",
  "control_id": "string",
  "control_name": "string",
  "status": "pending|running|completed|failed|stopped",
  "run_env": "PROD|UAT|DEV",
  "expected_run_date": "YYYY-MM-DD",
  "created_at": "ISO8601",
  "started_at": "ISO8601|null",
  "completed_at": "ISO8601|null",
  "subprocess_pid": "integer|null",
  "error": "string|null",
  "output": "object|null"
}
```

### 4.2 Parquet Service

#### 4.2.1 Design

```
┌─────────────────────────────────────────────────────────────┐
│                    ParquetService                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  Polars Engine                       │    │
│  │                                                      │    │
│  │  scan_parquet() ─────► LazyFrame (no memory load)   │    │
│  │        │                                             │    │
│  │        ▼                                             │    │
│  │  select/filter ──────► Still lazy                   │    │
│  │        │                                             │    │
│  │        ▼                                             │    │
│  │  collect() ──────────► DataFrame (only needed data) │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Methods:                                                    │
│  ├── get_file_metadata(path) → schema, row_count, columns   │
│  ├── read_parquet_paginated(path, page, size) → records     │
│  ├── get_column_statistics(path, col) → stats               │
│  └── validate_file_path(path) → boolean                     │
│                                                              │
│  Features:                                                   │
│  ├── Metadata caching (5-minute TTL)                        │
│  ├── Pagination support                                     │
│  └── Cross-platform path handling                           │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Transform Operations

| Operation | Description | Example |
|-----------|-------------|---------|
| SetValue | Set constant value | `{ "field": "status", "value": "active" }` |
| CopyField | Copy column values | `{ "source": "name", "target": "display_name" }` |
| MapValues | Dictionary mapping | `{ "field": "code", "map": {"A": "Active"} }` |
| Formula | Math expressions | `{ "formula": "A * 0.1", "inputs": {"A": "salary"} }` |
| Concatenate | Join columns | `{ "fields": ["first", "last"], "sep": " " }` |
| Split | Split strings | `{ "field": "name", "delimiter": "," }` |
| Replace | Find/replace | `{ "field": "text", "find": "old", "replace": "new" }` |
| Conditional | If/then logic | `{ "if": "A > 100", "then": "high", "else": "low" }` |
| DateExtract | Extract date parts | `{ "field": "date", "extract": "year" }` |
| NumericOp | Aggregations | `{ "fields": ["a", "b"], "op": "sum" }` |
| StringOp | String functions | `{ "field": "name", "op": "upper" }` |

### 4.4 WebSocket Service

#### 4.4.1 Connection Management

```
┌─────────────────────────────────────────────────────────────┐
│                  WebSocket Manager                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Connection Limits:                                          │
│  ├── Max connections: 50 (30 users + buffer)                │
│  ├── Max per IP: 10                                         │
│  └── Heartbeat: 30 seconds                                  │
│                                                              │
│  Message Types:                                              │
│  ├── connected    - Connection established                  │
│  ├── task_update  - Single task status change               │
│  ├── runs_update  - Multiple runs updated                   │
│  ├── ping/pong    - Heartbeat                               │
│  └── error        - Error notification                      │
│                                                              │
│  Subscription Model:                                         │
│  ┌─────────┐      ┌─────────────────┐      ┌─────────┐     │
│  │ Client  │─────►│ subscribe(task) │─────►│ Updates │     │
│  └─────────┘      └─────────────────┘      └─────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Data Flow Diagrams

### 5.1 Control Run Execution Flow

```
┌──────────┐                                              ┌──────────┐
│  Client  │                                              │  Server  │
└────┬─────┘                                              └────┬─────┘
     │                                                         │
     │  POST /api/control-runs/start                          │
     │  { control_id, run_env, expected_run_date }            │
     │────────────────────────────────────────────────────────►│
     │                                                         │
     │                              ┌──────────────────────────┤
     │                              │ 1. Validate control_id   │
     │                              │ 2. Generate task_id      │
     │                              │ 3. Persist initial state │
     │                              │ 4. Spawn subprocess      │
     │                              └──────────────────────────┤
     │                                                         │
     │  { task_id, status: "running" }                        │
     │◄────────────────────────────────────────────────────────│
     │                                                         │
     │  WebSocket: subscribe(task_id)                         │
     │════════════════════════════════════════════════════════►│
     │                                                         │
     │                              ┌──────────────────────────┤
     │                              │ Background:              │
     │                              │ - Monitor subprocess     │
     │                              │ - Capture stdout/stderr  │
     │                              │ - Update task state      │
     │                              └──────────────────────────┤
     │                                                         │
     │  WebSocket: { type: "task_update", status: "running" } │
     │◄════════════════════════════════════════════════════════│
     │                                                         │
     │  GET /api/control-runs/{task_id}/logs                  │
     │────────────────────────────────────────────────────────►│
     │                                                         │
     │  { logs: [...], line_count }                           │
     │◄────────────────────────────────────────────────────────│
     │                                                         │
     │  WebSocket: { type: "task_update", status: "completed" }│
     │◄════════════════════════════════════════════════════════│
     │                                                         │
```

### 5.2 ETL Step Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ETL Step Execution                               │
└─────────────────────────────────────────────────────────────────────────┘

    Step 1              Step 2              Step 3              Step N
  ┌─────────┐         ┌─────────┐         ┌─────────┐         ┌─────────┐
  │ Read    │────────►│ Filter  │────────►│Transform│────────►│ Output  │
  │ Config  │         │ Data    │         │ Data    │         │ Results │
  └────┬────┘         └────┬────┘         └────┬────┘         └────┬────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
  ┌─────────┐         ┌─────────┐         ┌─────────┐         ┌─────────┐
  │ Output  │         │ Output  │         │ Output  │         │ Output  │
  │ JSON    │         │ JSON    │         │ JSON    │         │ JSON    │
  └────┬────┘         └────┬────┘         └────┬────┘         └─────────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ previous_outputs│
                  │ (passed to next │
                  │  step)          │
                  └─────────────────┘
```

### 5.3 Workflow Builder Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Visual Workflow Builder                            │
└─────────────────────────────────────────────────────────────────────────┘

  ┌───────────────────────────────────────────────────────────────────────┐
  │                         ReactFlow Canvas                               │
  │                                                                        │
  │   ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐ │
  │   │  Read    │─────►│  Filter  │─────►│   Join   │─────►│  Output  │ │
  │   │  CSV     │      │   Data   │      │   Data   │      │  Parquet │ │
  │   └──────────┘      └──────────┘      └──────────┘      └──────────┘ │
  │                                                                        │
  └────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼ Save
                          ┌─────────────────┐
                          │ workflow_storage│
                          │ /{id}.json      │
                          └────────┬────────┘
                                   │
                                   ▼ Execute
                          ┌─────────────────┐
                          │ Sequential ETL  │
                          │ Step Execution  │
                          └─────────────────┘
```

### 5.4 Authentication Flow

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│  Client  │         │  Server  │         │  Storage │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                    │
     │  App Load          │                    │
     │────────────────────►                    │
     │                    │                    │
     │  GET /api/users/me │                    │
     │  Header: Bearer    │                    │
     │  {user_key}        │                    │
     │────────────────────►                    │
     │                    │                    │
     │                    │  Load user data    │
     │                    │───────────────────►│
     │                    │                    │
     │                    │  { user, perms }   │
     │                    │◄───────────────────│
     │                    │                    │
     │  { id, name,       │                    │
     │    permissions }   │                    │
     │◄────────────────────                    │
     │                    │                    │
     │  UserContext       │                    │
     │  hasAccess(pageId) │                    │
     │                    │                    │
```

---

## 6. Security Design

### 6.1 Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Security Layers                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Layer 1: Network                              │    │
│  │  - HTTPS/TLS encryption (production)                            │    │
│  │  - CORS policy enforcement                                      │    │
│  │  - Rate limiting (WebSocket: 10 conn/IP)                        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Layer 2: Authentication                       │    │
│  │  - Bearer token validation                                      │    │
│  │  - User session management                                      │    │
│  │  - Token-based API access                                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Layer 3: Authorization                        │    │
│  │  - Role-based access control (RBAC)                             │    │
│  │  - Permission-based feature gating                              │    │
│  │  - Wildcard (*) for admin access                                │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Layer 4: Data Validation                      │    │
│  │  - Pydantic model validation                                    │    │
│  │  - Path traversal prevention                                    │    │
│  │  - Input sanitization                                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Layer 5: Storage Security                     │    │
│  │  - File-based storage with OS permissions                       │    │
│  │  - No database attack surface                                   │    │
│  │  - 7-day log retention                                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 CORS Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| `allow_origins` | `["*"]` | **PRODUCTION: Restrict to known domains** |
| `allow_methods` | `["GET", "POST", "PUT", "DELETE", "OPTIONS"]` | Standard HTTP methods |
| `allow_headers` | `["*"]` | All headers allowed |
| `allow_credentials` | `true` | Cookie support enabled |
| `max_age` | `3600` | Preflight cache 1 hour |

### 6.3 Role-Based Access Control

| Role | Permissions | Description |
|------|-------------|-------------|
| `admin` | `["*"]` | Full system access |
| `analyst` | `["control-run", "workflow", "monitoring", "validator"]` | Analysis capabilities |
| `viewer` | `["monitoring", "control-status"]` | Read-only access |
| `operator` | `["control-run", "workflow", "control-status"]` | Operations access |
| `data_engineer` | `["auto-config-deployment", "workflow", "validator"]` | Data engineering |

### 6.4 Security Controls

| Control | Implementation | Status |
|---------|----------------|--------|
| Input validation | Pydantic models | Implemented |
| Path traversal prevention | Path normalization | Implemented |
| XSS prevention | rehype-sanitize | Implemented |
| CSRF protection | SameSite cookies | Partial |
| Rate limiting | WebSocket per-IP limit | Implemented |
| Audit logging | Log manager | Implemented |
| Secret management | Environment variables | Implemented |

### 6.5 Data Protection

| Data Type | Protection | Retention |
|-----------|------------|-----------|
| Task state | File permissions | Session |
| Execution logs | File permissions | 7 days |
| Workflow definitions | File permissions | Permanent |
| Judgment records | File permissions | 30 days |
| User data | Memory only | Session |

---

## 7. API Specifications

### 7.1 Control Runs API

#### Start Control Run
```
POST /api/control-runs/start
Content-Type: application/json

Request:
{
  "control_id": "string",        // Required
  "task_name": "string",         // Optional
  "run_env": "PROD|UAT|DEV",     // Required
  "expected_run_date": "YYYY-MM-DD"  // Required
}

Response: 200 OK
{
  "task_id": "uuid",
  "status": "pending|running",
  "message": "string"
}
```

#### Get Control Run Status
```
GET /api/control-runs/{task_id}/status

Response: 200 OK
{
  "task_id": "uuid",
  "status": "pending|running|completed|failed|stopped",
  "control_id": "string",
  "control_name": "string",
  "run_env": "string",
  "expected_run_date": "YYYY-MM-DD",
  "created_at": "ISO8601",
  "started_at": "ISO8601|null",
  "completed_at": "ISO8601|null",
  "error": "string|null"
}
```

#### Get Control Run Logs
```
GET /api/control-runs/{task_id}/logs?log_type=execution&lines=100

Response: 200 OK
{
  "logs": ["string"],
  "log_type": "execution|subprocess|error",
  "line_count": 100
}
```

### 7.2 ETL API

#### Execute ETL Step
```
POST /run/{step_name}
Content-Type: application/json

Request:
{
  "parameters": {
    "expectedRunDate": "YYYY-MM-DD",
    "inputConfigFilePath": "string",
    "rootFileDir": "string",
    "runEnv": "string",
    "tempFilePath": "string"
  },
  "previous_outputs": {
    "step_name": {
      "status": "success",
      "output": {}
    }
  }
}

Response: 200 OK
{
  "task_id": "uuid",
  "status": "pending",
  "step_name": "string"
}
```

### 7.3 Data API

#### Get Paginated Records
```
GET /data/records?file_path=/path/to/file.parquet&page=1&page_size=100

Response: 200 OK
{
  "records": [...],
  "total_rows": 10000,
  "page": 1,
  "page_size": 100,
  "total_pages": 100
}
```

#### Get Column Statistics
```
GET /data/column-stats?file_path=/path/to/file.parquet&column_name=amount

Response: 200 OK
{
  "column_name": "amount",
  "dtype": "float64",
  "count": 10000,
  "null_count": 50,
  "min": 0.0,
  "max": 999999.99,
  "mean": 50000.00,
  "std": 25000.00
}
```

### 7.4 WebSocket Protocol

#### Connection
```
WebSocket /ws

Client → Server (Subscribe):
{
  "type": "subscribe",
  "task_id": "uuid"
}

Server → Client (Task Update):
{
  "type": "task_update",
  "task_id": "uuid",
  "status": "running|completed|failed",
  "timestamp": "ISO8601"
}

Server → Client (Heartbeat):
{
  "type": "ping",
  "timestamp": "ISO8601"
}

Client → Server (Heartbeat Response):
{
  "type": "pong"
}
```

---

## 8. Technology Stack

### 8.1 Frontend Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| react | 19.2.3 | UI framework |
| react-dom | 19.2.3 | DOM rendering |
| react-router-dom | 6.11.2 | Client routing |
| ag-grid-react | 35.0.0 | Data grid |
| recharts | 3.2.1 | Charts |
| reactflow | 11.7.4 | Workflow diagrams |
| tailwindcss | 3.3.2 | CSS framework |
| zustand | 4.3.8 | State management |
| react-markdown | 10.1.0 | Markdown rendering |
| date-fns | 4.1.0 | Date utilities |

### 8.2 Backend Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| fastapi | 0.104.1 | Web framework |
| uvicorn | 0.24.0 | ASGI server |
| gunicorn | >=21.2.0 | WSGI server |
| pydantic | 2.5.0 | Data validation |
| polars | >=0.20.0 | Data processing |
| pyarrow | >=15.0.0 | Parquet support |
| pandas | 2.1.4 | Legacy data ops |
| APScheduler | 3.10.4 | Task scheduling |
| openai | >=1.0.0 | AI integration |

### 8.3 Runtime Requirements

| Component | Requirement |
|-----------|-------------|
| Python | 3.13+ |
| Node.js | 18+ |
| OS | Windows/Linux |

---

## 9. Deployment Architecture

### 9.1 Development Environment

```
┌─────────────────────────────────────────────────────────────┐
│                    Development Setup                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Terminal 1:                Terminal 2:                    │
│   ┌─────────────────┐        ┌─────────────────┐           │
│   │ npm start       │        │ python main_v2.py│           │
│   │ (Port 3000)     │        │ (Port 8000)     │           │
│   └─────────────────┘        └─────────────────┘           │
│                                                              │
│   Browser ───────────► localhost:3000 ───────► localhost:8000│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Production Environment

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Production Deployment                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────┐                                                   │
│   │   Load Balancer │                                                   │
│   │   (HTTPS/TLS)   │                                                   │
│   └────────┬────────┘                                                   │
│            │                                                             │
│   ┌────────┴────────┐                                                   │
│   │                 │                                                    │
│   ▼                 ▼                                                    │
│ ┌─────────────┐  ┌─────────────────────────────────────────────────┐   │
│ │   Nginx     │  │              Gunicorn (4 workers)               │   │
│ │  (Static)   │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────┐ │   │
│ │             │  │  │Worker 1 │ │Worker 2 │ │Worker 3 │ │Worker4│ │   │
│ │ /build/*    │  │  └────┬────┘ └────┬────┘ └────┬────┘ └───┬───┘ │   │
│ └─────────────┘  └───────┼──────────┼──────────┼─────────┼──────┘   │
│                          │          │          │         │           │
│                          └──────────┴──────────┴─────────┘           │
│                                      │                                │
│                          ┌───────────┴───────────┐                   │
│                          │    File Storage       │                   │
│                          │  ┌─────────────────┐  │                   │
│                          │  │  task_storage/  │  │                   │
│                          │  │  workflow_storage│  │                   │
│                          │  │  judgment_storage│  │                   │
│                          │  └─────────────────┘  │                   │
│                          └───────────────────────┘                   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 9.3 Deployment Commands

```bash
# Frontend Build
npm run build

# Backend Start (Development)
cd api && python main_v2.py

# Backend Start (Production)
cd api && gunicorn -w 4 -b 0.0.0.0:8000 main_v2:app
```

### 9.4 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JUDGMENT_ENABLED` | Enable LLM judging | `true` |
| `JUDGMENT_MODEL` | OpenAI model | `gpt-4o-mini` |
| `JUDGMENT_RETENTION_DAYS` | Cleanup policy | `30` |
| `OPENAI_API_KEY` | OpenAI API key | Required |

---

## 10. Appendices

### 10.1 Glossary

| Term | Definition |
|------|------------|
| Control Run | Airflow-style task execution unit |
| ETL | Extract, Transform, Load data pipeline |
| Instance | Independent feature session with unique ID |
| Parquet | Columnar data storage format |
| Polars | High-performance DataFrame library |
| RBAC | Role-Based Access Control |

### 10.2 File Structure Reference

```
controldash/
├── src/                      # Frontend source
│   ├── App.js               # Routes & providers
│   ├── page.js              # Homepage
│   ├── instances/           # Tab-based features
│   ├── controls/            # Control implementations
│   ├── components/          # Shared components
│   ├── contexts/            # React contexts
│   └── services/            # API & WebSocket
├── api/                      # Backend source
│   ├── main_v2.py           # FastAPI entry
│   ├── routers/             # API routes
│   ├── control_execution/   # Task execution
│   ├── transform_operations/# Data transforms
│   ├── task_storage/        # Runtime state
│   ├── workflow_storage/    # Workflows
│   └── judgment_storage/    # Judgments
├── public/                   # Static assets
├── package.json             # Frontend deps
├── tailwind.config.js       # Tailwind config
```

### 10.3 API Endpoint Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Health check |
| GET | `/stats` | System stats |
| POST | `/api/control-runs/start` | Start control |
| GET | `/api/control-runs/{id}/status` | Get status |
| GET | `/api/control-runs/{id}/logs` | Get logs |
| POST | `/run/{step}` | Execute ETL step |
| GET | `/data/records` | Get data records |
| GET | `/data/column-stats` | Column statistics |
| POST | `/api/ai/chat` | AI chat |
| POST | `/api/ai/judge` | LLM judge |
| WS | `/ws` | Real-time updates |

### 10.4 Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Auth required |
| 403 | Forbidden - Access denied |
| 404 | Not Found - Resource missing |
| 422 | Validation Error - Pydantic |
| 500 | Internal Server Error |

---

**Document Control**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Jan 2026 | System | Initial version |

---

*End of Software Design Document*

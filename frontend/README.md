# AEGIS Frontend Application

Modern React 19 single-page application (SPA) providing real-time security telemetry, reactive vulnerability exploration, and collaborative API security posture management.

---

## Tech Stack

- **Framework:** React 19 (`react`, `react-dom`)
- **Build & Tooling:** Vite 6, TypeScript 5.8
- **Styling:** Tailwind CSS v4 (`@tailwindcss/vite`) + Aegis Cyber Intelligence theme (`src/index.css`)
- **Data Visualization:** Recharts (Latency telemetry, severity distributions)
- **Interactive Graph:** React Flow (`reactflow`, `@reactflow/core`, `@dagrejs/dagre`)
- **Routing:** React Router DOM v7
- **Authentication & Backend Sync:** Supabase JS Client (`@supabase/supabase-js`)
- **HTTP Client:** Axios (automatic auth headers, base URL `/api`)
- **Notifications:** React Hot Toast
- **Icons:** Lucide React
- **Linter & Test:** Oxlint, Vitest

---

## Directory Architecture

```
frontend/src/
├── __tests__/             # Unit and integration test suites
│   └── tokens.test.ts     # Design tokens and test verification
├── components/            # Domain-specific and shell UI components
│   ├── ui/                # Aegis Design System primitive components
│   │   ├── Badge.tsx      # Severity & status tags
│   │   ├── Button.tsx     # Cyan, ghost, danger, outline buttons
│   │   ├── Card.tsx       # Dark glassmorphism containers
│   │   ├── Feedback.tsx   # Inline banners and alerts
│   │   ├── Input.tsx      # Form text inputs & textareas
│   │   ├── Modal.tsx      # Backdrop modal dialogs
│   │   └── index.ts       # Barrel exports
│   ├── Layout.tsx         # Application shell with sidebar & navigation
│   ├── ProtectedRoute.tsx # Route guard for authenticated views
│   ├── ScoreCard.tsx      # 0–100 security score indicator
│   ├── TestResultCard.tsx # Collapsible security check accordion
│   ├── LatencyChart.tsx   # Recharts latency response line chart
│   ├── FindingsChart.tsx  # Recharts findings severity bar chart
│   ├── FlowDiagram.tsx    # React Flow behavior and stage graph
│   └── RequestInspector.tsx # Sanitized HTTP payload and header inspector
├── contexts/              # Global React Context providers
│   ├── AuthContext.tsx    # Supabase session & user lifecycle
│   └── WorkspaceContext.tsx # Team, multi-tenant workspace & role state
├── hooks/                 # Custom React hooks
│   └── useScan.ts         # Asynchronous scan creation & polling hook
├── lib/                   # External client instances
│   └── supabase.ts        # Supabase client singleton
├── pages/                 # Full-screen routed views
│   ├── LandingPage.tsx    # Public landing page with interactive terminal
│   ├── AuthPage.tsx       # Sign-in and sign-up interface
│   ├── AuthCallback.tsx   # OAuth redirect handler
│   ├── Dashboard.tsx      # Primary scanning console & quick launch
│   ├── ScanResults.tsx    # Detailed scan results, charts & flow
│   ├── ScanHistory.tsx    # Historical scan log & diff comparison
│   ├── TeamManagement.tsx # Team member invitations & role management
│   ├── SpecAnalyzer.tsx   # OpenAPI 3.0 file & URL specification parser
│   ├── OperationScan.tsx  # Granular endpoint probe wizard
│   └── Settings.tsx       # System health & API token configuration
├── services/              # API clients & cloud integrations
│   ├── api.ts             # Axios client communicating with FastAPI backend
│   ├── supabaseService.ts # Direct Supabase database and storage synchronization
│   └── workspaceService.ts # Multi-tenant team and member management
└── types/                 # Application-wide TypeScript interfaces
    └── index.ts           # Scan, Finding, Workspace, and Visualization types
```

---

## Local Development

```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Configure environment
cp .env.example .env

# 3. Start development server (proxying /api to http://localhost:8000)
npm run dev

# 4. Run tests
npm test

# 5. Type-check and production build
npm run build
```

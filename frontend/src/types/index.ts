// src/types/index.ts — All application-wide TypeScript types

export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational';
export type FindingStatus = 'pass' | 'fail' | 'warning' | 'inconclusive';
export type TestStatus = 'pass' | 'fail' | 'warning' | 'inconclusive';

export interface Scan {
  id: string;
  url: string;
  hostname: string;
  status: ScanStatus;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  assessment_score?: number;
  earned_points?: number;
  assessed_points?: number;
  assessment_coverage?: number;
  passed_checks: number;
  failed_checks: number;
  warning_checks: number;
  inconclusive_checks: number;
  highest_severity?: Severity;
  error_message?: string;
  result_json?: string;
  user_id?: string;
  user_email?: string;
  workspace_id?: string | null;
}

export interface Finding {
  id: string;
  scan_id: string;
  title: string;
  category: string;
  severity: Severity;
  confidence: string;
  status: FindingStatus;
  evidence?: string;
  description?: string;
  why_it_matters?: string;
  remediation?: string;
  rule_reference?: string;
  created_at: string;
}

export interface TestResult {
  name: string;
  status: TestStatus;
  earned_points: number;
  max_points: number;
  findings: Array<Record<string, unknown>>;
  evidence: Record<string, unknown>;
  recommendations: string[];
}

export interface ScoreResult {
  assessment_score?: number;
  earned_points: number;
  assessed_points: number;
  assessment_coverage: number;
  passed_checks: number;
  failed_checks: number;
  warning_checks: number;
  inconclusive_checks: number;
  highest_severity?: Severity;
  test_results: Record<string, TestResult>;
}

// Visualizations
export interface LatencyPoint {
  request_number: number;
  response_time_ms?: number;
  status_code?: number;
  timed_out: boolean;
  error?: string;
}

export interface LatencyStats {
  avg_ms?: number;
  min_ms?: number;
  max_ms?: number;
  failed_requests: number;
  samples: LatencyPoint[];
}

export interface FlowNodeData {
  url?: string;
  stage?: string;
  stage_status?: 'completed' | 'failed' | 'warning' | 'skipped' | 'inconclusive' | 'running';
  description?: string;
  status?: string;
  resolved_ip?: string;
  status_code?: number;
  redirect_count?: number;
  icon?: string;
  // Security check fields
  check_type?: string;
  check_label?: string;
  finding_count?: number;
  findings_fail?: number;
  findings_warning?: number;
  findings_pass?: number;
  earned_points?: number;
  max_points?: number;
  provider?: string;
  // Rich detail support
  detail_items?: string[];
  method?: string;
  content_type?: string;
  response_size_bytes?: number;
  duration_ms?: number;
  error?: string;
  reason?: string;
  destination?: string;
  [key: string]: unknown;
}

export interface FlowNode {
  id: string;
  type: string;
  label: string;
  data: FlowNodeData;
  position: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated: boolean;
  style: Record<string, unknown>;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FindingsBySeverity {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
}

export interface Visualizations {
  latency: LatencyStats;
  flow: FlowGraph;
  findings_by_severity: FindingsBySeverity;
}

// Scan history
export interface ScanSummary {
  id: string;
  url: string;
  hostname: string;
  status: ScanStatus;
  started_at: string;
  completed_at?: string;
  assessment_score?: number;
  assessment_coverage?: number;
  passed_checks: number;
  failed_checks: number;
  highest_severity?: Severity;
  user_id?: string;
  user_email?: string;
  workspace_id?: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  role?: 'owner' | 'admin' | 'member';
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id?: string | null;
  email: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'invited' | 'declined';
  invited_by?: string | null;
  joined_at?: string | null;
  created_at: string;
}

export interface WorkspaceInvitation extends WorkspaceMember {
  workspace_name?: string;
  workspace_description?: string | null;
  inviter_email?: string | null;
}

export interface WorkspaceMessage {
  id: string;
  workspace_id: string;
  sender_id: string;
  sender_email: string;
  sender_name?: string | null;
  content: string;
  created_at: string;
}

export interface WorkspaceTask {
  id: string;
  workspace_id: string;
  title: string;
  description?: string | null;
  status: 'todo' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assigned_to?: string | null;
  assigned_email?: string | null;
  created_by: string;
  due_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface HistoryResponse {
  scans: ScanSummary[];
  total: number;
  my_total?: number;
  workspace_total?: number;
}

// OpenAPI Spec
export interface EndpointInfo {
  path: string;
  method: string;
  summary?: string;
  description?: string;
  parameters: Array<Record<string, unknown>>;
  request_body?: Record<string, unknown>;
  responses: Record<string, unknown>;
  auth_schemes: string[];
  deprecated: boolean;
}

export interface SpecAnalysis {
  spec_id: string;
  title?: string;
  version?: string;
  base_url?: string;
  endpoints: EndpointInfo[];
  auth_schemes: string[];
  total_endpoints: number;
  deprecated_count: number;
}

// Comparison
export interface ComparisonFindingChange {
  title: string;
  category: string;
  status: 'new' | 'not_detected' | 'severity_changed' | 'unchanged';
  severity_before?: Severity;
  severity_after?: Severity;
}

export interface ComparisonResult {
  scan_a: ScanSummary;
  scan_b: ScanSummary;
  score_change?: number;
  coverage_change?: number;
  latency_change_ms?: number;
  finding_changes: ComparisonFindingChange[];
  note: string;
}

export interface HealthStatus {
  status: string;
  version: string;
  database: string;
  virustotal: string;
}

// ── Operation Scan ────────────────────────────────────────────────────────────

export interface OperationScanRequest {
  spec_id: string;
  path: string;
  method: string;
  base_url: string;
  path_params?: Record<string, string>;
  query_params?: Record<string, string>;
  request_body?: Record<string, unknown> | null;
  auth_header?: string | null;
  confirm_destructive?: boolean;
  notes?: string;
  workspace_id?: string | null;
}

/** Embedded in result_json when scan originated from the Spec Analyzer */
export interface OperationContext {
  from_spec: true;
  spec_id: string;
  spec_title?: string;
  spec_version?: string;
  path: string;
  method: string;
  resolved_path: string;
  summary?: string;
  description?: string;
  parameters: Array<Record<string, unknown>>;
  request_body_schema?: Record<string, unknown>;
  responses: Record<string, { description: string }>;
  auth_schemes: string[];
  deprecated: boolean;
  path_params_supplied: string[];
  query_params_supplied: string[];
  has_request_body: boolean;
  has_auth: boolean;
}


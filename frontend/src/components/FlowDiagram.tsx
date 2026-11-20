// src/components/FlowDiagram.tsx ? Professional API Behavior Flow with Dagre auto-layout

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import Dagre from '@dagrejs/dagre';
import type { FlowGraph, FlowNodeData } from '../types';
import {
  Network,
  Globe,
  ShieldCheck,
  Server,
  Lock,
  Send,
  Download,
  Search,
  Shield,
  Eye,
  Activity,
  GitMerge,
  Flag,
  XCircle,
  AlertTriangle,
  ArrowRightCircle,
  FileText,
  X,
  CheckCircle,
  Info,
  ChevronRight,
} from 'lucide-react';

interface Props {
  flow: FlowGraph;
}

/* --------------------------------- Icon Map ----------------------------------- */

const ICON_MAP: Record<string, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  globe: Globe,
  'shield-check': ShieldCheck,
  server: Server,
  lock: Lock,
  send: Send,
  download: Download,
  search: Search,
  shield: Shield,
  eye: Eye,
  activity: Activity,
  'git-merge': GitMerge,
  flag: Flag,
  'x-circle': XCircle,
  'alert-triangle': AlertTriangle,
  'arrow-right-circle': ArrowRightCircle,
  'file-text': FileText,
};

/* ------------------------------- Status Colors ------------------------------- */

const STATUS_CONFIG: Record<string, { border: string; bg: string; text: string; glow: string; badge: string; badgeText: string }> = {
  completed: {
    border: 'var(--aegis-safe-fg)',
    bg: 'var(--color-canvas)',
    text: 'var(--color-ink)',
    glow: 'transparent',
    badge: 'var(--aegis-safe-bg)',
    badgeText: 'var(--aegis-safe-fg)',
  },
  failed: {
    border: 'var(--aegis-critical-fg)',
    bg: 'var(--color-canvas)',
    text: 'var(--color-ink)',
    glow: 'transparent',
    badge: 'var(--aegis-critical-bg)',
    badgeText: 'var(--aegis-critical-fg)',
  },
  warning: {
    border: 'var(--aegis-medium-fg)',
    bg: 'var(--color-canvas)',
    text: 'var(--color-ink)',
    glow: 'transparent',
    badge: 'var(--aegis-medium-bg)',
    badgeText: 'var(--aegis-medium-fg)',
  },
  skipped: {
    border: 'var(--color-line-strong)',
    bg: 'var(--color-canvas)',
    text: 'var(--color-muted)',
    glow: 'transparent',
    badge: 'var(--color-elevated)',
    badgeText: 'var(--color-muted)',
  },
  inconclusive: {
    border: 'var(--color-line-strong)',
    bg: 'var(--color-canvas)',
    text: 'var(--color-muted)',
    glow: 'transparent',
    badge: 'var(--color-elevated)',
    badgeText: 'var(--color-muted)',
  },
  running: {
    border: 'var(--aegis-info-fg)',
    bg: 'var(--color-canvas)',
    text: 'var(--color-ink)',
    glow: 'transparent',
    badge: 'var(--aegis-info-bg)',
    badgeText: 'var(--aegis-info-fg)',
  },
};

const DEFAULT_STATUS = STATUS_CONFIG.completed;

function getStatusConfig(status?: string) {
  return STATUS_CONFIG[status || 'completed'] || DEFAULT_STATUS;
}

/* ----------------------------- Status Badge ------------------------------- */

function StatusDot({ status }: { status?: string }) {
  const config = getStatusConfig(status);
  const label = status === 'completed' ? 'Passed' : status === 'failed' ? 'Failed' : status === 'warning' ? 'Warning' : status === 'skipped' ? 'Skipped' : status === 'inconclusive' ? 'Inconclusive' : status === 'running' ? 'Running' : 'Done';
  return (
    <span
      className="aegis-flow-status-badge"
      style={{ background: config.badge, color: config.badgeText, borderColor: config.border }}
    >
      <span className="aegis-flow-status-dot" style={{ background: config.border }} />
      {label}
    </span>
  );
}

/* ------------------------ Lifecycle Stage Node ---------------------------- */

function StageNode({ data }: NodeProps) {
  const stageStatus = (data.stage_status as string) || 'completed';
  const config = getStatusConfig(stageStatus);
  const IconComp = ICON_MAP[(data.icon as string) || 'globe'] || Globe;
  const label = data.label as string || '';
  const description = data.description as string || '';
  const findingCount = data.finding_count as number | undefined;
  const statusCode = data.status_code as number | undefined;

  return (
    <div
      className="aegis-flow-node"
      style={{
        borderColor: config.border,
        background: config.bg,
        boxShadow: `0 0 16px ${config.glow}`,
      }}
    >
      <Handle type="target" position={Position.Left} className="aegis-flow-handle" style={{ background: config.border }} />
      <div className="aegis-flow-node-header">
        <div className="aegis-flow-node-icon" style={{ background: config.badge, borderColor: config.border }}>
          <IconComp className="w-3.5 h-3.5" style={{ color: config.badgeText }} />
        </div>
        <div className="aegis-flow-node-title-group">
          <span className="aegis-flow-node-title" style={{ color: config.text }}>{label}</span>
          <StatusDot status={stageStatus} />
        </div>
      </div>
      {description && (
        <p className="aegis-flow-node-desc">{description}</p>
      )}
      <div className="aegis-flow-node-meta">
        {statusCode !== undefined && statusCode !== null && (
          <span className="aegis-flow-node-tag" style={{ color: typeof statusCode === 'number' && statusCode < 400 ? 'var(--aegis-safe-fg)' : 'var(--aegis-medium-fg)' }}>
            HTTP {statusCode}
          </span>
        )}
        {findingCount !== undefined && findingCount > 0 && (
          <span className="aegis-flow-node-tag" style={{ color: 'var(--aegis-critical-fg)' }}>
            {findingCount} finding{findingCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="aegis-flow-handle" style={{ background: config.border }} />
    </div>
  );
}

/* ------------------------ Security Check Node ---------------------------- */

function SecurityCheckNode({ data }: NodeProps) {
  const stageStatus = (data.stage_status as string) || 'completed';
  const config = getStatusConfig(stageStatus);
  const IconComp = ICON_MAP[(data.icon as string) || 'shield'] || Shield;
  const label = data.label as string || '';
  const checkLabel = (data.check_label as string) || '';
  const failCount = (data.findings_fail as number) || 0;
  const warnCount = (data.findings_warning as number) || 0;
  const passCount = (data.findings_pass as number) || 0;
  const earned = data.earned_points as number | undefined;
  const max = data.max_points as number | undefined;

  return (
    <div
      className="aegis-flow-node aegis-flow-security-node"
      style={{
        borderColor: config.border,
        background: config.bg,
        boxShadow: `0 0 16px ${config.glow}`,
      }}
    >
      <Handle type="target" position={Position.Left} className="aegis-flow-handle" style={{ background: config.border }} />
      <div className="aegis-flow-node-header">
        <div className="aegis-flow-node-icon" style={{ background: config.badge, borderColor: config.border }}>
          <IconComp className="w-3.5 h-3.5" style={{ color: config.badgeText }} />
        </div>
        <div className="aegis-flow-node-title-group">
          <span className="aegis-flow-node-title" style={{ color: config.text }}>{label}</span>
          <StatusDot status={stageStatus} />
        </div>
      </div>
      {/* Score bar */}
      {earned !== undefined && max !== undefined && max > 0 && (
        <div className="aegis-flow-score-bar">
          <div className="aegis-flow-score-track">
            <div
              className="aegis-flow-score-fill"
              style={{
                width: `${Math.min(100, (earned / max) * 100)}%`,
                background: config.border,
              }}
            />
          </div>
          <span className="aegis-flow-score-label" style={{ color: config.text }}>
            {earned}/{max} pts
          </span>
        </div>
      )}
      {/* Finding counts */}
      <div className="aegis-flow-check-counts">
        {passCount > 0 && (
          <span className="aegis-flow-check-pill" style={{ color: 'var(--aegis-safe-fg)', background: 'var(--aegis-safe-bg)' }}>
            <CheckCircle className="w-2.5 h-2.5" /> {passCount}
          </span>
        )}
        {warnCount > 0 && (
          <span className="aegis-flow-check-pill" style={{ color: 'var(--aegis-medium-fg)', background: 'var(--aegis-medium-bg)' }}>
            <AlertTriangle className="w-2.5 h-2.5" /> {warnCount}
          </span>
        )}
        {failCount > 0 && (
          <span className="aegis-flow-check-pill" style={{ color: 'var(--aegis-critical-fg)', background: 'var(--aegis-critical-bg)' }}>
            <XCircle className="w-2.5 h-2.5" /> {failCount}
          </span>
        )}
        {passCount === 0 && warnCount === 0 && failCount === 0 && checkLabel && (
          <span className="aegis-flow-check-pill" style={{ color: config.text, background: config.badge }}>
            {checkLabel}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="aegis-flow-handle" style={{ background: config.border }} />
    </div>
  );
}

/* -------------------------- Register Node Types -------------------------- */

const nodeTypes: Record<string, React.ComponentType<NodeProps>> = {
  input: StageNode,
  validation: StageNode,
  dns: StageNode,
  tls_handshake: StageNode,
  request: StageNode,
  redirect: StageNode,
  response: StageNode,
  analysis_hub: StageNode,
  security_check: SecurityCheckNode,
  correlation: StageNode,
  final: StageNode,
  blocked: StageNode,
  error: StageNode,
  result: StageNode,
};

/* --------------------------- Dagre Layout --------------------------------- */

const NODE_WIDTH = 210;
const NODE_HEIGHT_STAGE = 100;
const NODE_HEIGHT_SECURITY = 130;

function getLayoutedElements(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',
    nodesep: 40,
    ranksep: 80,
    edgesep: 20,
    marginx: 30,
    marginy: 30,
  });

  nodes.forEach((node) => {
    const height = node.type === 'security_check' ? NODE_HEIGHT_SECURITY : NODE_HEIGHT_STAGE;
    g.setNode(node.id, { width: NODE_WIDTH, height });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  Dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const dagreNode = g.node(node.id);
    const height = node.type === 'security_check' ? NODE_HEIGHT_SECURITY : NODE_HEIGHT_STAGE;
    return {
      ...node,
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - height / 2,
      },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    };
  });

  return { nodes: layoutedNodes, edges };
}

/* --------------------------- Detail Drawer -------------------------------- */

interface DrawerProps {
  node: FlowGraph['nodes'][0] | null;
  onClose: () => void;
}

function DetailDrawer({ node, onClose }: DrawerProps) {
  if (!node) return null;
  const data = node.data as FlowNodeData;
  const config = getStatusConfig(data.stage_status);
  const IconComp = ICON_MAP[(data.icon as string) || 'info'] || Info;

  return (
    <div className="aegis-flow-drawer-overlay" onClick={onClose}>
      <div className="aegis-flow-drawer" role="dialog" aria-modal="true" aria-label={`${node.label} flow details`} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="aegis-flow-drawer-header" style={{ borderBottomColor: config.border }}>
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-[6px]"
              style={{ background: config.badge, border: `1px solid ${config.border}` }}
            >
              <IconComp className="h-4 w-4" style={{ color: config.badgeText }} />
            </div>
            <div>
              <h3 className="text-[13.5px] font-semibold text-ink">{node.label}</h3>
              <StatusDot status={data.stage_status} />
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close flow details" className="flex h-11 w-11 items-center justify-center rounded-[6px] text-muted transition-colors hover:bg-elevated hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="aegis-flow-drawer-body">
          {/* Description */}
          {data.description && (
            <div className="aegis-flow-drawer-section">
              <h4 className="aegis-flow-drawer-section-title">What Happened</h4>
              <p className="text-xs text-muted leading-relaxed">{data.description}</p>
            </div>
          )}

          {/* Error/Reason */}
          {(data.error || data.reason) && (
            <div className="aegis-flow-drawer-section" style={{ background: 'var(--aegis-critical-bg)', borderColor: 'var(--aegis-critical-fg)' }}>
              <h4 className="aegis-flow-drawer-section-title" style={{ color: 'var(--aegis-critical-fg)' }}>
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                Error Details
              </h4>
              <p className="font-mono text-sm leading-relaxed text-critical">{data.error || data.reason}</p>
            </div>
          )}

          {/* Technical Details */}
          <div className="aegis-flow-drawer-section">
            <h4 className="aegis-flow-drawer-section-title">Details</h4>
            <div className="space-y-1.5">
              {data.stage && (
                <div className="aegis-flow-drawer-detail-row">
                  <span className="text-faint">Stage</span>
                  <span className="text-ink font-mono">{data.stage}</span>
                </div>
              )}
              {data.resolved_ip && (
                <div className="aegis-flow-drawer-detail-row">
                  <span className="text-faint">Resolved IP</span>
                  <span className="text-forest font-mono">{data.resolved_ip}</span>
                </div>
              )}
              {data.method && (
                <div className="aegis-flow-drawer-detail-row">
                  <span className="text-faint">HTTP Method</span>
                  <span className="text-ink font-mono">{data.method}</span>
                </div>
              )}
              {data.status_code !== undefined && data.status_code !== null && (
                <div className="aegis-flow-drawer-detail-row">
                  <span className="text-faint">Status Code</span>
                  <span className={`font-mono font-bold ${typeof data.status_code === 'number' && data.status_code < 400 ? 'text-safe' : 'text-high'}`}>
                    {data.status_code}
                  </span>
                </div>
              )}
              {data.content_type && (
                <div className="aegis-flow-drawer-detail-row">
                  <span className="text-faint">Content-Type</span>
                  <span className="text-ink font-mono text-[10px]">{data.content_type}</span>
                </div>
              )}
              {data.response_size_bytes !== undefined && (
                <div className="aegis-flow-drawer-detail-row">
                  <span className="text-faint">Response Size</span>
                  <span className="text-ink font-mono">{(data.response_size_bytes / 1024).toFixed(1)} KB</span>
                </div>
              )}
              {data.redirect_count !== undefined && data.redirect_count > 0 && (
                <div className="aegis-flow-drawer-detail-row">
                  <span className="text-faint">Redirects</span>
                  <span className="text-high font-mono">{data.redirect_count} hop{data.redirect_count !== 1 ? 's' : ''}</span>
                </div>
              )}
              {data.duration_ms !== undefined && (
                <div className="aegis-flow-drawer-detail-row">
                  <span className="text-faint">Duration</span>
                  <span className="text-ink font-mono">{data.duration_ms.toFixed(0)}ms</span>
                </div>
              )}
              {data.provider && (
                <div className="aegis-flow-drawer-detail-row">
                  <span className="text-faint">Provider</span>
                  <span className="text-muted font-mono">{data.provider}</span>
                </div>
              )}
              {data.destination && (
                <div className="aegis-flow-drawer-detail-row">
                  <span className="text-faint">Destination</span>
                  <span className="break-all font-mono text-xs text-high">{data.destination}</span>
                </div>
              )}
            </div>
          </div>

          {/* Score (security checks) */}
          {data.earned_points !== undefined && data.max_points !== undefined && data.max_points > 0 && (
            <div className="aegis-flow-drawer-section">
              <h4 className="aegis-flow-drawer-section-title">Security Score</h4>
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-[4px] bg-elevated">
                  <div
                    className="h-full rounded-[4px] transition-all"
                    style={{
                      width: `${Math.min(100, (data.earned_points / data.max_points) * 100)}%`,
                      background: config.border,
                    }}
                  />
                </div>
                <span className="text-xs font-bold font-mono" style={{ color: config.text }}>
                  {data.earned_points}/{data.max_points}
                </span>
              </div>
            </div>
          )}

          {/* Finding counts */}
          {(data.findings_fail || data.findings_warning || data.findings_pass) && (
            <div className="aegis-flow-drawer-section">
              <h4 className="aegis-flow-drawer-section-title">Findings Breakdown</h4>
              <div className="flex items-center gap-2 flex-wrap">
                {(data.findings_pass ?? 0) > 0 && (
                  <span className="flex items-center gap-1 rounded-[6px] border border-safe/25 bg-forest/8 px-2 py-1 text-[11px] text-safe">
                    <CheckCircle className="w-3 h-3" /> {data.findings_pass} passed
                  </span>
                )}
                {(data.findings_warning ?? 0) > 0 && (
                  <span className="flex items-center gap-1 rounded-[6px] border border-high/25 bg-high/10 px-2 py-1 text-[11px] text-high">
                    <AlertTriangle className="w-3 h-3" /> {data.findings_warning} warning{data.findings_warning !== 1 ? 's' : ''}
                  </span>
                )}
                {(data.findings_fail ?? 0) > 0 && (
                  <span className="flex items-center gap-1 rounded-[6px] border border-critical/25 bg-critical/10 px-2 py-1 text-[11px] text-critical">
                    <XCircle className="w-3 h-3" /> {data.findings_fail} failed
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Detail items */}
          {data.detail_items && data.detail_items.length > 0 && (
            <div className="aegis-flow-drawer-section">
              <h4 className="aegis-flow-drawer-section-title">Additional Information</h4>
              <ul className="space-y-1">
                {data.detail_items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted">
                    <ChevronRight className="w-3 h-3 mt-0.5 text-faint flex-shrink-0" />
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------- Edge Defaults --------------------------------- */

const DEFAULT_EDGE_STYLE = {
  stroke: 'var(--color-line-strong)',
  strokeWidth: 1.5,
};

/* --------------------------- Inner Flow ----------------------------------- */

function FlowDiagramInner({ flow }: Props) {
  const [selectedNode, setSelectedNode] = useState<FlowGraph['nodes'][0] | null>(null);
  const { fitView } = useReactFlow();

  // Convert backend nodes/edges to React Flow format and apply Dagre layout
  const { layoutedNodes, layoutedEdges } = useMemo(() => {
    const rfNodes: Node[] = flow.nodes.map((n) => ({
      id: n.id,
      type: n.type in nodeTypes ? n.type : 'result',
      position: n.position,
      data: { ...n.data, label: n.label },
    }));

    const rfEdges: Edge[] = flow.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: e.animated,
      type: 'smoothstep',
      style: { ...DEFAULT_EDGE_STYLE, ...(e.style || {}) },
      labelStyle: { fill: 'var(--color-muted)', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' },
      labelBgStyle: { fill: 'var(--color-paper)', fillOpacity: 1 },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
    }));

    const { nodes: ln, edges: le } = getLayoutedElements(rfNodes, rfEdges);
    return { layoutedNodes: ln, layoutedEdges: le };
  }, [flow]);

  // Fit view when layout changes
  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.16, duration: 300, maxZoom: 1 }), 80);
    return () => clearTimeout(timer);
  }, [layoutedNodes, fitView]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const original = flow.nodes.find((n) => n.id === node.id);
    setSelectedNode(original || null);
  }, [flow.nodes]);

  return (
    <div className="aegis-flow-container">
      <div className="aegis-flow-header">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-line bg-paper text-forest">
          <Network className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="aegis-eyebrow">Trace / request lifecycle</p>
          <h3 className="mt-0.5 font-display text-[15px] font-semibold tracking-tight text-ink">
            API behaviour flow
          </h3>
        </div>
        <span className="ml-auto hidden font-mono text-[9px] uppercase tracking-[0.08em] text-muted sm:block">
          Click a node to inspect
        </span>
        <span className="aegis-flow-node-count">{flow.nodes.length} stages</span>
      </div>

      <div className="aegis-flow-canvas">
        <ReactFlow
          nodes={layoutedNodes}
          edges={layoutedEdges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.16, maxZoom: 1 }}
          attributionPosition="bottom-right"
          minZoom={0.3}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
          edgesFocusable={false}
          nodesConnectable={false}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-line)" />
          <Controls
            className="aegis-flow-controls"
            showInteractive={false}
          />
          <MiniMap
            nodeColor={(n) => {
              const status = (n.data?.stage_status as string) || 'completed';
              return getStatusConfig(status).border;
            }}
            className="aegis-flow-minimap"
            maskColor="color-mix(in srgb, var(--color-canvas) 70%, transparent)"
          />
        </ReactFlow>
      </div>

      {/* Detail Drawer */}
      <DetailDrawer node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
}

/* --------------------------- Exported Wrapper ---------------------------- */

export default function FlowDiagram({ flow }: Props) {
  if (!flow || !flow.nodes || flow.nodes.length === 0) {
    return (
      <div className="aegis-flow-container">
        <div className="aegis-flow-header">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-line bg-paper text-forest">
            <Network className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="aegis-eyebrow">Trace / request lifecycle</p>
            <h3 className="mt-0.5 font-display text-[15px] font-semibold tracking-tight text-ink">
              API behaviour flow
            </h3>
          </div>
        </div>
        <div className="aegis-flow-empty" role="status">
          <Info className="mb-2 h-6 w-6 text-muted" aria-hidden="true" />
          <p className="text-[11.5px] text-muted">No flow data available for this scan.</p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <FlowDiagramInner flow={flow} />
    </ReactFlowProvider>
  );
}


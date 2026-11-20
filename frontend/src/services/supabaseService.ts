// src/services/supabaseService.ts — Primary client-side Supabase Database & Storage provider
// Ensures 100% of scans, findings, specs, and visualization artifacts are stored in and retrieved from Supabase.

import { supabase } from '../lib/supabase';
import type {
  Finding,
  HistoryResponse,
  Scan,
  ScanSummary,
  Severity,
  SpecAnalysis,
  Visualizations,
} from '../types';

export const STORAGE_BUCKET = 'aegis-storage';

// ── Row Mappers ───────────────────────────────────────────────────────────────

export function mapRowToScan(row: any): Scan {
  const meta = row.metadata || {};
  let hostname = meta.hostname;
  if (!hostname && row.target_url) {
    try {
      hostname = new URL(row.target_url).hostname;
    } catch {
      hostname = row.target_url;
    }
  }

  return {
    id: row.id,
    url: row.target_url,
    hostname: hostname || 'API Target',
    status: row.status || 'completed',
    started_at: row.started_at || row.created_at,
    completed_at: row.completed_at,
    duration_ms: meta.duration_ms,
    assessment_score: row.score !== null && row.score !== undefined ? Number(row.score) : meta.assessment_score,
    earned_points: meta.earned_points,
    assessed_points: meta.assessed_points,
    assessment_coverage: meta.assessment_coverage,
    passed_checks: meta.passed_checks ?? 0,
    failed_checks: meta.failed_checks ?? 0,
    warning_checks: meta.warning_checks ?? 0,
    inconclusive_checks: meta.inconclusive_checks ?? 0,
    highest_severity: meta.highest_severity,
    user_id: row.user_id,
    user_email: meta.user_email,
    workspace_id: row.workspace_id,
    result_json: meta.result_json,
  };
}

export function mapRowToFinding(row: any): Finding {
  const meta = row.metadata || {};
  return {
    id: row.id,
    scan_id: row.scan_id,
    title: row.title || 'Security Finding',
    category: meta.category || 'General',
    severity: (row.severity as Severity) || 'informational',
    confidence: meta.confidence || 'confirmed',
    status: meta.status || 'fail',
    evidence: row.evidence || '',
    description: row.description || '',
    why_it_matters: meta.why_it_matters,
    remediation: row.remediation || '',
    rule_reference: meta.rule_reference,
    created_at: row.created_at,
  };
}

// ── Storage Operations ───────────────────────────────────────────────────────

export async function uploadToStorage(
  filePath: string,
  content: string | Blob,
  contentType: string = 'application/json'
): Promise<string | null> {
  try {
    const body = typeof content === 'string' ? new Blob([content], { type: contentType }) : content;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, body, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.warn('Supabase storage upload error:', error.message);
      return null;
    }

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return data.publicUrl;
  } catch (err) {
    console.warn('Storage upload exception:', err);
    return null;
  }
}

export async function downloadFromStorage(filePath: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(filePath);
    if (error || !data) return null;
    return await data.text();
  } catch {
    return null;
  }
}

// ── Scans Database Persistence ───────────────────────────────────────────────

export async function persistScanToSupabase(
  scan: Scan,
  visualizations?: Visualizations | null
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Upload visualizations and flow diagram to Supabase Storage
    let storageVisUrl: string | null = null;
    let storageFlowUrl: string | null = null;

    if (visualizations) {
      storageVisUrl = await uploadToStorage(
        `scans/${scan.id}/visualizations.json`,
        JSON.stringify(visualizations),
        'application/json'
      );
      if (visualizations.flow) {
        storageFlowUrl = await uploadToStorage(
          `scans/${scan.id}/flow-diagram.json`,
          JSON.stringify(visualizations.flow),
          'application/json'
        );
      }
    }

    const metadata = {
      hostname: scan.hostname,
      duration_ms: scan.duration_ms,
      passed_checks: scan.passed_checks,
      failed_checks: scan.failed_checks,
      warning_checks: scan.warning_checks,
      inconclusive_checks: scan.inconclusive_checks,
      highest_severity: scan.highest_severity,
      earned_points: scan.earned_points,
      assessed_points: scan.assessed_points,
      assessment_coverage: scan.assessment_coverage,
      user_email: user?.email || scan.user_email,
      storage_visualizations_url: storageVisUrl,
      storage_flow_url: storageFlowUrl,
      result_json: scan.result_json,
    };

    const row = {
      id: scan.id,
      user_id: user?.id || scan.user_id || null,
      workspace_id: scan.workspace_id || null,
      target_url: scan.url,
      scan_type: 'full',
      status: scan.status,
      score: scan.assessment_score ?? null,
      findings_count: (scan.failed_checks || 0) + (scan.warning_checks || 0),
      metadata,
      started_at: scan.started_at,
      completed_at: scan.completed_at || null,
    };

    const { error } = await supabase.from('scans').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('Failed to upsert scan into Supabase:', error.message);
    }
  } catch (err) {
    console.warn('Exception in persistScanToSupabase:', err);
  }
}

export async function persistFindingsToSupabase(
  scanId: string,
  findings: Finding[]
): Promise<void> {
  if (!findings || findings.length === 0) return;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const rows = findings.map((f) => ({
      id: f.id || crypto.randomUUID(),
      scan_id: scanId,
      user_id: user?.id || null,
      title: f.title,
      description: f.description || '',
      severity: f.severity || 'informational',
      endpoint: f.evidence ? 'API Endpoint' : null,
      evidence: f.evidence || '',
      remediation: f.remediation || '',
      metadata: {
        category: f.category,
        confidence: f.confidence,
        status: f.status,
        why_it_matters: f.why_it_matters,
        rule_reference: f.rule_reference,
      },
      created_at: f.created_at || new Date().toISOString(),
    }));

    const { error } = await supabase.from('scan_findings').upsert(rows, { onConflict: 'id' });
    if (error) {
      console.warn('Failed to upsert findings to Supabase:', error.message);
    }
  } catch (err) {
    console.warn('Exception in persistFindingsToSupabase:', err);
  }
}

// ── Scans & Findings Retrieval from Supabase ─────────────────────────────────

export async function fetchScanHistoryFromSupabase(
  scope: 'my' | 'workspace' = 'workspace',
  limit = 50,
  offset = 0,
  activeWorkspaceId?: string | null
): Promise<HistoryResponse> {
  const { data: { user } } = await supabase.auth.getUser();

  // Guest mode (unauthenticated): strictly do NOT retrieve data from database
  if (!user?.id) {
    return {
      scans: [],
      total: 0,
      my_total: 0,
      workspace_total: 0,
    };
  }

  // Authenticated user: only retrieve user scans and team scans (strictly exclude guest scans where user_id IS NULL)
  let workspaceCount: number | null = 0;
  if (activeWorkspaceId) {
    const { count } = await supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })
      .not('user_id', 'is', null)
      .eq('workspace_id', activeWorkspaceId);
    workspaceCount = count;
  } else {
    const { count } = await supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })
      .not('user_id', 'is', null)
      .not('workspace_id', 'is', null);
    workspaceCount = count;
  }

  const { count: myCount } = await supabase
    .from('scans')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .not('user_id', 'is', null);

  // 2. Fetch scoped scans (strictly user_id IS NOT NULL)
  // Use any to prevent TypeScript TS2589 excessive depth during chained filter reassignments
  let query: any = supabase
    .from('scans')
    .select('*')
    .not('user_id', 'is', null);

  if (scope === 'my') {
    query = query.eq('user_id', user.id);
  } else if (activeWorkspaceId) {
    query = query.eq('workspace_id', activeWorkspaceId);
  } else {
    query = query.not('workspace_id', 'is', null);
  }

  query = query
    .order('started_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load scans from Supabase: ${error.message}`);
  }

  const scans = (data || []).map(mapRowToScan);
  const total = scope === 'my' ? (myCount || 0) : (workspaceCount || 0);

  return {
    scans: scans as unknown as ScanSummary[],
    total,
    my_total: myCount || 0,
    workspace_total: workspaceCount || 0,
  };
}

export async function fetchScanFromSupabase(scanId: string): Promise<Scan | null> {
  const { data: { user } } = await supabase.auth.getUser();
  // Guest mode does not retrieve data from database
  if (!user?.id) return null;

  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('id', scanId)
    .not('user_id', 'is', null)
    .single();

  if (error || !data) return null;
  return mapRowToScan(data);
}

export async function fetchFindingsFromSupabase(scanId: string): Promise<Finding[]> {
  const { data: { user } } = await supabase.auth.getUser();
  // Guest mode does not retrieve data from database
  if (!user?.id) return [];

  const { data, error } = await supabase
    .from('scan_findings')
    .select('*')
    .eq('scan_id', scanId)
    .not('user_id', 'is', null)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data.map(mapRowToFinding);
}

export async function fetchVisualizationsFromStorage(scanId: string): Promise<Visualizations | null> {
  const raw = await downloadFromStorage(`scans/${scanId}/visualizations.json`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Visualizations;
  } catch {
    return null;
  }
}

// ── OpenAPI Specs Storage & Database Persistence ──────────────────────────────

export async function persistSpecToSupabase(
  file: File | null,
  specUrl: string | null,
  analysis: SpecAnalysis
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    let storageUrl: string | null = null;
    let textContent: string | null = null;

    if (file) {
      textContent = await file.text();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      storageUrl = await uploadToStorage(
        `specs/${user?.id || 'guest'}/${Date.now()}_${sanitizedName}`,
        textContent,
        'application/json'
      );
    }

    const row = {
      id: analysis.spec_id || crypto.randomUUID(),
      user_id: user?.id || null,
      filename: file?.name || (specUrl ? new URL(specUrl).pathname.split('/').pop() || 'openapi.json' : 'openapi.json'),
      content: textContent ? textContent.slice(0, 50_000) : null,
      spec_url: storageUrl || specUrl || null,
      version: analysis.version || '3.0.0',
      endpoints: analysis.total_endpoints || 0,
      metadata: {
        title: analysis.title,
        endpoints: analysis.endpoints,
        storage_url: storageUrl,
      },
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('spec_uploads').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('Failed to upsert spec to Supabase:', error.message);
    }
  } catch (err) {
    console.warn('Exception in persistSpecToSupabase:', err);
  }
}

export async function fetchSpecUploadsFromSupabase(): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('spec_uploads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

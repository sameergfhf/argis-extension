import axios, { AxiosError } from 'axios';
import { supabase } from '../lib/supabase';
import {
  persistScanToSupabase,
  persistFindingsToSupabase,
  fetchScanHistoryFromSupabase,
  fetchScanFromSupabase,
  fetchFindingsFromSupabase,
  fetchVisualizationsFromStorage,
  uploadToStorage,
  persistSpecToSupabase,
} from './supabaseService';
import type {
  ComparisonResult,
  Finding,
  HealthStatus,
  HistoryResponse,
  OperationScanRequest,
  Scan,
  SpecAnalysis,
  Visualizations,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 30_000,
});

// Automatically inject Supabase auth session token and user context
api.interceptors.request.use(async (config) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
      if (session.user?.id) {
        config.headers['X-User-Id'] = session.user.id;
      }
      if (session.user?.email) {
        config.headers['X-User-Email'] = session.user.email;
      }
    }
  } catch {
    // Continue in guest mode
  }
  return config;
});

// ── Scans ─────────────────────────────────────────────────────────────────────

export async function createScan(
  url: string,
  notes?: string,
  workspaceId?: string | null
): Promise<Scan> {
  const { data } = await api.post<Scan>('/scans', {
    url,
    notes,
    workspace_id: workspaceId || undefined,
  });
  // Persist pending scan to Supabase
  persistScanToSupabase(data).catch((err) => console.warn('Supabase scan sync error:', err));
  return data;
}

export async function getScan(scanId: string): Promise<Scan> {
  // Check backend for latest live probe status first
  try {
    const { data } = await api.get<Scan>(`/scans/${scanId}`);
    if (data.status === 'completed' || data.status === 'failed') {
      persistScanToSupabase(data).catch(() => {});
    }
    return data;
  } catch (backendErr) {
    // If backend unavailable or scan archived, fetch directly from Supabase
    const fromSupabase = await fetchScanFromSupabase(scanId);
    if (fromSupabase) return fromSupabase;
    throw backendErr;
  }
}

export async function getFindings(scanId: string): Promise<Finding[]> {
  // First try fetching from Supabase
  try {
    const supabaseFindings = await fetchFindingsFromSupabase(scanId);
    if (supabaseFindings && supabaseFindings.length > 0) {
      return supabaseFindings;
    }
  } catch {
    // Continue to backend fallback
  }

  // Fallback to backend and persist to Supabase
  const { data } = await api.get<Finding[]>(`/scans/${scanId}/findings`);
  if (data && data.length > 0) {
    persistFindingsToSupabase(scanId, data).catch(() => {});
  }
  return data;
}

export async function getVisualizations(scanId: string): Promise<Visualizations> {
  // 1. Try Supabase Storage first
  try {
    const fromStorage = await fetchVisualizationsFromStorage(scanId);
    if (fromStorage) {
      return fromStorage;
    }
  } catch {
    // Fall back to backend probe
  }

  // 2. Fetch from backend probe and upload to Supabase Storage
  const { data } = await api.get<Visualizations>(`/scans/${scanId}/visualizations`);
  if (data) {
    uploadToStorage(
      `scans/${scanId}/visualizations.json`,
      JSON.stringify(data),
      'application/json'
    ).catch(() => {});
  }
  return data;
}

export function getReportUrl(scanId: string): string {
  return `/api/scans/${scanId}/report`;
}

export async function getScanHistory(
  limit = 20,
  offset = 0,
  scope: 'my' | 'workspace' = 'workspace',
  workspaceId?: string | null
): Promise<HistoryResponse> {
  // All scan history is retrieved directly from Supabase
  try {
    return await fetchScanHistoryFromSupabase(scope, limit, offset, workspaceId);
  } catch (err) {
    console.warn('Failed to retrieve history from Supabase, falling back to backend:', err);
    const { data } = await api.get<HistoryResponse>('/scans/history', {
      params: { limit, offset, scope, workspace_id: workspaceId || undefined },
    });
    return data;
  }
}

export async function compareScans(
  scanIdA: string,
  scanIdB: string,
): Promise<ComparisonResult> {
  const { data } = await api.post<ComparisonResult>(`/scans/${scanIdA}/compare`, {
    scan_id_a: scanIdA,
    scan_id_b: scanIdB,
  });
  return data;
}

// ── OpenAPI Specs ─────────────────────────────────────────────────────────────

export async function analyzeSpecUrl(url: string): Promise<SpecAnalysis> {
  const form = new FormData();
  form.append('url', url);
  const { data } = await api.post<SpecAnalysis>('/specifications/analyze', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  // Store spec analysis and reference in Supabase
  persistSpecToSupabase(null, url, data).catch((err) =>
    console.warn('Supabase spec persistence error:', err)
  );

  return data;
}

export async function analyzeSpecFile(file: File): Promise<SpecAnalysis> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<SpecAnalysis>('/specifications/analyze', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  // Upload spec file to Supabase Storage & store record in Supabase spec_uploads
  persistSpecToSupabase(file, null, data).catch((err) =>
    console.warn('Supabase spec persistence error:', err)
  );

  return data;
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<HealthStatus> {
  const { data } = await api.get<HealthStatus>('/health');
  return data;
}

// ── Operation Scan ────────────────────────────────────────────────────────────

export async function scanOperation(req: OperationScanRequest): Promise<Scan> {
  const { data } = await api.post<Scan>('/scans/operation', req);
  persistScanToSupabase(data).catch(() => {});
  return data;
}

// ── Error helpers ─────────────────────────────────────────────────────────────

/**
 * Convert any caught error into a human-readable message.
 * For Pydantic validation errors (422) the structured `detail` array is used
 * so the user sees exactly which field failed and why.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const detail = error.response?.data?.detail;

    // Pydantic v2 returns an array of {loc, msg, type} objects
    if (Array.isArray(detail)) {
      return detail
        .map((d: { loc?: (string | number)[]; msg?: string }) => {
          // loc is e.g. ["body", "base_url"] — take the last element as the field name
          const field = d.loc?.filter((s) => s !== 'body').join(' → ');
          const msg = d.msg ?? 'invalid';
          return field ? `${field}: ${msg}` : msg;
        })
        .join('\n');
    }

    if (typeof detail === 'string') return detail;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}

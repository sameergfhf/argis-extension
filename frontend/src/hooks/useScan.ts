// src/hooks/useScan.ts — Hook for creating and polling scans

import { useState, useEffect, useRef, useCallback } from 'react';
import { createScan, getScan, getFindings, getVisualizations, getErrorMessage } from '../services/api';
import { persistScanToSupabase } from '../services/supabaseService';
import type { Scan, Finding, Visualizations } from '../types';

const POLL_INTERVAL_MS = 2000;

interface UseScanReturn {
  scan: Scan | null;
  findings: Finding[];
  visualizations: Visualizations | null;
  isLoading: boolean;
  isPolling: boolean;
  error: string | null;
  startScan: (url: string, notes?: string, workspaceId?: string | null) => Promise<void>;
  loadScan: (scanId: string) => Promise<void>;
}

export function useScan(): UseScanReturn {
  const [scan, setScan] = useState<Scan | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [visualizations, setVisualizations] = useState<Visualizations | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const fetchExtras = useCallback(async (scanId: string) => {
    try {
      const [f, v] = await Promise.all([
        getFindings(scanId),
        getVisualizations(scanId),
      ]);
      setFindings(f);
      setVisualizations(v);
    } catch {
      // Visualizations may not be ready if scan just completed
    }
  }, []);

  const poll = useCallback((scanId: string) => {
    setIsPolling(true);
    const tick = async () => {
      try {
        const updated = await getScan(scanId);
        setScan(updated);
        if (updated.status === 'completed' || updated.status === 'failed') {
          stopPolling();
          if (updated.status === 'completed') {
            await fetchExtras(scanId);
            persistScanToSupabase(updated).catch(() => {});
          } else if (updated.status === 'failed' && updated.error_message) {
            setError(updated.error_message);
          }
        } else {
          pollRef.current = setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch (err) {
        setError(getErrorMessage(err));
        stopPolling();
      }
    };
    tick();
  }, [fetchExtras, stopPolling]);

  const startScan = useCallback(async (url: string, notes?: string, workspaceId?: string | null) => {
    setIsLoading(true);
    setError(null);
    setFindings([]);
    setVisualizations(null);
    try {
      const newScan = await createScan(url, notes, workspaceId);
      setScan(newScan);
      poll(newScan.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [poll]);

  const loadScan = useCallback(async (scanId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const loadedScan = await getScan(scanId);
      setScan(loadedScan);
      if (loadedScan.status === 'completed') {
        await fetchExtras(scanId);
      } else if (loadedScan.status === 'failed' && loadedScan.error_message) {
        setError(loadedScan.error_message);
      } else if (loadedScan.status === 'pending' || loadedScan.status === 'running') {
        poll(scanId);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [fetchExtras, poll]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { scan, findings, visualizations, isLoading, isPolling, error, startScan, loadScan };
}

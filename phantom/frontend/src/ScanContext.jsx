import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { fetchAuth } from './api';

const ScanContext = createContext(null);

const MODULE_ENDPOINT_MAP = {
  port_scanner:    '/api/port-scan',
  sqli_tester:     '/api/sqli-test',
  xss_detector:    '/api/xss-detect',
  subdomain_enum:  '/api/subdomain-enum',
  header_analyzer: '/api/header-analyze',
  ssl_analyzer:    '/api/ssl-analyze',
  dir_enum:        '/api/dir-enum',
  waf_detect:      '/api/waf-detect',
  whois_lookup:    '/api/whois',
  dns_recon:       '/api/dns-recon',
  cve_lookup:      '/api/cve-lookup',
  csrf_detector:   '/api/csrf-detect',
  ssrf_detector:   '/api/ssrf-detect',
  xxe_detector:    '/api/xxe-detect',
  auth_tester:     '/api/auth-test',
  open_redirect:   '/api/open-redirect',
};

export function ScanProvider({ children }) {
  const [scanStatus, setScanStatus] = useState('idle');
  const [scanResult, setScanResult] = useState(null);
  const [scanDuration, setScanDuration] = useState(0);
  const [scanTarget, setScanTarget] = useState('');
  const [scanModule, setScanModule] = useState('');
  const pollingRef = useRef(null);

  const resetScan = useCallback(() => {
    setScanStatus('idle');
    setScanResult(null);
    setScanDuration(0);
    setScanTarget('');
    setScanModule('');
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startScan = useCallback(async (target, selectedModules, loadStats, setAlerts) => {
    if (!target.trim()) return;
    setScanStatus('running');
    setScanResult(null);
    setScanDuration(0);
    setScanTarget(target);
    setScanModule(selectedModules.length > 1 ? 'full-scan' : selectedModules[0]);
    const start = performance.now();

    try {
      const isFullScan = selectedModules.length >= 16;
      let resData;

      if (isFullScan) {
        resData = await fetchAuth('/api/full-scan', {
          method: 'POST',
          body: JSON.stringify({ target, options: {} })
        });
      } else if (selectedModules.length > 1) {
        const moduleResults = await Promise.allSettled(
          selectedModules.map(mod =>
            fetchAuth(MODULE_ENDPOINT_MAP[mod] || `/api/${mod.replace(/_/g, '-')}`, {
              method: 'POST',
              body: JSON.stringify({ target, options: {} })
            }).then(data => ({ mod, data }))
          )
        );
        const combined = {};
        moduleResults.forEach(r => {
          if (r.status === 'fulfilled') {
            combined[r.value.mod] = r.value.data;
          } else {
            combined[r.value?.mod || 'unknown'] = { risk: 'ERROR', error: r.reason?.message };
          }
        });
        resData = { results: combined };
      } else {
        const mod = selectedModules[0];
        const endpoint = MODULE_ENDPOINT_MAP[mod] || `/api/${mod.replace(/_/g, '-')}`;
        const raw = await fetchAuth(endpoint, {
          method: 'POST',
          body: JSON.stringify({ target, options: {} })
        });
        resData = { results: { [mod]: raw } };
      }

      if (resData && resData.status === 'running') {
        let attempts = 0;
        const maxAttempts = 180;
        while (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 2000));
          attempts++;
          try {
            const history = await fetchAuth('/api/history?limit=1');
            const latest = history.sessions?.[0];
            if (latest && latest.target === target && latest.status === 'completed') {
              const detail = await fetchAuth(`/api/history/${latest.id}`);
              const combined = {};
              (detail.results || []).forEach(r => {
                combined[r.module_name] = r.result_data || { risk: r.risk_level, vulnerable: r.vulnerable };
              });
              resData = { session_id: latest.id, results: combined };
              break;
            }
          } catch (e) { /* retry */ }
        }
      }

      setScanDuration(Math.round((performance.now() - start) / 1000));
      setScanResult(resData);
      setScanStatus('completed');

      if (setAlerts) {
        const newAlerts = [];
        Object.keys(resData.results || {}).forEach(m => {
          const modRes = resData.results[m];
          if (modRes && modRes.vulnerable) {
            newAlerts.push({
              module_name: m,
              severity: modRes.risk || 'INFO',
              description: `Vulnerability verified on target: ${target}`,
              timestamp: new Date().toLocaleTimeString()
            });
          }
        });
        setAlerts(prev => [...newAlerts, ...prev]);
      }
      if (loadStats) loadStats();
    } catch (e) {
      setScanStatus('failed');
    }
  }, []);

  return (
    <ScanContext.Provider value={{ scanStatus, scanResult, scanDuration, scanTarget, scanModule, startScan, resetScan }}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScan() {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error('useScan must be used within ScanProvider');
  return ctx;
}

/**
 * MoSPI / NSSTA Offline-First IndexedDB Store, Pyodide WebAssembly Python Engine & Auto-Sync Manager
 */

const DB_NAME = 'MoSPI_Offline_DB';
const DB_VERSION = 2;

class MoSPIOfflineStore {
  constructor() {
    this.db = null;
    this.pyodide = null;
    this.pyodideLoading = false;
    this.isSyncing = false;
    this.statusListeners = [];
    this.initDB();
    this.registerServiceWorker();
  }

  // Register Service Worker
  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => console.log('[MoSPI PWA] Service Worker registered with scope:', reg.scope))
          .catch((err) => console.warn('[MoSPI PWA] Service Worker registration failed:', err));
      });
    }
  }

  // Initialize IndexedDB
  async initDB() {
    return new Promise((resolve, reject) => {
      if (this.db) return resolve(this.db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('offline_courses')) {
          db.createObjectStore('offline_courses', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('offline_quizzes')) {
          db.createObjectStore('offline_quizzes', { keyPath: 'course_id' });
        }
        if (!db.objectStoreNames.contains('audit_sync_queue')) {
          const auditStore = db.createObjectStore('audit_sync_queue', { keyPath: 'id', autoIncrement: true });
          auditStore.createIndex('status', 'status', { unique: false });
          auditStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains('offline_scripts')) {
          db.createObjectStore('offline_scripts', { keyPath: 'id', autoIncrement: true });
        }
      };

      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
        this.notifyStatusChange();
      };

      req.onerror = (e) => reject(e.target.error);
    });
  }

  // Generic DB Transaction Helper
  async tx(storeName, mode, callback) {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = callback(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // =========================================================================
  // OFFLINE COURSES & SYLLABUS MANUALS
  // =========================================================================
  async saveCourseOffline(course) {
    if (!course || !course.id) course.id = 'course_' + Math.random().toString(36).substring(2, 9);
    course.downloadedAt = new Date().toISOString();
    course.is_offline = true;
    
    await this.tx('offline_courses', 'readwrite', (store) => store.put(course));
    
    // Log audit event
    await this.queueAuditLog('COURSE_DOWNLOADED_OFFLINE', {
      courseId: course.id,
      courseTitle: course.title,
      domain: course.domain
    });

    this.notifyStatusChange();
    return course;
  }

  async getOfflineCourses() {
    return this.tx('offline_courses', 'readonly', (store) => store.getAll());
  }

  async getOfflineCourseById(id) {
    return this.tx('offline_courses', 'readonly', (store) => store.get(id));
  }

  async removeOfflineCourse(id) {
    await this.tx('offline_courses', 'readwrite', (store) => store.delete(id));
    this.notifyStatusChange();
  }

  async isCourseDownloaded(id) {
    const res = await this.getOfflineCourseById(id);
    return !!res;
  }

  // =========================================================================
  
  async saveOfflineQuiz(courseTitle, questions) {
    const key = (courseTitle || '').toLowerCase().trim();
    await this.tx('offline_quizzes', 'readwrite', (store) => store.put({ course_id: key, questions: questions }));
  }

  async getOfflineQuiz(courseTitle) {
    const key = (courseTitle || '').toLowerCase().trim();
    const res = await this.tx('offline_quizzes', 'readonly', (store) => store.get(key));
    return res ? res.questions : null;
  }

  // AUDIT LOG QUEUE & AUTO-SYNC ENGINE
  // =========================================================================
  async queueAuditLog(actionType, actionDetails) {
    const user = JSON.parse(localStorage.getItem('mospi_user') || '{}');
    const entry = {
      action_type: actionType,
      officer_email: user.email || 'regional.officer@mospi.gov.in',
      officer_name: user.name || 'Regional Field Officer',
      cadre: user.cadre || 'ISS',
      department: user.department || 'FOD',
      action_details: actionDetails || {},
      status: 'PENDING',
      timestamp: new Date().toISOString(),
      connectivity_at_log: navigator.onLine ? 'ONLINE' : 'OFFLINE_FIELD'
    };

    const id = await this.tx('audit_sync_queue', 'readwrite', (store) => store.add(entry));
    console.log('[MoSPI Offline Audit] Queued log item #' + id + ' (' + actionType + ')');
    this.notifyStatusChange();

    // If currently online, trigger auto-sync in background
    if (navigator.onLine && !this.isSyncing) {
      this.syncPendingAuditLogs();
    }
    return id;
  }

  async getPendingAuditLogs() {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('audit_sync_queue', 'readonly');
      const store = tx.objectStore('audit_sync_queue');
      const req = store.getAll();
      req.onsuccess = () => {
        const logs = req.result || [];
        resolve(logs.filter((l) => l.status === 'PENDING'));
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllAuditLogs() {
    return this.tx('audit_sync_queue', 'readonly', (store) => store.getAll());
  }

  async clearSyncedLogs() {
    const db = await this.initDB();
    const tx = db.transaction('audit_sync_queue', 'readwrite');
    const store = tx.objectStore('audit_sync_queue');
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.value.status === 'SYNCED') {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  }

  async syncPendingAuditLogs() {
    if (!navigator.onLine || this.isSyncing) return { synced: 0, total: 0 };
    const pending = await this.getPendingAuditLogs();
    if (!pending || pending.length === 0) return { synced: 0, total: 0 };

    this.isSyncing = true;
    this.notifyStatusChange();
    console.log(`[MoSPI Auto-Sync] Attempting to flush ${pending.length} offline audit logs to Supabase...`);

    const API_URL = window.API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://sih100-backend.onrender.com');

    try {
      const res = await fetch(`${API_URL}/api/sync/audit-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: pending })
      });

      if (res.ok) {
        const data = await res.json();
        // Mark pending items as SYNCED
        const db = await this.initDB();
        const tx = db.transaction('audit_sync_queue', 'readwrite');
        const store = tx.objectStore('audit_sync_queue');

        for (const item of pending) {
          item.status = 'SYNCED';
          item.synced_at = new Date().toISOString();
          store.put(item);
        }

        console.log(`[MoSPI Auto-Sync] ✅ Successfully synced ${pending.length} audit logs to Supabase PostgreSQL!`);
        this.showToast(`✅ Synced ${pending.length} field actions with Supabase!`, 'success');
        this.isSyncing = false;
        this.notifyStatusChange();
        return { synced: pending.length, total: pending.length, data };
      } else {
        console.warn('[MoSPI Auto-Sync] Backend returned error status:', res.status);
        this.isSyncing = false;
        this.notifyStatusChange();
        return { synced: 0, total: pending.length, error: 'Server error ' + res.status };
      }
    } catch (err) {
      console.warn('[MoSPI Auto-Sync] Network error syncing logs to Supabase:', err);
      this.isSyncing = false;
      this.notifyStatusChange();
      return { synced: 0, total: pending.length, error: err.message };
    }
  }

  // =========================================================================
  // CLIENT-SIDE PYODIDE PYTHON WEBASSEMBLY ENGINE
  // =========================================================================
  async initPyodide(statusCallback) {
    if (this.pyodide) return this.pyodide;
    if (this.pyodideLoading) {
      while (this.pyodideLoading) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return this.pyodide;
    }

    this.pyodideLoading = true;
    if (statusCallback) statusCallback('Lazy-loading WebAssembly Python Kernel (Pyodide v0.26)...');

    try {
      // Lazy-load Pyodide CDN script bundle dynamically on-demand
      if (typeof loadPyodide === 'undefined') {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js';
          script.onload = () => {
            console.log('[MoSPI Pyodide] Dynamically loaded pyodide.js script bundle on demand.');
            resolve();
          };
          script.onerror = (err) => reject(new Error('Failed to fetch Pyodide WebAssembly bundle from CDN.'));
          document.head.appendChild(script);
        });
      }

      this.pyodide = await loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/'
      });

      // Pre-seed MoSPI statistical helper package environment
      await this.pyodide.runPythonAsync(`
import sys, math, json

def calculate_plfs_sampling_variance(sample_weights, y_values):
    """Computes Horvitz-Thompson weighted mean and standard error for PLFS microdata."""
    N = len(sample_weights)
    if N == 0: return {"mean": 0, "variance": 0, "std_error": 0}
    w_sum = sum(sample_weights)
    weighted_mean = sum(w * y for w, y in zip(sample_weights, y_values)) / w_sum
    var = sum(w * ((y - weighted_mean) ** 2) for w, y in zip(sample_weights, y_values)) / w_sum
    return {
        "weighted_mean": round(weighted_mean, 4),
        "population_variance": round(var, 4),
        "standard_error": round(math.sqrt(var / N), 4),
        "total_sample_size": N,
        "effective_weight_sum": round(w_sum, 2)
    }

def compute_asi_output_multiplier(gross_output, intermediate_inputs, total_capital):
    """Computes GVA, Output-to-Capital Ratio, and Efficiency Index for ASI units."""
    gva = gross_output - intermediate_inputs
    capital_ratio = gross_output / max(total_capital, 1.0)
    efficiency_score = (gva / max(gross_output, 1.0)) * 100
    return {
        "gross_value_added_inr_lakhs": round(gva, 2),
        "output_capital_ratio": round(capital_ratio, 3),
        "value_addition_efficiency_pct": round(efficiency_score, 2),
        "classification": "High Efficiency Unit" if efficiency_score > 35 else "Standard Efficiency"
    }

def harmonize_cpi_item_weights(item_weights, current_prices, base_prices):
    """Computes Laspeyres Sub-Index for State-Level CPI Field Price Monitoring."""
    numerator = sum(w * (p_curr / max(p_base, 0.001)) for w, p_curr, p_base in zip(item_weights, current_prices, base_prices))
    denominator = sum(item_weights)
    sub_index = (numerator / max(denominator, 1.0)) * 100
    return {
        "laspeyres_cpi_sub_index": round(sub_index, 2),
        "inflation_rate_pct": round(sub_index - 100, 2),
        "items_analyzed": len(item_weights)
    }
`);

      console.log('[MoSPI Pyodide] WebAssembly Python engine initialized successfully (100% Offline Ready)!');
      this.pyodideLoading = false;
      if (statusCallback) statusCallback('✔ Pyodide Python Engine Ready (Offline Capable)');
      return this.pyodide;
    } catch (err) {
      this.pyodideLoading = false;
      console.error('[MoSPI Pyodide] Failed to initialize Pyodide:', err);
      if (statusCallback) statusCallback('❌ Pyodide Engine Failed: ' + err.message);
      throw err;
    }
  }

  async runPythonCode(pythonCode, scriptName = 'Field Statistical Script') {
    const startTime = performance.now();
    const py = await this.initPyodide();

    // Redirect stdout and stderr
    let outputBuffer = [];
    py.setStdout({ batched: (str) => outputBuffer.push(str) });
    py.setStderr({ batched: (str) => outputBuffer.push('[ERR] ' + str) });

    let result = null;
    let isError = false;
    let errorMsg = null;

    try {
      result = await py.runPythonAsync(pythonCode);
    } catch (e) {
      isError = true;
      errorMsg = e.message;
      outputBuffer.push(`[ERROR] ${e.message}`);
    }

    const durationMs = Math.round(performance.now() - startTime);
    const consoleOutput = outputBuffer.join('\n');

    // Queue audit log for Python Execution
    await this.queueAuditLog('CLIENT_PYTHON_EXECUTION', {
      scriptName: scriptName,
      executionTimeMs: durationMs,
      status: isError ? 'FAILED' : 'SUCCESS',
      outputSnippet: consoleOutput.substring(0, 300)
    });

    return {
      output: consoleOutput,
      result: result,
      durationMs: durationMs,
      isError: isError,
      errorMsg: errorMsg
    };
  }

  // =========================================================================
  // CONNECTIVITY OBSERVER & TOASTS
  // =========================================================================
  onStatusChange(listener) {
    this.statusListeners.push(listener);
  }

  notifyStatusChange() {
    this.getPendingAuditLogs().then((pending) => {
      this.getOfflineCourses().then((courses) => {
        const state = {
          isOnline: navigator.onLine,
          isSyncing: this.isSyncing,
          pendingSyncCount: pending.length,
          offlineCoursesCount: courses.length
        };
        this.statusListeners.forEach((fn) => fn(state));
      });
    });
  }

  initNetworkWatcher() {
    window.addEventListener('online', () => {
      console.log('[MoSPI Connectivity] 🌐 Network restored. Online mode active.');
      this.showToast('🌐 Internet connection restored. Auto-syncing pending logs...', 'info');
      this.syncPendingAuditLogs();
      this.notifyStatusChange();
    });

    window.addEventListener('offline', () => {
      console.log('[MoSPI Connectivity] ⚠️ Network disconnected. Field Offline Mode active.');
      this.showToast('⚠️ Offline Field Mode active. All completions and scripts will be cached locally.', 'warning');
      this.notifyStatusChange();
    });

    // Periodic auto-sync every 45s when online
    setInterval(() => {
      if (navigator.onLine && !this.isSyncing) {
        this.syncPendingAuditLogs();
      }
    }, 45000);
  }

  showToast(message, type = 'info') {
    let container = document.getElementById('mospi-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'mospi-toast-container';
      container.style.cssText = 'position:fixed; bottom:24px; right:24px; z-index:99999; display:flex; flex-direction:column; gap:10px; max-width:380px;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bg = type === 'success' ? '#15803d' : type === 'warning' ? '#b45309' : '#1e3a8a';
    toast.style.cssText = `background:${bg}; color:#ffffff; padding:12px 18px; border-radius:8px; font-size:0.86rem; font-weight:700; box-shadow:0 4px 14px rgba(0,0,0,0.25); display:flex; align-items:center; justify-content:space-between; gap:10px; transition:all 0.3s ease; animation: slideIn 0.3s ease;`;
    toast.innerHTML = `<span>${message}</span><button style="background:none; border:none; color:#fff; font-size:1rem; cursor:pointer; font-weight:800;" onclick="this.parentElement.remove()">&times;</button>`;

    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 5000);
  }
}

// Global Singleton
window.MoSPIOffline = new MoSPIOfflineStore();
window.MoSPIOffline.initNetworkWatcher();

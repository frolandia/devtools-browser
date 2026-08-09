/**
 * Native Chrome DevTools Core v3.0 — TypeScript Source
 */

interface ConsoleLogEntry {
  type: 'log' | 'warn' | 'error' | 'info' | 'debug';
  time: string;
  message: string;
  count: number;
}

interface NetworkLogEntry {
  id: string;
  method: string;
  url: string;
  type: 'xhr' | 'fetch' | 'img' | 'script';
  status: number | string;
  duration: string;
  size: string;
  reqBody: any;
  resBody: string;
  startTime: number;
}

interface DevToolsConfig {
  theme: 'dark' | 'light';
  fontSize: number;
  maxConsoleEntries: number;
  showTimestamps: boolean;
  networkFilter: string;
}

type TabName = 'elements' | 'console' | 'network' | 'storage' | 'performance' | 'scraper' | 'settings';

interface UtilsNamespace {
  escapeHTML(str: string): string;
  formatDuration(ms: number): string;
  generateId(): string;
}

interface DevToolsNamespace {
  activeTab: TabName;
  networkLogs: NetworkLogEntry[];
  consoleLogs: ConsoleLogEntry[];
  config: DevToolsConfig;
  init(): void;
  setupConsoleInterceptor(): void;
  setupNetworkInterceptor(): void;
  createUI(): void;
  bindEvents(): void;
  render(): void;
  updateBadges(): void;
  renderElements(): void;
  renderConsole(): void;
  renderNetwork(): void;
  renderStorage(): void;
  renderPerformance(): void;
  renderScraper(): void;
  renderSettings(): void;
}

declare global {
  interface Window {
    __NATIVE_DEVTOOLS_INSTALLED__?: boolean;
  }
}

(function (): void {
  if (window.__NATIVE_DEVTOOLS_INSTALLED__) return;
  window.__NATIVE_DEVTOOLS_INSTALLED__ = true;

  const Utils: UtilsNamespace = {
    escapeHTML(str: string): string {
      return str.replace(/[&<>'"]/g, (tag: string): string => {
        return (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }) as Record<string, string>)[tag] || tag;
      });
    },

    formatDuration(ms: number): string {
      if (ms < 1000) return ms + 'ms';
      return (ms / 1000).toFixed(2) + 's';
    },

    generateId(): string {
      return Math.random().toString(36).substring(2, 11);
    },
  };

  const DevTools: DevToolsNamespace = {
    activeTab: 'elements' as TabName,
    networkLogs: [] as NetworkLogEntry[],
    consoleLogs: [] as ConsoleLogEntry[],
    config: {
      theme: 'dark',
      fontSize: 12,
      maxConsoleEntries: 500,
      showTimestamps: true,
      networkFilter: 'all',
    } as DevToolsConfig,

    init(): void {
      this.setupConsoleInterceptor();
      this.setupNetworkInterceptor();
      this.createUI();
      this.bindEvents();
    },

    setupConsoleInterceptor(): void {
      const self = this;
      const originalConsole: Record<string, (...args: any[]) => void> = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug,
      };

      (['log', 'warn', 'error', 'info', 'debug'] as const).forEach((method: ConsoleLogEntry['type']): void => {
        (console as any)[method] = function (...args: any[]): void {
          originalConsole[method].apply(console, args);

          const formatted: string = args
            .map((arg: any): string => {
              if (arg === null) return 'null';
              if (arg === undefined) return 'undefined';
              if (typeof arg === 'object') {
                try {
                  return JSON.stringify(arg, null, 2);
                } catch (e) {
                  return String(arg);
                }
              }
              return String(arg);
            })
            .join(' ');

          const last: ConsoleLogEntry | undefined = self.consoleLogs[self.consoleLogs.length - 1];
          if (last && last.type === method && last.message === formatted) {
            last.count++;
          } else {
            self.consoleLogs.push({
              type: method,
              time: new Date().toLocaleTimeString(),
              message: formatted,
              count: 1,
            });
          }

          if (self.consoleLogs.length > self.config.maxConsoleEntries) {
            self.consoleLogs.shift();
          }
          if (self.activeTab === 'console') self.renderConsole();
        };
      });

      window.addEventListener('error', (e: ErrorEvent): void => {
        console.error('Uncaught Error: ' + e.message + ' at ' + e.filename + ':' + e.lineno + ':' + e.colno);
      });

      window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent): void => {
        console.error('Unhandled Promise Rejection: ' + e.reason);
      });
    },

    setupNetworkInterceptor(): void {
      const self = this;

      const origOpen: typeof XMLHttpRequest.prototype.open = XMLHttpRequest.prototype.open;
      const origSend: typeof XMLHttpRequest.prototype.send = XMLHttpRequest.prototype.send;

      (XMLHttpRequest.prototype as any).open = function (method: string, url: string | URL): void {
        (this as any)._method = method;
        (this as any)._url = url;
        (this as any)._startTime = Date.now();
        return origOpen.apply(this, arguments as any);
      };

      (XMLHttpRequest.prototype as any).send = function (body?: Document | XMLHttpRequestBodyInit | null): void {
        const xhr: XMLHttpRequest = this;
        const logEntry: NetworkLogEntry = {
          id: Utils.generateId(),
          method: (xhr as any)._method || 'GET',
          url: String((xhr as any)._url || ''),
          type: 'xhr',
          status: 'Pending...',
          duration: '0ms',
          size: '—',
          reqBody: body,
          resBody: '',
          startTime: (xhr as any)._startTime || Date.now(),
        };

        self.networkLogs.push(logEntry);

        xhr.addEventListener('load', (): void => {
          logEntry.status = xhr.status;
          logEntry.duration = Utils.formatDuration(Date.now() - logEntry.startTime);
          logEntry.resBody = xhr.responseText;
          if (self.activeTab === 'network') self.renderNetwork();
        });

        xhr.addEventListener('error', (): void => {
          logEntry.status = 'Failed';
          logEntry.duration = Utils.formatDuration(Date.now() - logEntry.startTime);
          if (self.activeTab === 'network') self.renderNetwork();
        });

        return origSend.apply(this, arguments as any);
      };

      if (window.fetch) {
        const origFetch: typeof window.fetch = window.fetch;

        (window as any).fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
          const startTime: number = Date.now();
          const url: string = typeof input === 'string' ? input : (input as Request).url;
          const method: string = (init && init.method) || 'GET';

          const logEntry: NetworkLogEntry = {
            id: Utils.generateId(),
            method: method,
            url: url,
            type: 'fetch',
            status: 'Pending...',
            duration: '0ms',
            size: '—',
            reqBody: init ? init.body : null,
            resBody: '',
            startTime: startTime,
          };

          self.networkLogs.push(logEntry);

          return origFetch
            .apply(this, arguments as any)
            .then((response: Response): Response => {
              const clone: Response = response.clone();
              logEntry.status = response.status;
              logEntry.duration = Utils.formatDuration(Date.now() - startTime);
              clone
                .text()
                .then((text: string): void => {
                  logEntry.resBody = text;
                  if (self.activeTab === 'network') self.renderNetwork();
                })
                .catch((): void => {});
              return response;
            })
            .catch((err: Error): never => {
              logEntry.status = 'Failed';
              logEntry.duration = Utils.formatDuration(Date.now() - startTime);
              if (self.activeTab === 'network') self.renderNetwork();
              throw err;
            });
        };
      }
    },

    createUI(): void {
      if (document.getElementById('native-devtools-root')) return;

      const container: HTMLDivElement = document.createElement('div');
      container.id = 'native-devtools-root';
      container.innerHTML = `<style>:root{--ndt-bg:#0d1117;--ndt-surface:#161b22;--ndt-border:#30363d;--ndt-text:#c9d1d9;--ndt-text-dim:#8b949e;--ndt-accent:#58a6ff;--ndt-accent2:#00f2fe;--ndt-success:#56d364;--ndt-warning:#d29922;--ndt-error:#ff7b72;--ndt-font:"JetBrains Mono","Fira Code",Consolas,monospace;}#native-devtools-root{position:fixed;bottom:0;left:0;right:0;height:55vh;background:var(--ndt-bg);color:var(--ndt-text);font-family:var(--ndt-font);font-size:12px;z-index:999999;display:flex;flex-direction:column;border-top:2px solid var(--ndt-accent2);box-shadow:0 -4px 30px rgba(0,242,254,0.15);transition:height 0.3s ease;}.ndt-header{display:flex;background:var(--ndt-surface);border-bottom:1px solid var(--ndt-border);overflow-x:auto;user-select:none;}.ndt-tab{padding:8px 16px;cursor:pointer;border-bottom:2px solid transparent;color:var(--ndt-text-dim);font-weight:600;white-space:nowrap;transition:all 0.15s ease;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;}.ndt-tab:hover{color:var(--ndt-text);background:rgba(88,166,255,0.05);}.ndt-tab.active{color:var(--ndt-accent2);border-bottom-color:var(--ndt-accent2);background:rgba(0,242,254,0.08);}.ndt-body{flex:1;overflow:auto;padding:12px;}.ndt-actions{display:flex;margin-left:auto;align-items:center;padding-right:8px;gap:4px;}.ndt-btn{background:var(--ndt-surface);border:1px solid var(--ndt-border);color:var(--ndt-text);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;transition:all 0.15s ease;}.ndt-btn:hover{background:#21262d;border-color:var(--ndt-accent);}.ndt-log{padding:4px 6px;border-bottom:1px solid #21262d;word-break:break-all;}.ndt-log.error{color:var(--ndt-error);background:rgba(255,123,114,0.08);}.ndt-log.warn{color:var(--ndt-warning);background:rgba(210,153,34,0.08);}.ndt-log.info{color:var(--ndt-accent);}.ndt-input-bar{display:flex;border-top:1px solid var(--ndt-border);}.ndt-input{flex:1;background:var(--ndt-bg);border:none;color:#4af626;padding:8px;outline:none;font-family:var(--ndt-font);font-size:12px;}.ndt-badge{display:inline-block;background:var(--ndt-accent);color:#000;font-size:10px;padding:1px 5px;border-radius:10px;margin-left:4px;font-weight:bold;}.ndt-filter-bar{display:flex;gap:6px;padding:6px 0;border-bottom:1px solid var(--ndt-border);margin-bottom:8px;flex-wrap:wrap;align-items:center;}.ndt-filter-btn{padding:3px 8px;border-radius:4px;cursor:pointer;font-size:10px;border:1px solid var(--ndt-border);background:transparent;color:var(--ndt-text-dim);transition:all 0.15s ease;}.ndt-filter-btn.active{background:var(--ndt-accent);color:#000;border-color:var(--ndt-accent);}.ndt-search{flex:1;min-width:80px;background:var(--ndt-bg);border:1px solid var(--ndt-border);color:var(--ndt-text);padding:4px 8px;border-radius:4px;font-family:var(--ndt-font);font-size:11px;outline:none;}.ndt-table{width:100%;border-collapse:collapse;}.ndt-table th{text-align:left;padding:6px 8px;color:var(--ndt-accent2);font-size:10px;text-transform:uppercase;letter-spacing:0.5px;}.ndt-table td{padding:4px 8px;border-bottom:1px solid #21262d;font-size:11px;}.ndt-metric-card{display:inline-block;background:var(--ndt-surface);border:1px solid var(--ndt-border);border-radius:8px;padding:12px;margin:4px;min-width:100px;}.ndt-metric-value{font-size:20px;font-weight:bold;color:var(--ndt-accent2);}.ndt-metric-label{font-size:10px;color:var(--ndt-text-dim);text-transform:uppercase;}</style><div class="ndt-header"><div class="ndt-tab active" data-tab="elements">Elements</div><div class="ndt-tab" data-tab="console">Console <span class="ndt-badge" id="ndt-console-count">0</span></div><div class="ndt-tab" data-tab="network">Network <span class="ndt-badge" id="ndt-network-count">0</span></div><div class="ndt-tab" data-tab="storage">Storage</div><div class="ndt-tab" data-tab="performance">Performance</div><div class="ndt-tab" data-tab="scraper">Scraper</div><div class="ndt-tab" data-tab="settings">Settings</div><div class="ndt-actions"><button class="ndt-btn" id="ndt-btn-min">_</button><button class="ndt-btn" id="ndt-btn-close">X</button></div></div><div class="ndt-body" id="ndt-body-content"></div><div class="ndt-input-bar" id="ndt-console-bar" style="display:none;"><span style="color:var(--ndt-accent2);padding:8px 0 8px 8px;">&gt;</span><input class="ndt-input" id="ndt-eval-input" placeholder="Execute JavaScript..." /></div>`;

      document.body.appendChild(container);
      this.renderElements();
    },

    bindEvents(): void {
      const self = this;

      document.querySelectorAll('.ndt-tab').forEach((tab: Element): void => {
        tab.addEventListener('click', (e: Event): void => {
          const tabEl: HTMLElement | null = (e.target as HTMLElement).closest('.ndt-tab');
          if (!tabEl) return;
          document.querySelectorAll('.ndt-tab').forEach((t: Element): void => {
            t.classList.remove('active');
          });
          tabEl.classList.add('active');
          self.activeTab = tabEl.getAttribute('data-tab') as TabName;
          const consoleBar: HTMLElement | null = document.getElementById('ndt-console-bar');
          if (consoleBar) consoleBar.style.display = self.activeTab === 'console' ? 'flex' : 'none';
          self.render();
        });
      });

      document.getElementById('ndt-btn-close')!.addEventListener('click', (): void => {
        document.getElementById('native-devtools-root')!.remove();
        window.__NATIVE_DEVTOOLS_INSTALLED__ = false;
      });

      document.getElementById('ndt-btn-min')!.addEventListener('click', (): void => {
        const root: HTMLElement = document.getElementById('native-devtools-root')!;
        root.style.height = root.style.height === '35px' ? '55vh' : '35px';
      });

      document.getElementById('ndt-eval-input')!.addEventListener('keydown', (e: KeyboardEvent): void => {
        if (e.key === 'Enter') {
          const val: string = (e.target as HTMLInputElement).value;
          if (!val) return;
          self.consoleLogs.push({ type: 'info', time: new Date().toLocaleTimeString(), message: '> ' + val, count: 1 });
          try {
            const res: any = eval(val);
            self.consoleLogs.push({ type: 'log', time: new Date().toLocaleTimeString(), message: String(res), count: 1 });
          } catch (err: any) {
            self.consoleLogs.push({ type: 'error', time: new Date().toLocaleTimeString(), message: err.message, count: 1 });
          }
          (e.target as HTMLInputElement).value = '';
          self.renderConsole();
        }
      });
    },

    render(): void {
      this.updateBadges();
      switch (this.activeTab) {
        case 'elements': this.renderElements(); break;
        case 'console': this.renderConsole(); break;
        case 'network': this.renderNetwork(); break;
        case 'storage': this.renderStorage(); break;
        case 'performance': this.renderPerformance(); break;
        case 'scraper': this.renderScraper(); break;
        case 'settings': this.renderSettings(); break;
      }
    },

    updateBadges(): void {
      const cb: HTMLElement | null = document.getElementById('ndt-console-count');
      const nb: HTMLElement | null = document.getElementById('ndt-network-count');
      if (cb) cb.textContent = String(this.consoleLogs.length);
      if (nb) nb.textContent = String(this.networkLogs.length);
    },

    renderElements(): void {
      const body: HTMLElement | null = document.getElementById('ndt-body-content');
      if (!body) return;
      const html: string = document.documentElement.outerHTML;
      const truncated: string = html.length > 12000 ? html.substring(0, 12000) + '\n... [truncated]' : html;
      body.innerHTML = `<div><h4 style="color:var(--ndt-accent2);margin:0 0 8px 0;">DOM Explorer</h4><input class="ndt-search" placeholder="Filter elements..." style="margin-bottom:8px;width:100%;" /><pre style="white-space:pre-wrap;word-break:break-all;color:#7ee787;max-height:400px;overflow:auto;background:var(--ndt-surface);padding:12px;border-radius:8px;border:1px solid var(--ndt-border);">${Utils.escapeHTML(truncated)}</pre></div>`;
    },

    renderConsole(): void {
      const body: HTMLElement | null = document.getElementById('ndt-body-content');
      if (!body) return;
      const self = this;

      const ce: number = this.consoleLogs.length;
      const ceE: number = this.consoleLogs.filter((l: ConsoleLogEntry): boolean => l.type === 'error').length;
      const ceW: number = this.consoleLogs.filter((l: ConsoleLogEntry): boolean => l.type === 'warn').length;

      body.innerHTML = `<div class="ndt-filter-bar"><button class="ndt-filter-btn active" data-filter="all">All (${ce})</button><button class="ndt-filter-btn" data-filter="error">Errors (${ceE})</button><button class="ndt-filter-btn" data-filter="warn">Warnings (${ceW})</button><input class="ndt-search" id="ndt-csearch" placeholder="Search..." /><button class="ndt-btn" id="ndt-cclear">Clear</button></div><div id="ndt-centries">${this.consoleLogs
        .map(
          (l: ConsoleLogEntry): string =>
            `<div class="ndt-log ${l.type}" data-type="${l.type}"><span style="color:var(--ndt-text-dim);">[${l.time}]</span> <b>${l.type.toUpperCase()}:</b> ${Utils.escapeHTML(l.message)}${l.count > 1 ? '<span class="ndt-badge">' + l.count + '</span>' : ''}</div>`
        )
        .join('') || '<div style="color:var(--ndt-text-dim);">Console is empty.</div>'}</div>`;

      body.querySelectorAll('.ndt-filter-btn').forEach((btn: Element): void => {
        btn.addEventListener('click', (e: Event): void => {
          body.querySelectorAll('.ndt-filter-btn').forEach((b: Element): void => {
            b.classList.remove('active');
          });
          (e.target as HTMLElement).classList.add('active');
          const f: string | null = (e.target as HTMLElement).getAttribute('data-filter');
          body.querySelectorAll('#ndt-centries .ndt-log').forEach((log: Element): void => {
            (log as HTMLElement).style.display = f === 'all' || log.getAttribute('data-type') === f ? '' : 'none';
          });
        });
      });

      document.getElementById('ndt-csearch')!.addEventListener('input', (e: Event): void => {
        const q: string = (e.target as HTMLInputElement).value.toLowerCase();
        body.querySelectorAll('#ndt-centries .ndt-log').forEach((log: Element): void => {
          (log as HTMLElement).style.display = log.textContent!.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
        });
      });

      document.getElementById('ndt-cclear')!.addEventListener('click', (): void => {
        self.consoleLogs.length = 0;
        self.renderConsole();
      });

      body.scrollTop = body.scrollHeight;
    },

    renderNetwork(): void {
      const body: HTMLElement | null = document.getElementById('ndt-body-content');
      if (!body) return;
      const self = this;

      body.innerHTML = `<div class="ndt-filter-bar"><button class="ndt-filter-btn active" data-nt="all">All</button><button class="ndt-filter-btn" data-nt="xhr">XHR</button><button class="ndt-filter-btn" data-nt="fetch">Fetch</button><button class="ndt-filter-btn" data-nt="img">Img</button><button class="ndt-filter-btn" data-nt="script">JS</button><input class="ndt-search" id="ndt-nsearch" placeholder="Filter URL..." /><button class="ndt-btn" id="ndt-nclear">Clear</button></div><table class="ndt-table"><thead><tr><th>Method</th><th>Type</th><th>URL</th><th>Status</th><th>Duration</th></tr></thead><tbody id="ndt-ntbody">${this.networkLogs
        .map(
          (n: NetworkLogEntry): string =>
            `<tr data-nt="${n.type}"><td style="color:#79c0ff;font-weight:bold;">${n.method}</td><td style="color:#d2a8ff;">${n.type.toUpperCase()}</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Utils.escapeHTML(n.url)}</td><td style="color:${typeof n.status === 'number' && n.status >= 200 && n.status < 300 ? '#56d364' : '#ff7b72'};font-weight:bold;">${n.status}</td><td style="color:var(--ndt-text-dim);">${n.duration}</td></tr>`
        )
        .join('')}</tbody></table>`;

      body.querySelectorAll('.ndt-filter-btn[data-nt]').forEach((btn: Element): void => {
        btn.addEventListener('click', (e: Event): void => {
          body.querySelectorAll('.ndt-filter-btn[data-nt]').forEach((b: Element): void => {
            b.classList.remove('active');
          });
          (e.target as HTMLElement).classList.add('active');
          const f: string | null = (e.target as HTMLElement).getAttribute('data-nt');
          body.querySelectorAll('#ndt-ntbody tr').forEach((row: Element): void => {
            (row as HTMLElement).style.display = f === 'all' || row.getAttribute('data-nt') === f ? '' : 'none';
          });
        });
      });

      document.getElementById('ndt-nsearch')!.addEventListener('input', (e: Event): void => {
        const q: string = (e.target as HTMLInputElement).value.toLowerCase();
        body.querySelectorAll('#ndt-ntbody tr').forEach((row: Element): void => {
          (row as HTMLElement).style.display = row.textContent!.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
        });
      });

      document.getElementById('ndt-nclear')!.addEventListener('click', (): void => {
        self.networkLogs.length = 0;
        self.renderNetwork();
      });
    },

    renderStorage(): void {
      const body: HTMLElement | null = document.getElementById('ndt-body-content');
      if (!body) return;
      const c: string = document.cookie;
      let l: string;
      let s: string;
      try { l = JSON.stringify(localStorage, null, 2); } catch (e) { l = 'N/A'; }
      try { s = JSON.stringify(sessionStorage, null, 2); } catch (e) { s = 'N/A'; }
      body.innerHTML = `<h4 style="color:var(--ndt-accent2);">Cookies</h4><div class="ndt-log" style="background:var(--ndt-surface);padding:8px;border-radius:6px;">${c || 'None'}</div><h4 style="color:var(--ndt-accent2);margin-top:16px;">Local Storage</h4><pre class="ndt-log" style="background:var(--ndt-surface);padding:8px;border-radius:6px;max-height:150px;overflow:auto;">${Utils.escapeHTML(l)}</pre><h4 style="color:var(--ndt-accent2);margin-top:16px;">Session Storage</h4><pre class="ndt-log" style="background:var(--ndt-surface);padding:8px;border-radius:6px;max-height:150px;overflow:auto;">${Utils.escapeHTML(s)}</pre>`;
    },

    renderPerformance(): void {
      const body: HTMLElement | null = document.getElementById('ndt-body-content');
      if (!body) return;
      const nav: PerformanceEntry | undefined = (performance.getEntriesByType('navigation') as PerformanceEntry[])[0];
      const paint: PerformanceEntry[] = performance.getEntriesByType('paint') as PerformanceEntry[];
      const fcp: PerformanceEntry | undefined = paint.find((e: PerformanceEntry): boolean => e.name === 'first-contentful-paint');
      const fp: PerformanceEntry | undefined = paint.find((e: PerformanceEntry): boolean => e.name === 'first-paint');
      body.innerHTML = `<h4 style="color:var(--ndt-accent2);margin-top:0;">Performance</h4><div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;"><div class="ndt-metric-card"><div class="ndt-metric-value">${fp ? Math.round(fp.startTime) : '—'}<span style="font-size:11px;">ms</span></div><div class="ndt-metric-label">First Paint</div></div><div class="ndt-metric-card"><div class="ndt-metric-value">${fcp ? Math.round(fcp.startTime) : '—'}<span style="font-size:11px;">ms</span></div><div class="ndt-metric-label">FCP</div></div><div class="ndt-metric-card"><div class="ndt-metric-value">${nav ? Math.round((nav as any).domContentLoadedEventEnd) : '—'}<span style="font-size:11px;">ms</span></div><div class="ndt-metric-label">DOM Loaded</div></div><div class="ndt-metric-card"><div class="ndt-metric-value">${performance.getEntriesByType('resource').length}</div><div class="ndt-metric-label">Resources</div></div><div class="ndt-metric-card"><div class="ndt-metric-value">${document.querySelectorAll('*').length}</div><div class="ndt-metric-label">DOM Nodes</div></div></div>`;
    },

    renderScraper(): void {
      const body: HTMLElement | null = document.getElementById('ndt-body-content');
      if (!body) return;
      const links: string[] = Array.from(document.querySelectorAll('a[href]')).map((a: HTMLAnchorElement): string => a.href);
      const imgs: string[] = Array.from(document.querySelectorAll('img')).map((i: HTMLImageElement): string => i.src);
      body.innerHTML = `<h4 style="color:var(--ndt-accent2);">Scraper Overview</h4><div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;"><div class="ndt-metric-card"><div class="ndt-metric-value">${links.length}</div><div class="ndt-metric-label">Links</div></div><div class="ndt-metric-card"><div class="ndt-metric-value">${imgs.length}</div><div class="ndt-metric-label">Images</div></div></div><h4 style="color:var(--ndt-accent2);">Links</h4><div style="max-height:120px;overflow:auto;background:var(--ndt-surface);padding:8px;border-radius:6px;">${links
        .slice(0, 15)
        .map((l: string): string => `<div style="padding:2px 0;font-size:11px;">${Utils.escapeHTML(l)}</div>`)
        .join('')}</div><div style="margin-top:12px;"><input class="ndt-search" id="ndt-ssel" placeholder="CSS Selector" style="width:100%;" /><button class="ndt-btn" id="ndt-srun" style="margin-top:4px;">Run Query</button><div id="ndt-sres" style="margin-top:8px;"></div></div>`;

      document.getElementById('ndt-srun')!.addEventListener('click', (): void => {
        const sel: HTMLInputElement | null = document.getElementById('ndt-ssel') as HTMLInputElement | null;
        const res: HTMLElement | null = document.getElementById('ndt-sres');
        if (!sel || !res) return;
        const s: string = sel.value.trim();
        if (!s) return;
        try {
          const els: NodeListOf<Element> = document.querySelectorAll(s);
          const results: Array<{ tag: string; text: string }> = Array.from(els)
            .slice(0, 50)
            .map((el: Element): { tag: string; text: string } => ({
              tag: el.tagName.toLowerCase(),
              text: el.textContent ? el.textContent.trim().substring(0, 100) : '',
            }));
          res.innerHTML = `<pre style="background:var(--ndt-surface);padding:8px;border-radius:6px;max-height:200px;overflow:auto;">${Utils.escapeHTML(JSON.stringify(results, null, 2))}</pre>`;
        } catch (err: any) {
          res.innerHTML = `<div class="ndt-log error">Error: ${Utils.escapeHTML(err.message)}</div>`;
        }
      });
    },

    renderSettings(): void {
      const body: HTMLElement | null = document.getElementById('ndt-body-content');
      if (!body) return;
      const self = this;

      body.innerHTML = `<h4 style="color:var(--ndt-accent2);margin-top:0;">Settings</h4><table class="ndt-table"><tr><td style="font-weight:bold;width:200px;">Theme</td><td><select id="ndt-stheme" style="background:var(--ndt-surface);color:var(--ndt-text);border:1px solid var(--ndt-border);padding:4px 8px;border-radius:4px;"><option value="dark" ${this.config.theme === 'dark' ? 'selected' : ''}>Dark</option><option value="light" ${this.config.theme === 'light' ? 'selected' : ''}>Light</option></select></td></tr><tr><td style="font-weight:bold;">Font Size</td><td><input type="range" id="ndt-sfont" min="10" max="16" value="${this.config.fontSize}" /><span id="ndt-sfontv"> ${this.config.fontSize}px</span></td></tr></table><div style="margin-top:16px;"><button class="ndt-btn" id="ndt-sreset">Reset Settings</button></div>`;

      document.getElementById('ndt-stheme')!.addEventListener('change', (e: Event): void => {
        self.config.theme = (e.target as HTMLSelectElement).value as 'dark' | 'light';
        const root: HTMLElement | null = document.getElementById('native-devtools-root');
        if (root) {
          if (self.config.theme === 'light') {
            root.style.setProperty('--ndt-bg', '#fff');
            root.style.setProperty('--ndt-surface', '#f6f8fa');
            root.style.setProperty('--ndt-border', '#d0d7de');
            root.style.setProperty('--ndt-text', '#1f2328');
            root.style.setProperty('--ndt-text-dim', '#656d76');
          } else {
            root.style.setProperty('--ndt-bg', '#0d1117');
            root.style.setProperty('--ndt-surface', '#161b22');
            root.style.setProperty('--ndt-border', '#30363d');
            root.style.setProperty('--ndt-text', '#c9d1d9');
            root.style.setProperty('--ndt-text-dim', '#8b949e');
          }
        }
      });

      document.getElementById('ndt-sfont')!.addEventListener('input', (e: Event): void => {
        self.config.fontSize = parseInt((e.target as HTMLInputElement).value);
        document.getElementById('ndt-sfontv')!.textContent = ' ' + self.config.fontSize + 'px';
        document.getElementById('native-devtools-root')!.style.fontSize = self.config.fontSize + 'px';
      });

      document.getElementById('ndt-sreset')!.addEventListener('click', (): void => {
        self.config = { theme: 'dark', fontSize: 12, maxConsoleEntries: 500, showTimestamps: true, networkFilter: 'all' };
        self.renderSettings();
      });
    },
  };

  DevTools.init();
})();

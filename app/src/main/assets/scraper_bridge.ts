/**
 * Scraper Bridge v3.0 — TypeScript Source
 */

interface LinkInfo {
  text: string;
  href: string;
  title: string;
  rel: string;
  target: string;
}

interface ImageInfo {
  src: string;
  alt: string;
  width: number;
  height: number;
}

interface VideoInfo {
  src: string;
  type: string;
  poster: string;
}

interface AudioInfo {
  src: string;
  type: string;
}

interface MediaInfo {
  images: ImageInfo[];
  videos: VideoInfo[];
  audios: AudioInfo[];
}

interface TableData {
  tableIndex: number;
  headers: string[];
  rows: string[][];
}

interface FormInput {
  type: string;
  name: string;
  value: string;
  placeholder: string;
  required: boolean;
}

interface FormData {
  formIndex: number;
  action: string;
  method: string;
  inputs: FormInput[];
}

interface StorageData {
  cookie: string;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

interface SelectorResult {
  tagName: string;
  text: string;
  html: string;
  attributes: Record<string, string>;
}

interface PerformanceMetricsData {
  firstPaint: number | null;
  firstContentfulPaint: number | null;
  resources: number;
}

interface ScraperBridgeNamespace {
  getText(): string;
  getMetaData(): string;
  getHTML(): string;
  getAllLinks(): string;
  getAllMedia(): string;
  getTables(): string;
  getStorageAndCookies(): string;
  querySelectorAllData(selector: string): string;
  getPerformanceMetrics(): string;
  getAllForms(): string;
}

declare global {
  interface Window {
    __scraperBridgeLoaded?: boolean;
    ScraperBridge?: ScraperBridgeNamespace;
  }
}

(function (): void {
  if (window.__scraperBridgeLoaded) return;
  window.__scraperBridgeLoaded = true;

  window.ScraperBridge = {
    getText(): string {
      return document.body ? document.body.innerText : '';
    },

    getMetaData(): string {
      const meta: Record<string, string> = {
        title: document.title || '',
        url: window.location.href,
        charset: document.characterSet || '',
        language: document.documentElement.lang || '',
      };

      const metas: HTMLCollectionOf<HTMLMetaElement> = document.getElementsByTagName('meta');
      for (let i: number = 0; i < metas.length; i++) {
        const el: HTMLMetaElement = metas[i];
        const name: string | null = el.getAttribute('name') || el.getAttribute('property') || el.getAttribute('http-equiv');
        const content: string = el.getAttribute('content') || '';
        if (name) meta[name] = content;
      }

      return JSON.stringify(meta, null, 2);
    },

    getHTML(): string {
      return document.documentElement.outerHTML;
    },

    getAllLinks(): string {
      const links: LinkInfo[] = [];
      document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a: HTMLAnchorElement): void => {
        links.push({
          text: a.innerText.trim(),
          href: a.href,
          title: a.getAttribute('title') || '',
          rel: a.getAttribute('rel') || '',
          target: a.getAttribute('target') || '',
        });
      });
      return JSON.stringify(links, null, 2);
    },

    getAllMedia(): string {
      const media: MediaInfo = { images: [], videos: [], audios: [] };

      document.querySelectorAll<HTMLImageElement>('img').forEach((img: HTMLImageElement): void => {
        if (img.src) {
          media.images.push({
            src: img.src,
            alt: img.alt || '',
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
          });
        }
      });

      document.querySelectorAll<HTMLVideoElement>('video').forEach((v: HTMLVideoElement): void => {
        if (v.src) {
          media.videos.push({ src: v.src, type: 'video', poster: v.poster || '' });
        }
        v.querySelectorAll<HTMLSourceElement>('source').forEach((s: HTMLSourceElement): void => {
          if (s.src) {
            media.videos.push({ src: s.src, type: s.type || 'video', poster: '' });
          }
        });
      });

      document.querySelectorAll<HTMLAudioElement>('audio').forEach((a: HTMLAudioElement): void => {
        if (a.src) {
          media.audios.push({ src: a.src, type: 'audio' });
        }
        a.querySelectorAll<HTMLSourceElement>('source').forEach((s: HTMLSourceElement): void => {
          if (s.src) {
            media.audios.push({ src: s.src, type: s.type || 'audio' });
          }
        });
      });

      return JSON.stringify(media, null, 2);
    },

    getTables(): string {
      const tablesData: TableData[] = [];

      document.querySelectorAll<HTMLTableElement>('table').forEach((table: HTMLTableElement, tIdx: number): void => {
        const headers: string[] = [];
        const rows: string[][] = [];

        table.querySelectorAll<HTMLTableCellElement>('thead th, tr:first-child th').forEach((th: HTMLTableCellElement): void => {
          headers.push(th.innerText.trim());
        });

        table.querySelectorAll<HTMLTableRowElement>('tbody tr, tr').forEach((tr: HTMLTableRowElement): void => {
          const cells: string[] = [];
          tr.querySelectorAll<HTMLTableCellElement>('td, th').forEach((td: HTMLTableCellElement): void => {
            cells.push(td.innerText.trim());
          });
          if (cells.length > 0) rows.push(cells);
        });

        tablesData.push({ tableIndex: tIdx + 1, headers, rows });
      });

      return JSON.stringify(tablesData, null, 2);
    },

    getStorageAndCookies(): string {
      const data: StorageData = {
        cookie: document.cookie || '',
        localStorage: {},
        sessionStorage: {},
      };

      try {
        for (let i: number = 0; i < localStorage.length; i++) {
          const k: string | null = localStorage.key(i);
          if (k) data.localStorage[k] = localStorage.getItem(k) || '';
        }
      } catch (e) {}

      try {
        for (let j: number = 0; j < sessionStorage.length; j++) {
          const sk: string | null = sessionStorage.key(j);
          if (sk) data.sessionStorage[sk] = sessionStorage.getItem(sk) || '';
        }
      } catch (e) {}

      return JSON.stringify(data, null, 2);
    },

    querySelectorAllData(selector: string): string {
      try {
        const els: NodeListOf<Element> = document.querySelectorAll(selector);
        const res: SelectorResult[] = [];

        els.forEach((el: Element): void => {
          const attributes: Record<string, string> = {};
          Array.from(el.attributes).forEach((attr: Attr): void => {
            attributes[attr.name] = attr.value;
          });
          res.push({
            tagName: el.tagName.toLowerCase(),
            text: el.textContent ? el.textContent.trim() : '',
            html: el.outerHTML,
            attributes,
          });
        });

        return JSON.stringify(res, null, 2);
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },

    getPerformanceMetrics(): string {
      const data: PerformanceMetricsData = {
        firstPaint: null,
        firstContentfulPaint: null,
        resources: 0,
      };

      try {
        const paint: PerformanceEntry[] = performance.getEntriesByType('paint') as PerformanceEntry[];
        const fp: PerformanceEntry | undefined = paint.find((e: PerformanceEntry): boolean => e.name === 'first-paint');
        const fcp: PerformanceEntry | undefined = paint.find((e: PerformanceEntry): boolean => e.name === 'first-contentful-paint');
        if (fp) data.firstPaint = Math.round(fp.startTime);
        if (fcp) data.firstContentfulPaint = Math.round(fcp.startTime);
        data.resources = performance.getEntriesByType('resource').length;
      } catch (e) {}

      return JSON.stringify(data, null, 2);
    },

    getAllForms(): string {
      const forms: FormData[] = [];

      document.querySelectorAll<HTMLFormElement>('form').forEach((form: HTMLFormElement, idx: number): void => {
        const inputs: FormInput[] = [];

        form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select').forEach(
          (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void => {
            inputs.push({
              type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
              name: el.name || '',
              value: el.value || '',
              placeholder: (el as HTMLInputElement).placeholder || '',
              required: (el as HTMLInputElement).required || false,
            });
          }
        );

        forms.push({
          formIndex: idx + 1,
          action: form.action || '',
          method: (form.method || 'GET').toUpperCase(),
          inputs,
        });
      });

      return JSON.stringify(forms, null, 2);
    },
  };
})();

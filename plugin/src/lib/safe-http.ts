/**
 * Safe HTTP client using iina.http when available, with fallback to system curl via utils.exec.
 * Using native iina.http prevents the macOS Catalina Foundation bug where utils.exec spawns
 * persistent NSFileHandle.readabilityHandler dispatch sources that spin at 100% CPU.
 */

import type { DebugLogger } from "./debug-log";

export interface SafeHttpResponse<T = unknown> {
  status: number;
  statusCode: number;
  data: T;
  text: string;
}

export interface SafeHttpRequestOptions<T = unknown> {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  data?: T;
  timeoutSeconds?: number;
}

export interface SafeHttp {
  get<T = unknown>(url: string, options?: SafeHttpRequestOptions): Promise<SafeHttpResponse<T>>;
  post<T = unknown>(url: string, options?: SafeHttpRequestOptions): Promise<SafeHttpResponse<T>>;
  put<T = unknown>(url: string, options?: SafeHttpRequestOptions): Promise<SafeHttpResponse<T>>;
  delete<T = unknown>(url: string, options?: SafeHttpRequestOptions): Promise<SafeHttpResponse<T>>;
  download(url: string, destPath: string, timeoutSeconds?: number): Promise<void>;
}

export function createSafeHttp(utils: typeof iina.utils, log?: DebugLogger, iinaHttp?: typeof iina.http): SafeHttp {
  async function request<T = unknown>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    options?: SafeHttpRequestOptions,
  ): Promise<SafeHttpResponse<T>> {
    let finalUrl = url;

    if (options?.params) {
      const q = Object.entries(options.params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
      if (q) {
        finalUrl += (finalUrl.includes("?") ? "&" : "?") + q;
      }
    }

    // 1. Prefer native iina.http (uses URLSession, doesn't leak file descriptors or spin CPU on Catalina)
    const methodLower = method.toLowerCase() as "get" | "post" | "put" | "delete";
    if (iinaHttp && typeof (iinaHttp as any)[methodLower] === "function") {
      if (log) {
        log(`[safeHttp:native] ${method} ${finalUrl}`);
      }
      try {
        const reqOpts: Record<string, unknown> = {};
        if (options?.headers) {
          reqOpts.headers = options.headers;
        }
        if (options?.params) {
          reqOpts.params = options.params;
        }
        if (options?.data !== undefined && options?.data !== null) {
          reqOpts.data = options.data;
        }

        const fn = (iinaHttp as any)[methodLower].bind(iinaHttp);
        const res = await fn(finalUrl, reqOpts);

        let data = res?.data;
        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch {
            // keep as string
          }
        }
        const status = typeof res?.status === "number" ? res.status : 200;
        const text = typeof res?.data === "string" ? res.data : typeof res?.text === "string" ? res.text : JSON.stringify(res?.data ?? "");

        return {
          status,
          statusCode: status,
          data: data as T,
          text,
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (log) log.error(`[safeHttp:native] ${method} failed: ${errMsg}`);
        throw err;
      }
    }

    // 2. Fallback: system curl via utils.exec (e.g. in test runner or headless environments)
    const timeout = options?.timeoutSeconds ?? 15;
    const args: string[] = ["-s", "-S", "-L", "--max-time", String(timeout), "-X", method];

    if (options?.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        args.push("-H", `${k}: ${v}`);
      }
    }

    if (options?.data !== undefined && options?.data !== null) {
      const payload = typeof options.data === "string" ? options.data : JSON.stringify(options.data);
      args.push("-d", payload);
    }

    // Append status code on a newline after the response body
    args.push("-w", "\n%{http_code}");
    args.push(finalUrl);

    if (log) {
      log(`[safeHttp:curl] ${method} ${finalUrl}`);
    }

    const res = await utils.exec("/usr/bin/curl", args);

    if (res.status !== 0 && !res.stdout) {
      const errMsg = `curl ${method} failed with exit code ${res.status}: ${res.stderr || "unknown error"}`;
      if (log) log.error(`[safeHttp:curl] ${errMsg}`);
      throw new Error(errMsg);
    }

    const stdout = res.stdout || "";
    const lastNl = stdout.lastIndexOf("\n");
    let body = stdout;
    let statusCode = 200;

    if (lastNl !== -1) {
      body = stdout.substring(0, lastNl);
      const codeStr = stdout.substring(lastNl + 1).trim();
      const parsed = parseInt(codeStr, 10);
      if (!isNaN(parsed) && parsed > 0) {
        statusCode = parsed;
      }
    }

    let data: unknown = body;
    if (body) {
      try {
        data = JSON.parse(body);
      } catch {
        // Response is plain text
      }
    }

    return {
      status: statusCode,
      statusCode,
      data: data as T,
      text: body,
    };
  }

  async function download(url: string, destPath: string, timeoutSeconds = 30): Promise<void> {
    const resolved = typeof utils.resolvePath === "function" ? utils.resolvePath(destPath) : destPath;

    // 1. Prefer native iina.http.download if available
    if (iinaHttp && typeof iinaHttp.download === "function") {
      if (log) {
        log(`[safeHttp:native] Download ${url} -> ${resolved}`);
      }
      try {
        await iinaHttp.download(url, resolved);
        return;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (log) log.error(`[safeHttp:native] Download failed: ${errMsg}`);
        throw err;
      }
    }

    // 2. Fallback: curl via utils.exec
    if (log) {
      log(`[safeHttp:curl] Download ${url} -> ${resolved}`);
    }

    if (resolved && resolved.includes("/")) {
      const dir = resolved.substring(0, resolved.lastIndexOf("/"));
      try {
        await utils.exec("/bin/mkdir", ["-p", dir]);
      } catch {
        // Ignore mkdir errors
      }
    }

    const args = ["-s", "-S", "-f", "-L", "--max-time", String(timeoutSeconds), "-o", resolved, url];

    const res = await utils.exec("/usr/bin/curl", args);
    if (res.status !== 0) {
      const errMsg = `curl download failed with exit code ${res.status}: ${res.stderr || "unknown error"}`;
      if (log) log.error(`[safeHttp:curl] ${errMsg}`);
      throw new Error(errMsg);
    }
  }

  return {
    get: <T = unknown>(url: string, opts?: SafeHttpRequestOptions) => request<T>("GET", url, opts),
    post: <T = unknown>(url: string, opts?: SafeHttpRequestOptions) => request<T>("POST", url, opts),
    put: <T = unknown>(url: string, opts?: SafeHttpRequestOptions) => request<T>("PUT", url, opts),
    delete: <T = unknown>(url: string, opts?: SafeHttpRequestOptions) => request<T>("DELETE", url, opts),
    download,
  };
}

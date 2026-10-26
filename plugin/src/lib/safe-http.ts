/**
 * Safe HTTP client using iina.utils.exec with system curl.
 * Bypasses iina.http which crashes IINA 1.5.0 on background NSURLSession callbacks.
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

export function createSafeHttp(
  utils: typeof iina.utils,
  log?: DebugLogger,
): SafeHttp {
  async function request<T = unknown>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    options?: SafeHttpRequestOptions,
  ): Promise<SafeHttpResponse<T>> {
    const timeout = options?.timeoutSeconds ?? 15;
    let finalUrl = url;

    if (options?.params) {
      const q = Object.entries(options.params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
      if (q) {
        finalUrl += (finalUrl.includes("?") ? "&" : "?") + q;
      }
    }

    const args: string[] = [
      "-s",
      "-S",
      "-L",
      "--max-time",
      String(timeout),
      "-X",
      method,
    ];

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
      log(`[safeHttp] ${method} ${finalUrl}`);
    }

    const res = await utils.exec("/usr/bin/curl", args);

    if (res.status !== 0 && !res.stdout) {
      const errMsg = `curl ${method} failed with exit code ${res.status}: ${res.stderr || "unknown error"}`;
      if (log) log.error(`[safeHttp] ${errMsg}`);
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
    if (log) {
      log(`[safeHttp] Download ${url} -> ${resolved}`);
    }

    if (resolved && resolved.includes("/")) {
      const dir = resolved.substring(0, resolved.lastIndexOf("/"));
      try {
        await utils.exec("/bin/mkdir", ["-p", dir]);
      } catch {
        // Ignore mkdir errors
      }
    }

    const args = [
      "-s",
      "-S",
      "-f",
      "-L",
      "--max-time",
      String(timeoutSeconds),
      "-o",
      resolved,
      url,
    ];

    const res = await utils.exec("/usr/bin/curl", args);
    if (res.status !== 0) {
      const errMsg = `curl download failed with exit code ${res.status}: ${res.stderr || "unknown error"}`;
      if (log) log.error(`[safeHttp] ${errMsg}`);
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

// Plane API client — mirrors plane-mcp-server/src/plane-client.js
type ReqOpts = { noCache?: boolean };

export class PlaneClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async request(method: string, path: string, body?: object, opts: ReqOpts = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { "X-API-Key": this.apiKey, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      ...(opts.noCache ? { cache: "no-store" } : { next: { revalidate: 300 } }),
    } as RequestInit);
    if (!res.ok) throw new Error(`Plane API ${method} ${path} → ${res.status}`);
    if (res.status === 204) return null;
    return res.json();
  }

  get(path: string, opts?: ReqOpts)               { return this.request("GET", path, undefined, opts); }
  post(path: string, body: object)                { return this.request("POST", path, body); }
  patch(path: string, body: object)               { return this.request("PATCH", path, body); }
  delete(path: string)                            { return this.request("DELETE", path); }

  // Projects
  listProjects(ws: string, opts?: ReqOpts)                        { return this.get(`/api/v1/workspaces/${ws}/projects/`, opts); }

  // Members
  listProjectMembers(ws: string, pid: string, opts?: ReqOpts)     { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/members/`, opts); }
  listWorkspaceMembers(ws: string, opts?: ReqOpts)                { return this.get(`/api/v1/workspaces/${ws}/members/`, opts); }

  // Issues
  listIssues(ws: string, pid: string, params = "", opts?: ReqOpts) { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/issues/?per_page=250${params}`, opts); }

  // States / Labels
  listStates(ws: string, pid: string, opts?: ReqOpts)             { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/states/`, opts); }
  listLabels(ws: string, pid: string, opts?: ReqOpts)             { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/labels/`, opts); }

  // Cycles
  listCycles(ws: string, pid: string, opts?: ReqOpts)             { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/cycles/`, opts); }
  listCycleIssues(ws: string, pid: string, cid: string, opts?: ReqOpts) { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/cycles/${cid}/cycle-issues/`, opts); }

  // Modules
  listModules(ws: string, pid: string, opts?: ReqOpts)            { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/modules/`, opts); }
  listModuleIssues(ws: string, pid: string, mid: string, opts?: ReqOpts) { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/modules/${mid}/module-issues/`, opts); }
}

// Plane API client — mirrors plane-mcp-server/src/plane-client.js
export class PlaneClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async request(method: string, path: string, body?: object) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { "X-API-Key": this.apiKey, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      next: { revalidate: 300 },
    } as RequestInit);
    if (!res.ok) throw new Error(`Plane API ${method} ${path} → ${res.status}`);
    if (res.status === 204) return null;
    return res.json();
  }

  get(path: string)                   { return this.request("GET", path); }
  post(path: string, body: object)    { return this.request("POST", path, body); }
  patch(path: string, body: object)   { return this.request("PATCH", path, body); }
  delete(path: string)                { return this.request("DELETE", path); }

  // Projects
  listProjects(ws: string)                        { return this.get(`/api/v1/workspaces/${ws}/projects/`); }

  // Members
  listProjectMembers(ws: string, pid: string)     { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/members/`); }
  listWorkspaceMembers(ws: string)                { return this.get(`/api/v1/workspaces/${ws}/members/`); }

  // Issues
  listIssues(ws: string, pid: string, params = "") { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/issues/?per_page=250${params}`); }

  // States / Labels
  listStates(ws: string, pid: string)             { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/states/`); }
  listLabels(ws: string, pid: string)             { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/labels/`); }

  // Cycles
  listCycles(ws: string, pid: string)             { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/cycles/`); }
  listCycleIssues(ws: string, pid: string, cid: string) { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/cycles/${cid}/cycle-issues/`); }

  // Modules
  listModules(ws: string, pid: string)            { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/modules/`); }
  listModuleIssues(ws: string, pid: string, mid: string) { return this.get(`/api/v1/workspaces/${ws}/projects/${pid}/modules/${mid}/module-issues/`); }
}

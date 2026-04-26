import "server-only";
import { createAppFetch, fetchJson, AppApiError } from "@/lib/app-clients/base";
import type {
  CommitSummary,
  FileContent,
  IssueSummary,
  PullRequestSummary,
  RepoBranch,
  RepoEntry,
  RepoOwner,
  RepoSummary,
} from "./types";

/**
 * Native Gitea client. Uses a single admin Personal Access Token issued to
 * a service account (`portal-bridge`) so the same backend can serve every
 * portal user. Per-user attribution for write actions is achieved via the
 * `Sudo` header (Gitea standard) — the route handlers pass the requester's
 * Gitea login when known.
 */

const TOKEN = process.env.GITEA_BRIDGE_TOKEN;
const PUBLIC = process.env.GITEA_URL ?? "https://git.kineo360.work";
const INTERNAL = process.env.GITEA_INTERNAL_URL ?? "http://gitea:3000";

if (!TOKEN && process.env.NODE_ENV === "production") {
  console.warn("[gitea] GITEA_BRIDGE_TOKEN missing — Code calls will fail.");
}

const giteaFetch = createAppFetch({
  app: "gitea",
  origins: { internal: INTERNAL, public: PUBLIC },
  authHeaders: () => ({ Authorization: `token ${TOKEN ?? ""}` }),
});

/* ─────────────────────────────────────────────────────────────────────── */
/*                              Raw shapes                                 */
/* ─────────────────────────────────────────────────────────────────────── */

type RawOwner = {
  id: number;
  login: string;
  full_name?: string;
  avatar_url?: string;
};

type RawRepo = {
  id: number;
  name: string;
  full_name: string;
  description?: string | null;
  private: boolean;
  fork: boolean;
  default_branch: string;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  owner: RawOwner & { type?: string };
  stars_count: number;
  forks_count: number;
  open_issues_count: number;
  open_pr_counter?: number;
  size: number;
  updated_at: string;
  language?: string | null;
};

type RawBranch = {
  name: string;
  commit: {
    id: string;
    message: string;
    author?: { name?: string; email?: string };
    timestamp: string;
  };
  protected: boolean;
};

type RawIssue = {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  body?: string | null;
  labels?: { id: number; name: string; color: string }[];
  assignees?: RawOwner[];
  user: RawOwner;
  created_at: string;
  updated_at: string;
  comments: number;
  pull_request?: { merged: boolean; merged_at: string | null } | null;
  html_url: string;
};

type RawPR = RawIssue & {
  draft: boolean;
  merged: boolean;
  merged_at: string | null;
  head: { ref: string; sha: string; label: string };
  base: { ref: string; sha: string; label: string };
};

type RawCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
  };
  author?: RawOwner | null;
};

type RawEntry = {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  sha: string;
  html_url: string;
  download_url: string | null;
};

type RawFile = {
  name: string;
  path: string;
  encoding?: string | null;
  content?: string | null;
  size: number;
  sha: string;
};

/* ─────────────────────────────────────────────────────────────────────── */
/*                              Normalise                                  */
/* ─────────────────────────────────────────────────────────────────────── */

function normaliseOwner(o: RawOwner & { type?: string }): RepoOwner {
  return {
    id: o.id,
    login: o.login,
    fullName: o.full_name ?? o.login,
    avatarUrl: o.avatar_url ?? "",
    type: (o.type as "user" | "organization") ?? "user",
  };
}

function normaliseRepo(r: RawRepo): RepoSummary {
  return {
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    description: r.description ?? "",
    private: r.private,
    fork: r.fork,
    defaultBranch: r.default_branch,
    htmlUrl: r.html_url,
    cloneUrl: r.clone_url,
    sshUrl: r.ssh_url,
    owner: normaliseOwner(r.owner),
    stars: r.stars_count,
    forks: r.forks_count,
    openIssues: r.open_issues_count,
    openPulls: r.open_pr_counter ?? 0,
    size: r.size,
    updatedAt: r.updated_at,
    language: r.language ?? null,
  };
}

function normaliseBranch(b: RawBranch): RepoBranch {
  return {
    name: b.name,
    commit: {
      id: b.commit.id,
      message: b.commit.message,
      authorName: b.commit.author?.name ?? "",
      authorEmail: b.commit.author?.email ?? "",
      timestamp: b.commit.timestamp,
    },
    protected: b.protected,
  };
}

function normaliseEntry(e: RawEntry): RepoEntry {
  return {
    name: e.name,
    path: e.path,
    type: e.type,
    size: e.size,
    sha: e.sha,
    htmlUrl: e.html_url,
    downloadUrl: e.download_url,
  };
}

function normaliseIssue(i: RawIssue): IssueSummary {
  return {
    id: i.id,
    number: i.number,
    title: i.title,
    state: i.state,
    body: i.body ?? "",
    labels: (i.labels ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
    })),
    assignees: (i.assignees ?? []).map((a) => ({
      login: a.login,
      avatarUrl: a.avatar_url ?? "",
    })),
    user: { login: i.user.login, avatarUrl: i.user.avatar_url ?? "" },
    createdAt: i.created_at,
    updatedAt: i.updated_at,
    comments: i.comments,
    isPullRequest: Boolean(i.pull_request),
    htmlUrl: i.html_url,
  };
}

function normalisePR(p: RawPR): PullRequestSummary {
  return {
    ...normaliseIssue(p),
    isPullRequest: true,
    draft: p.draft,
    merged: p.merged,
    mergedAt: p.merged_at,
    head: p.head,
    base: p.base,
  };
}

function normaliseCommit(c: RawCommit): CommitSummary {
  return {
    sha: c.sha,
    message: c.commit.message,
    authorName: c.commit.author.name,
    authorEmail: c.commit.author.email,
    authorLogin: c.author?.login ?? null,
    authorAvatar: c.author?.avatar_url ?? null,
    htmlUrl: c.html_url,
    timestamp: c.commit.author.date,
  };
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                                Repos                                    */
/* ─────────────────────────────────────────────────────────────────────── */

export async function listRepos(opts: {
  query?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<RepoSummary[]> {
  const params = new URLSearchParams({
    limit: String(Math.min(opts.perPage ?? 30, 50)),
    page: String(opts.page ?? 1),
    private: "true",
    sort: "updated",
    order: "desc",
  });
  if (opts.query?.trim()) params.set("q", opts.query.trim());
  const data = await fetchJson<{ ok: boolean; data: RawRepo[] }>(
    giteaFetch,
    "gitea",
    `/api/v1/repos/search?${params}`,
  );
  return (data.data ?? []).map(normaliseRepo);
}

export async function getRepo(owner: string, repo: string): Promise<RepoSummary> {
  const r = await fetchJson<RawRepo>(
    giteaFetch,
    "gitea",
    `/api/v1/repos/${owner}/${repo}`,
  );
  return normaliseRepo(r);
}

export async function listBranches(
  owner: string,
  repo: string,
): Promise<RepoBranch[]> {
  const data = await fetchJson<RawBranch[]>(
    giteaFetch,
    "gitea",
    `/api/v1/repos/${owner}/${repo}/branches?limit=50`,
  );
  return data.map(normaliseBranch);
}

export async function listContents(
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<RepoEntry[]> {
  const cleanPath = path.replace(/^\/+/, "").replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (ref) params.set("ref", ref);
  const url = `/api/v1/repos/${owner}/${repo}/contents/${cleanPath}${params.toString() ? `?${params}` : ""}`;
  try {
    const data = await fetchJson<RawEntry[] | RawEntry>(giteaFetch, "gitea", url);
    if (Array.isArray(data)) return data.map(normaliseEntry);
    return [normaliseEntry(data)];
  } catch (e) {
    if (e instanceof AppApiError && e.status === 404) return [];
    throw e;
  }
}

const TEXT_EXT = /\.(md|txt|json|ya?ml|toml|ini|env|cfg|conf|sh|bash|zsh|js|jsx|mjs|cjs|ts|tsx|py|rb|rs|go|java|c|h|cc|cpp|hpp|html?|css|scss|sass|less|svg|xml|sql|graphql|gql|prisma|dockerfile|gitignore|gitattributes|editorconfig|tf|tfvars|hcl|lock|prettierrc|eslintrc|babelrc)$/i;

export async function getFile(
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<FileContent | null> {
  const params = new URLSearchParams();
  if (ref) params.set("ref", ref);
  const cleanPath = path.replace(/^\/+/, "");
  const url = `/api/v1/repos/${owner}/${repo}/contents/${cleanPath}${params.toString() ? `?${params}` : ""}`;
  try {
    const data = await fetchJson<RawFile | RawFile[]>(giteaFetch, "gitea", url);
    if (Array.isArray(data)) return null;
    const isText = TEXT_EXT.test(path) || /(^|\/)(LICENSE|README|Dockerfile|Makefile)(\.[^/]+)?$/i.test(path);
    let text = "";
    if (data.encoding === "base64" && data.content) {
      try {
        text = Buffer.from(data.content, "base64").toString("utf8");
      } catch {
        text = "";
      }
    } else {
      text = data.content ?? "";
    }
    return {
      path: data.path,
      name: data.name,
      encoding: (data.encoding as "base64" | "raw") ?? null,
      content: isText ? text : "",
      size: data.size,
      sha: data.sha,
      isBinary: !isText,
      language: detectLanguage(path),
    };
  } catch (e) {
    if (e instanceof AppApiError && e.status === 404) return null;
    throw e;
  }
}

function detectLanguage(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
    c: "c", h: "c", cc: "cpp", cpp: "cpp", hpp: "cpp",
    sh: "bash", bash: "bash", zsh: "bash",
    md: "markdown", json: "json", yml: "yaml", yaml: "yaml", toml: "toml",
    html: "html", htm: "html", css: "css", scss: "scss", sass: "sass", less: "less",
    sql: "sql", graphql: "graphql", gql: "graphql",
    dockerfile: "dockerfile", env: "ini", ini: "ini", conf: "ini", cfg: "ini",
    tf: "hcl", hcl: "hcl", svg: "xml", xml: "xml",
  };
  return map[ext] ?? null;
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                              Issues / PRs                               */
/* ─────────────────────────────────────────────────────────────────────── */

export async function listIssues(
  owner: string,
  repo: string,
  opts: { state?: "open" | "closed" | "all"; type?: "issues" | "pulls" | "all" } = {},
): Promise<IssueSummary[]> {
  const params = new URLSearchParams({
    state: opts.state ?? "open",
    type: opts.type ?? "issues",
    limit: "30",
  });
  const data = await fetchJson<RawIssue[]>(
    giteaFetch,
    "gitea",
    `/api/v1/repos/${owner}/${repo}/issues?${params}`,
  );
  return data.map(normaliseIssue);
}

export async function listPullRequests(
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
): Promise<PullRequestSummary[]> {
  const params = new URLSearchParams({ state, limit: "30", sort: "newest" });
  const data = await fetchJson<RawPR[]>(
    giteaFetch,
    "gitea",
    `/api/v1/repos/${owner}/${repo}/pulls?${params}`,
  );
  return data.map(normalisePR);
}

export async function listCommits(
  owner: string,
  repo: string,
  ref?: string,
): Promise<CommitSummary[]> {
  const params = new URLSearchParams({ limit: "30" });
  if (ref) params.set("sha", ref);
  const data = await fetchJson<RawCommit[]>(
    giteaFetch,
    "gitea",
    `/api/v1/repos/${owner}/${repo}/commits?${params}`,
  );
  return data.map(normaliseCommit);
}

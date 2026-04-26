/**
 * Type definitions for the native Gitea ("Code") integration. Mirrors the
 * subset of fields the portal UI surfaces. Anything not listed here can be
 * added on demand without breaking existing pages.
 */

export type RepoOwner = {
  id: number;
  login: string;
  fullName: string;
  avatarUrl: string;
  type: "user" | "organization";
};

export type RepoSummary = {
  id: number;
  name: string;
  fullName: string;
  description: string;
  private: boolean;
  fork: boolean;
  defaultBranch: string;
  htmlUrl: string;
  cloneUrl: string;
  sshUrl: string;
  owner: RepoOwner;
  stars: number;
  forks: number;
  openIssues: number;
  openPulls: number;
  size: number;
  updatedAt: string;
  language: string | null;
};

export type RepoBranch = {
  name: string;
  commit: {
    id: string;
    message: string;
    authorName: string;
    authorEmail: string;
    timestamp: string;
  };
  protected: boolean;
};

export type RepoEntry = {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  sha: string;
  htmlUrl: string;
  downloadUrl: string | null;
};

export type FileContent = {
  path: string;
  name: string;
  encoding: "base64" | "raw" | null;
  content: string;
  size: number;
  sha: string;
  isBinary: boolean;
  language: string | null;
};

export type IssueLabel = {
  id: number;
  name: string;
  color: string;
};

export type IssueSummary = {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  body: string;
  labels: IssueLabel[];
  assignees: { login: string; avatarUrl: string }[];
  user: { login: string; avatarUrl: string };
  createdAt: string;
  updatedAt: string;
  comments: number;
  isPullRequest: boolean;
  htmlUrl: string;
};

export type PullRequestSummary = IssueSummary & {
  draft: boolean;
  merged: boolean;
  mergedAt: string | null;
  head: { ref: string; sha: string; label: string };
  base: { ref: string; sha: string; label: string };
};

export type CommitSummary = {
  sha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authorLogin: string | null;
  authorAvatar: string | null;
  htmlUrl: string;
  timestamp: string;
};

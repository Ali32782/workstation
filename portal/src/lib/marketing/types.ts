/**
 * Mautic-related types shared by API routes and the native /marketing UI.
 * Kept dependency-free so it can be imported from both server and client.
 */

export type MauticContact = {
  id: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  city: string | null;
  country: string | null;
  /** ISO timestamp of the most recent activity (last sent / opened / clicked). */
  lastActive: string | null;
  /** Numeric points score from Mautic. */
  points: number;
  stage: string | null;
  tags: string[];
  segments: string[];
};

export type MauticSegment = {
  id: number;
  name: string;
  alias: string;
  description: string | null;
  /** Total contacts inside this segment. */
  contactCount: number;
  isPublished: boolean;
};

export type MauticEmail = {
  id: number;
  name: string;
  subject: string;
  /** "list" | "template" — list = broadcast, template = drip step. */
  type: string;
  /** Number of times this email has been sent across all campaigns. */
  sentCount: number;
  readCount: number;
  /** Open rate as 0-100 percent. */
  readPercent: number | null;
  isPublished: boolean;
  createdAt: string | null;
};

export type MauticCampaign = {
  id: number;
  name: string;
  description: string | null;
  isPublished: boolean;
  category: string | null;
  /** Number of contacts currently progressing through the campaign. */
  contactCount: number;
  createdAt: string | null;
};

export type MarketingOverview = {
  contacts: { total: number; recent: number };
  segments: number;
  campaigns: { total: number; active: number };
  emails: { total: number; published: number };
  /** Total mails sent in the last 30 days. */
  recentSends: number;
  /** Public Mautic URL the user can deep-link to. */
  publicUrl: string;
};

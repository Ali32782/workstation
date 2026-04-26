/**
 * TypeScript types for the native Twenty CRM integration. Mirrors the subset of
 * Twenty objects that the portal exposes today (companies + people +
 * opportunities + notes/tasks via the join tables).
 */

export type TwentyAddress = {
  addressStreet1?: string | null;
  addressStreet2?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressPostcode?: string | null;
  addressCountry?: string | null;
  addressLat?: number | null;
  addressLng?: number | null;
};

export type TwentyLinks = {
  primaryLinkUrl?: string | null;
  primaryLinkLabel?: string | null;
  secondaryLinks?: { url: string; label?: string }[] | null;
};

export type TwentyCurrency = {
  amountMicros?: number | null;
  currencyCode?: string | null;
};

export type TwentyName = {
  firstName?: string | null;
  lastName?: string | null;
};

export type TwentyEmails = {
  primaryEmail?: string | null;
  additionalEmails?: string[] | null;
};

export type TwentyPhones = {
  primaryPhoneNumber?: string | null;
  primaryPhoneCountryCode?: string | null;
  primaryPhoneCallingCode?: string | null;
  additionalPhones?: { number: string; countryCode?: string }[] | null;
};

export type CompanySummary = {
  id: string;
  name: string;
  domain: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  generalEmail: string | null;
  bookingSystem: string | null;
  leadSource: string | null;
  employeeCountPhysio: number | null;
  googleRating: number | null;
  googleReviewCount: number | null;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompanyDetail = CompanySummary & {
  address: TwentyAddress | null;
  domainName: TwentyLinks | null;
  linkedinLink: TwentyLinks | null;
  xLink: TwentyLinks | null;
  annualRecurringRevenue: TwentyCurrency | null;
  idealCustomerProfile: boolean;
  tenant: string | null;
  specializations: string | null;
  languages: string | null;
  leadTherapistName: string | null;
  leadTherapistEmail: string | null;
  ownerSource: string | null;
  position: number;
};

export type PersonSummary = {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  companyId: string | null;
  companyName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersonDetail = PersonSummary & {
  emails: TwentyEmails | null;
  phones: TwentyPhones | null;
  avatarUrl: string | null;
  linkedinLink: TwentyLinks | null;
  xLink: TwentyLinks | null;
  position: number;
};

export type OpportunitySummary = {
  id: string;
  name: string;
  stage: string;
  amount: TwentyCurrency | null;
  closeDate: string | null;
  companyId: string | null;
  companyName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoteSummary = {
  id: string;
  title: string;
  bodyV2Markdown: string | null;
  bodyV2BlockNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskSummary = {
  id: string;
  title: string;
  status: string;
  bodyV2Markdown: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  assigneeId: string | null;
  assigneeName: string | null;
};

export type WorkspaceMember = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

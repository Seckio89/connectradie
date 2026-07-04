import type { EmploymentType, PayPeriod, VacancyRoleType, TradeVacancy } from '../types/database';
import { TRADE_CATEGORIES } from './tradeCategories';

export const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'casual', label: 'Casual' },
  { value: 'contract', label: 'Contract' },
  { value: 'subcontract', label: 'Subcontract' },
  { value: 'apprenticeship', label: 'Apprenticeship' },
];

/**
 * Trade options for vacancy posting = the real trade categories plus a
 * non-trade bucket for office/support roles (admin, accounts, ops) that trade
 * businesses also hire for. 'non_trade' is deliberately NOT in
 * TRADE_CATEGORIES — it must not appear in quoting/search flows.
 */
export const NON_TRADE_CATEGORY = { value: 'non_trade', label: 'Office / Non-trade' };
export const VACANCY_TRADE_OPTIONS: { value: string; label: string }[] = [
  ...TRADE_CATEGORIES.map(c => ({ value: c.value, label: c.label })),
  NON_TRADE_CATEGORY,
];

/** Label for a vacancy's trade_category, handling the non-trade bucket. */
export function vacancyTradeLabel(value: string): string {
  return VACANCY_TRADE_OPTIONS.find(o => o.value === value)?.label || value;
}

export const PAY_PERIODS: { value: PayPeriod; label: string; short: string }[] = [
  { value: 'hour', label: 'per hour', short: '/hr' },
  { value: 'day', label: 'per day', short: '/day' },
  { value: 'week', label: 'per week', short: '/wk' },
  { value: 'year', label: 'per year', short: '/yr' },
];

/** Common Australian trade tickets/licences offered as quick-pick chips. */
export const COMMON_TICKETS: string[] = [
  'White Card',
  "Driver's licence",
  'Trade licence',
  'First Aid',
  'Working at Heights',
  'EWP (Boom/Scissor)',
  'Forklift licence',
  'Confined Spaces',
  'Asbestos awareness',
  'Working with Children Check',
];

/**
 * Starter description + typical tickets per role type. Used by the "Insert
 * template" action to kill the blank-page problem when posting a vacancy.
 */
export const ROLE_TEMPLATES: Record<VacancyRoleType, { description: string; tickets: string[] }> = {
  non_trade: {
    description:
      "We're hiring for an office/support role in our trade business.\n\nWhat you'll do:\n• Keep the office running — scheduling, invoicing, client calls\n• Support the crews on the tools with admin and coordination\n• Help quotes, jobs and payments move smoothly\n\nWhat we offer:\n• Steady hours and a friendly team\n• Variety — no two days the same\n• A business that values the office as much as the tools",
    tickets: [],
  },
  apprentice: {
    description:
      "We're taking on a motivated apprentice to learn the trade with our team. No experience needed — just reliability, a good attitude and a willingness to learn.\n\nWhat you'll do:\n• Assist qualified tradespeople on-site\n• Learn on the tools day to day\n• Complete your TAFE / RTO training with our support\n\nWhat we offer:\n• Award apprentice wages + genuine mentoring\n• A clear path to becoming qualified\n• Ongoing, varied work",
    tickets: ['White Card', "Driver's licence"],
  },
  qualified: {
    description:
      "We're looking for a licensed, experienced tradesperson to join our team on quality work.\n\nWhat you'll do:\n• Run jobs on-site, largely unsupervised\n• Deliver clean, code-compliant work\n• Represent the business well with clients\n\nWhat we offer:\n• Competitive pay for the right person\n• Steady pipeline of work\n• Good gear and a solid team",
    tickets: ['White Card', 'Trade licence', "Driver's licence"],
  },
  senior_advisory: {
    description:
      "We're seeking an experienced leader to run jobs and mentor our team.\n\nWhat you'll do:\n• Supervise crews and coordinate site work\n• Mentor apprentices and qualified staff\n• Own quality, safety and scheduling on your jobs\n\nWhat we offer:\n• Leadership pay + input into how we work\n• Long-term, stable role\n• A team that takes pride in its work",
    tickets: ['White Card', 'Trade licence', "Driver's licence", 'First Aid'],
  },
};

/** "$35–$45 /hr", "$75,000 /yr + super", or "" when no pay is set. */
export function formatPay(v: Pick<TradeVacancy, 'pay_min' | 'pay_max' | 'pay_period' | 'pay_note'>): string {
  const { pay_min, pay_max, pay_period, pay_note } = v;
  if (pay_min == null && pay_max == null) return pay_note?.trim() || '';
  const money = (n: number) => `$${n.toLocaleString('en-AU')}`;
  let range = '';
  if (pay_min != null && pay_max != null && pay_max !== pay_min) range = `${money(pay_min)}–${money(pay_max)}`;
  else range = money((pay_min ?? pay_max) as number);
  const period = PAY_PERIODS.find(p => p.value === pay_period)?.short ?? '';
  return [`${range}${period ? ' ' + period : ''}`, pay_note?.trim()].filter(Boolean).join(' · ');
}

export function employmentLabel(t: EmploymentType | null): string {
  return EMPLOYMENT_TYPES.find(e => e.value === t)?.label ?? '';
}

export const ROLE_LABELS: Record<VacancyRoleType, string> = {
  apprentice: 'Apprenticeship',
  qualified: 'Qualified Trade',
  senior_advisory: 'Senior / Advisory',
  non_trade: 'Office / Support',
};

/** schema.org JobPosting employmentType mapping. */
export const EMPLOYMENT_SCHEMA: Record<EmploymentType, string> = {
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  casual: 'PART_TIME',
  contract: 'CONTRACTOR',
  subcontract: 'CONTRACTOR',
  apprenticeship: 'FULL_TIME',
};

/** schema.org QuantitativeValue unitText for a pay period. */
export const PAY_UNIT_TEXT: Record<PayPeriod, string> = {
  hour: 'HOUR',
  day: 'DAY',
  week: 'WEEK',
  year: 'YEAR',
};

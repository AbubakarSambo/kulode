import { localParts } from './invoice-collections.schedule';

export type ReplyIntent = 'OPT_OUT' | 'CLAIMS_PAID' | 'WILL_PAY_ON' | 'OTHER';

export interface ClassifiedReply {
  intent: ReplyIntent;
  /** Midnight UTC of the promised calendar day in the business's time zone (only for WILL_PAY_ON). */
  promisedDate?: Date;
}

/** A promise further out than this is not a promise to chase around: the owner decides. */
export const MAX_PROMISE_DAYS = 30;

// Whole words only, so "money" is not Monday and "market" is not March.
const MONTHS = ['jan(?:uary)?', 'feb(?:ruary)?', 'mar(?:ch)?', 'apr(?:il)?', 'may', 'june?', 'july?', 'aug(?:ust)?', 'sep(?:t|tember)?', 'oct(?:ober)?', 'nov(?:ember)?', 'dec(?:ember)?'];
const WEEKDAYS = ['sun(?:day)?', 'mon(?:day)?', 'tue(?:s|sday)?', 'wed(?:nesday)?', 'thu(?:r|rs|rsday)?', 'fri(?:day)?', 'sat(?:urday)?'];

// An opt-out is permanent, so only a message that IS the request counts ("STOP", "please unsubscribe me",
// "don't message me again"). A longer sentence that merely contains the word ("please stop by the shop")
// goes to the owner as OTHER instead.
const FILLER = '(?:\\s+(?:all|these|the|my|sending|messaging|texting|messages?|texts?|reminders?|whatsapp|me|us|any|more|again|anymore|now|please|pls))*';
const OPT_OUT = new RegExp(
  `^(?:(?:please|pls|kindly)\\s+)*(?:stop|unsubscribe|opt[ -]?out|cancel)${FILLER}$|` +
    `^(?:(?:please|pls|kindly)\\s+)*(?:remove\\s+(?:me|my number)|do(?:n'?t| not)\\s+(?:message|text|contact|whatsapp|send)\\s+(?:me|us))${FILLER}$`,
);
const NEGATED_PAYMENT = /\b(not|never|haven'?t|hasn'?t|didn'?t|yet to|am yet to|am not yet|still (need|have) to)\b.{0,20}\b(paid|pay|sent|send|transferred)\b/;
const CLAIMS_PAID =
  /\b(i|we)\s*(have|'ve|don|already|just)?\s*(already\s+)?(paid|sent|transferred|made (the )?payment)\b|\balready (paid|sent|transferred)\b|\bpayment (is |has been )?(done|made|sent)\b|\b(paid|transfer(red)?) (already|done|now)\b|\bi don pay\b/;
const PAY_INTENT = /\b(pay|paying|send|sending|transfer|settle|sort|clear|credit|remit|go do|will do)\b/;

const daysBetween = (fromMs: number, toMs: number) => Math.round((toMs - fromMs) / 86_400_000);

/**
 * Reads a customer's reply to a payment reminder. Deliberately deterministic and conservative: anything
 * it is not sure about is OTHER, which stops the reminders and hands the conversation to the owner.
 * (An LLM can be added behind this later; it would only ever pick one of these four intents.)
 */
export function classifyReply(text: string, now: Date, timeZone: string): ClassifiedReply {
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return { intent: 'OTHER' };

  if (OPT_OUT.test(t.replace(/[.!?,;:]+/g, '').trim())) return { intent: 'OPT_OUT' };
  if (NEGATED_PAYMENT.test(t)) return { intent: 'OTHER' };
  if (CLAIMS_PAID.test(t)) return { intent: 'CLAIMS_PAID' };

  const wordCount = t.split(' ').length;
  if (PAY_INTENT.test(t) || wordCount <= 3) {
    const promisedDate = parsePromisedDate(t, now, timeZone);
    if (promisedDate) return { intent: 'WILL_PAY_ON', promisedDate };
  }
  return { intent: 'OTHER' };
}

function parsePromisedDate(t: string, now: Date, timeZone: string): Date | undefined {
  const today = localParts(now, timeZone);
  const todayMs = Date.UTC(today.year, today.monthIndex, today.day);
  const at = (ms: number) => {
    const days = daysBetween(todayMs, ms);
    return days >= 0 && days <= MAX_PROMISE_DAYS ? new Date(ms) : undefined;
  };
  const plus = (days: number) => at(todayMs + days * 86_400_000);

  if (/\b(today|tonight|this evening)\b/.test(t)) return plus(0);
  if (/\b(tomorrow|tmrw|tomorow|2moro)\b/.test(t)) return plus(1);
  if (/\bnext week\b/.test(t)) return plus(7);

  const inDays = t.match(/\b(?:in )?(\d{1,2}) days?\b/);
  if (inDays) return plus(Number(inDays[1]));

  for (let i = 0; i < MONTHS.length; i++) {
    const m = MONTHS[i];
    const day = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s*)?${m}\\b`)) ?? t.match(new RegExp(`\\b${m}\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b`));
    if (day) return explicitDate(Number(day[1]), i, today, todayMs, at);
  }

  // day/month, the Nigerian order. Not part of a longer number or an amount ("50.00", "2.5 million"),
  // and a numeric match that is not a real date falls through to the weekday/month-end rules below.
  const numeric = t.match(/(?<![\d.,/-])(\d{1,2})[/.-](\d{1,2})(?![\d,]|[./-]\d|\s*(?:k|m|million|thousand|naira|ngn|₦))/);
  if (numeric) {
    const date = explicitDate(Number(numeric[1]), Number(numeric[2]) - 1, today, todayMs, at);
    if (date) return date;
  }

  if (/\b(end of (the )?month|month[ -]?end)\b/.test(t)) {
    return at(Date.UTC(today.year, today.monthIndex + 1, 0));
  }

  const todayWeekday = new Date(todayMs).getUTCDay();
  if (/\b(end of (the )?week)\b/.test(t)) return plus(((5 - todayWeekday + 7) % 7) || 7);
  const weekday = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(t));
  if (weekday !== -1) return plus(((weekday - todayWeekday + 7) % 7) || 7);

  return undefined;
}

function explicitDate(
  day: number,
  monthIndex: number,
  today: { year: number },
  todayMs: number,
  at: (ms: number) => Date | undefined,
): Date | undefined {
  if (day < 1 || day > 31 || monthIndex < 0 || monthIndex > 11) return undefined;
  let ms = Date.UTC(today.year, monthIndex, day);
  if (new Date(ms).getUTCMonth() !== monthIndex) return undefined; // e.g. 31 Feb
  if (ms < todayMs) ms = Date.UTC(today.year + 1, monthIndex, day); // "5 January" said in December
  return at(ms);
}


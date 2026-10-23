import {dateAdd} from './core.mjs';

// Date-only values stay in UTC so a browser's time zone cannot move a due date.
export function shiftMonth(month, offset) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function dateInMonth(month, day) {
  const next = shiftMonth(month, 1);
  const lastDay = Number(dateAdd(`${next}-01`, -1).slice(-2));
  return `${month}-${String(Math.min(Math.max(Number(day), 1), lastDay)).padStart(2, '0')}`;
}

export function monthDays(month) {
  const first = `${month}-01`;
  const weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
  const start = dateAdd(first, -weekday);
  return Array.from({length: 42}, (_, index) => dateAdd(start, index));
}

export function dueCalendar(items, month) {
  const groups = new Map();
  const monthly = [];
  const clientKey = item => item.loan.client_id || item.client?.id || item.loan_id;
  for (const item of items) {
    if (item.loan?.status !== 'active' || item.balance <= 0) continue;
    let group = groups.get(item.due_on);
    if (!group) {
      group = {items: [], balance: 0, clients: new Set()};
      groups.set(item.due_on, group);
    }
    group.items.push(item);
    group.balance += item.balance;
    group.clients.add(clientKey(item));
    if (item.due_on.startsWith(`${month}-`)) monthly.push(item);
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => (a.client?.name || '').localeCompare(b.client?.name || '', 'pt-BR') || a.number - b.number);
  }
  return {
    groups,
    items: monthly,
    balance: monthly.reduce((total, item) => total + item.balance, 0),
    clients: new Set(monthly.map(clientKey)).size,
    days: new Set(monthly.map(item => item.due_on)).size,
  };
}

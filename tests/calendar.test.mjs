import test from 'node:test';
import assert from 'node:assert/strict';
import {dateAdd, enrich, scheduleDates} from '../painel/core.mjs';
import {shiftMonth, dateInMonth, monthDays, dueCalendar} from '../painel/calendar.mjs';

test('calendar weeks cover stored dates across month boundaries without time-zone shifts', () => {
  const dates = monthDays('2026-10');
  assert.equal(dates.length, 42);
  assert.equal(new Set(dates).size, 42);
  assert.equal(dates[0], '2026-09-27');
  assert.equal(dates[4], '2026-10-01');
  assert.equal(dates[41], '2026-11-07');
  for (let i = 1; i < dates.length; i++) assert.equal(dates[i], dateAdd(dates[i - 1], 1));
  assert.ok(monthDays('2028-02').includes('2028-02-29'));
});

test('month navigation preserves the selected day, clamped for February and leap years', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2027-01', -1), '2026-12');
  assert.equal(dateInMonth('2027-02', 31), '2027-02-28');
  assert.equal(dateInMonth('2028-02', 31), '2028-02-29');
  assert.equal(dateInMonth('2026-11', 31), '2026-11-30');
});

const clients = [{id: 'c1', name: 'Ana'}, {id: 'c2', name: 'Gabriel'}];
const loans = [
  {id: 'l1', client_id: 'c1', status: 'active'},
  {id: 'l2', client_id: 'c1', status: 'active'},
  {id: 'l3', client_id: 'c2', status: 'active'},
  {id: 'l4', client_id: 'c2', status: 'cancelled'},
];
const installments = [
  {id: 'i1', loan_id: 'l1', number: 1, due_on: '2026-10-23', amount_cents: 9333},
  {id: 'i2', loan_id: 'l2', number: 1, due_on: '2026-10-23', amount_cents: 10000},
  {id: 'i3', loan_id: 'l3', number: 1, due_on: '2026-10-23', amount_cents: 12000},
  {id: 'i4', loan_id: 'l4', number: 1, due_on: '2026-10-24', amount_cents: 20000},
  {id: 'i5', loan_id: 'l1', number: 2, due_on: '2026-10-25', amount_cents: 9334},
  {id: 'i6', loan_id: 'l1', number: 3, due_on: '2026-11-07', amount_cents: 9000},
  {id: 'orphan', loan_id: 'missing', number: 1, due_on: '2026-10-26', amount_cents: 7000},
];
const receipts = [
  {id: 'r1', installment_id: 'i1', amount_cents: 3000},
  {id: 'r2', installment_id: 'i5', amount_cents: 9334},
];

test('gold markers count distinct clients and actual open balances, excluding paid and cancelled items', () => {
  const model = enrich(clients, loans, installments, receipts);
  const agenda = dueCalendar(model.items, '2026-10');
  assert.equal(agenda.groups.get('2026-10-23').clients.size, 2);
  assert.equal(agenda.groups.get('2026-10-23').items.length, 3);
  assert.equal(agenda.groups.get('2026-10-23').balance, 28333);
  assert.equal(agenda.groups.has('2026-10-24'), false);
  assert.equal(agenda.groups.has('2026-10-25'), false);
  assert.equal(agenda.groups.has('2026-10-26'), false);
  assert.equal(agenda.clients, 2);
  assert.equal(agenda.days, 1);
  assert.equal(agenda.balance, 28333);
  // Adjacent-month days still show markers, without inflating the selected month's totals.
  assert.equal(agenda.groups.get('2026-11-07').balance, 9000);
});

test('new loans, custom due dates, settlements, reversals and cancellations rebuild the agenda', () => {
  const newDates = scheduleDates('2026-10-28', 3, 21);
  const newLoan = {id: 'l5', client_id: 'c2', status: 'active'};
  const added = newDates.map((due_on, n) => ({id: `new${n}`, loan_id: 'l5', number: n + 1, due_on, amount_cents: 5000}));
  const changed = installments.map(item => item.id === 'i2' ? {...item, due_on: '2026-10-27'} : item);
  const build = (payments, contracts = loans) => dueCalendar(enrich(clients, [...contracts, newLoan], [...changed, ...added], payments).items, '2026-10');
  let agenda = build(receipts);
  assert.equal(agenda.groups.get('2026-10-23').items.some(item => item.id === 'i2'), false);
  assert.equal(agenda.groups.get('2026-10-27').balance, 10000);
  for (const date of ['2026-10-28', '2026-11-18', '2026-12-09']) assert.equal(agenda.groups.get(date).balance, 5000);
  const settled = [...receipts, {id: 'r3', installment_id: 'i2', amount_cents: 10000}];
  assert.equal(build(settled).groups.has('2026-10-27'), false);
  assert.equal(build(settled.map(receipt => receipt.id === 'r3' ? {...receipt, voided_at: '2026-10-24T12:00:00Z'} : receipt)).groups.get('2026-10-27').balance, 10000);
  assert.equal(build(receipts, loans.map(loan => loan.id === 'l2' ? {...loan, status: 'cancelled'} : loan)).groups.has('2026-10-27'), false);
});

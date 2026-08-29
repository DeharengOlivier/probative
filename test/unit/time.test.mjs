import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthsBetween, parseSupportDate, resolveNow, toIso } from '../../src/util/time.mjs';

test('accepts the month-and-year granularity Article 13(19) requires', () => {
  const parsed = parseSupportDate('2031-06');
  assert.equal(parsed.granularity, 'month');
  assert.equal(toIso(parsed.date), '2031-06-01T00:00:00Z');
});

test('accepts a full date and rejects anything coarser than a month', () => {
  assert.equal(parseSupportDate('2031-06-15').granularity, 'day');
  assert.equal(parseSupportDate('2031'), null);
  assert.equal(parseSupportDate('June 2031'), null);
  assert.equal(parseSupportDate(null), null);
});

test('counts whole months, flooring a partial one', () => {
  const from = new Date('2026-01-15T00:00:00Z');
  assert.equal(monthsBetween(from, new Date('2031-01-15T00:00:00Z')), 60);
  assert.equal(monthsBetween(from, new Date('2031-01-14T00:00:00Z')), 59);
  assert.equal(monthsBetween(from, new Date('2031-06-01T00:00:00Z')), 64);
});

test('honours SOURCE_DATE_EPOCH and an explicit override', () => {
  assert.equal(toIso(resolveNow({ nowOverride: '2026-08-28T12:00:00Z' })), '2026-08-28T12:00:00Z');
  const previous = process.env.SOURCE_DATE_EPOCH;
  process.env.SOURCE_DATE_EPOCH = '1800000000';
  try {
    assert.equal(resolveNow().getTime(), 1800000000000);
  } finally {
    if (previous === undefined) delete process.env.SOURCE_DATE_EPOCH;
    else process.env.SOURCE_DATE_EPOCH = previous;
  }
});

test('rejects an unparseable override rather than falling back silently', () => {
  assert.throws(() => resolveNow({ nowOverride: 'yesterday' }), /invalid --now/);
});

// Article 13(19) allows a support period end stated as a month and a year, so
// '2031-01' denotes the whole of January 2031. Reading it as the 1st understates
// the period by up to a month and raises a false gap against the five-year floor.
test('a month-granularity date also carries the last instant it denotes', () => {
  assert.equal(parseSupportDate('2031-01').latest.toISOString(), '2031-01-31T23:59:59.999Z');
  assert.equal(parseSupportDate('2031-02').latest.toISOString(), '2031-02-28T23:59:59.999Z');
  assert.equal(parseSupportDate('2032-02').latest.toISOString(), '2032-02-29T23:59:59.999Z', 'leap year');
  assert.equal(parseSupportDate('2031-12').latest.toISOString(), '2031-12-31T23:59:59.999Z', 'december rolls the year');
});

test('a day-granularity date denotes that day and nothing more', () => {
  const parsed = parseSupportDate('2031-01-15');
  assert.equal(parsed.granularity, 'day');
  assert.equal(parsed.latest.toISOString(), '2031-01-15T23:59:59.999Z');
  assert.equal(parsed.date.toISOString(), '2031-01-15T00:00:00.000Z');
});

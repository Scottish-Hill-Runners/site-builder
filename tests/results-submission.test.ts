import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findUnrecognizedCategories } from '../src/lib/results-submission';

test('suggests male categories for Open results without changing other suggestions', () => {
  const corrections = findUnrecognizedCategories({
    headers: ['Category'],
    rows: [
      ['Open'],
      ['Open v50'],
      ['Open v50'],
      ['open V40'],
      ['Non-binary v50'],
      ['Female v50'],
      ['M50'],
    ],
  });

  assert.deepEqual(corrections, [
    { raw: 'Open v50', count: 2, suggestion: 'M50' },
    { raw: 'Open', count: 1, suggestion: 'M' },
    { raw: 'open V40', count: 1, suggestion: 'M40' },
    { raw: 'Non-binary v50', count: 1, suggestion: 'NB50' },
    { raw: 'Female v50', count: 1, suggestion: 'F50' },
  ]);
});

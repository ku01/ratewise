import test from 'node:test';
import assert from 'node:assert/strict';
import { moveIndex, moveItem } from '../public/js/reorder.js';

test('moveItem: moves an item forward and back without changing the input', () => {
  const list = ['A', 'B', 'C', 'D'];
  assert.deepEqual(moveItem(list, 0, 2), ['B', 'C', 'A', 'D']);
  assert.deepEqual(moveItem(list, 3, 0), ['D', 'A', 'B', 'C']);
  assert.deepEqual(moveItem(list, 1, 1), list);
  assert.deepEqual(list, ['A', 'B', 'C', 'D']);
});

test('moveIndex: follows an item through a move', () => {
  const list = ['A', 'B', 'C', 'D'];
  for (const [from, to] of [[0, 3], [3, 0], [1, 2], [2, 1], [2, 2]]) {
    const moved = moveItem(list, from, to);
    for (const [i, item] of list.entries()) {
      assert.equal(moved[moveIndex(i, from, to)], item, `${item} after ${from} → ${to}`);
    }
  }
  assert.equal(moveIndex(-1, 0, 2), -1);
});

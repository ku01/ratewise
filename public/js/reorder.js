// Drag-and-drop reordering of a list of elements (table column headers,
// presets). Built on pointer events, so it works with a mouse and on touch
// screens: a mouse drag starts after a few pixels of movement, a touch drag
// after a long press (a quick swipe still scrolls the page).

// A copy of list with the item at from moved to index to.
export function moveItem(list, from, to) {
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

// Where the item at index i ends up after moving from → to (-1 stays -1).
export function moveIndex(i, from, to) {
  if (i < 0) return i;
  if (i === from) return to;
  if (from < i && i <= to) return i - 1;
  if (to <= i && i < from) return i + 1;
  return i;
}

const MOUSE_THRESHOLD = 5; // px moved before a mouse drag starts
const TOUCH_DELAY = 350; // ms of pressing before a touch drag starts
const TOUCH_SLOP = 8; // px a finger may move while pressing

// container: the element holding the items.
// items: selector of the reorderable elements, in order.
// handle: selector, inside an item, of where a drag can start (default: anywhere).
// ignore: selector of elements that never start a drag (buttons inside the handle).
// axis: 'x' or 'y'.
// canStart(): false disables dragging for now.
// onMove(from, to): called with the dragged item's old and new index.
export function makeSortable(container, { items, handle = null, ignore = null, axis, canStart = () => true, onMove }) {
  let press = null; // {pointerId, item, from, x, y, timer, dragging, to}

  const list = () => [...container.querySelectorAll(items)];
  const pos = (e) => (axis === 'x' ? e.clientX : e.clientY);

  function clearMarks() {
    for (const node of container.querySelectorAll('.drop-before, .drop-after, .is-dragging')) {
      node.classList.remove('drop-before', 'drop-after', 'is-dragging');
    }
  }

  // The new index is the number of other items whose middle is before the pointer.
  function targetIndex(e) {
    const p = pos(e);
    const others = list().filter((node) => node !== press.item);
    const to = others.filter((node) => {
      const r = node.getBoundingClientRect();
      return (axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2) < p;
    }).length;
    return { to, others };
  }

  function showTarget(e) {
    const { to, others } = targetIndex(e);
    press.to = to;
    for (const node of others) node.classList.remove('drop-before', 'drop-after');
    if (to === press.from) return;
    if (to < others.length) others[to].classList.add('drop-before');
    else others[others.length - 1].classList.add('drop-after');
  }

  function startDrag(e) {
    press.dragging = true;
    press.to = press.from;
    press.item.classList.add('is-dragging');
    document.documentElement.classList.add('is-reordering');
    window.getSelection()?.removeAllRanges();
    showTarget(e);
  }

  function end(commit) {
    if (!press) return;
    clearTimeout(press.timer);
    const { dragging, from, to, cancelled } = press;
    press = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('touchmove', onTouchMove);
    if (!dragging) return;
    clearMarks();
    document.documentElement.classList.remove('is-reordering');
    // The click that ends a drag must not also select or remove anything.
    const swallow = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    container.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => container.removeEventListener('click', swallow, { capture: true }), 0);
    if (commit && !cancelled && to !== from) onMove(from, to);
  }

  function onPointerMove(e) {
    if (e.pointerId !== press.pointerId) return;
    if (press.dragging) {
      if (!press.cancelled) showTarget(e);
      return;
    }
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (e.pointerType === 'mouse') {
      if (moved >= MOUSE_THRESHOLD) startDrag(e);
    } else if (moved > TOUCH_SLOP) {
      end(false); // a swipe: let the page scroll
    }
  }

  const onPointerUp = (e) => e.pointerId === press?.pointerId && end(true);
  const onPointerCancel = (e) => e.pointerId === press?.pointerId && end(false);
  // Once a touch drag has started, the finger moves the item, not the page.
  const onTouchMove = (e) => press?.dragging && e.cancelable && e.preventDefault();

  container.addEventListener('pointerdown', (e) => {
    if (press || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (ignore && e.target.closest(ignore)) return;
    const item = e.target.closest(items);
    if (!item || !container.contains(item)) return;
    if (handle && !e.target.closest(handle)) return;
    if (!canStart()) return;
    press = { pointerId: e.pointerId, item, from: list().indexOf(item), x: e.clientX, y: e.clientY, dragging: false };
    if (e.pointerType !== 'mouse') {
      press.timer = setTimeout(() => press && startDrag({ clientX: press.x, clientY: press.y }), TOUCH_DELAY);
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
  });
  // No long-press menu or native image/text drag over a draggable item.
  container.addEventListener('contextmenu', (e) => press && e.preventDefault());
  container.addEventListener('dragstart', (e) => e.target.closest?.(items) && e.preventDefault());
  // Escape cancels a drag; the item stays put when the pointer is released.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !press?.dragging) return;
    press.cancelled = true;
    clearMarks();
  });
}

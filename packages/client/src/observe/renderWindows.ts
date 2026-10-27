interface RenderWindow {
  area: string;
  start: number;
  end: number;
  duration: number;
}

export interface RenderWindows {
  /** Records that `area` rendered for `duration` ms somewhere between `start` and `end`. */
  add: (area: string, start: number, end: number, duration: number) => void;
  /** The area to blame for a main-thread block over `[start, end]`, or `null` when no recent render overlaps it. */
  findArea: (start: number, end: number) => string | null;
}

/**
 * A fixed-size ring of recent render windows. Long-task entries arrive a
 * little after the fact, so attribution looks back over the last `size` renders.
 *
 * Nested areas overlap the same block, and an outer area's duration includes
 * its inner ones. So the blame goes to the innermost overlapping area that
 * still accounts for at least half of the longest overlapping render: an
 * inner area that's responsible for most of the time, rather than always the
 * outermost wrapper or a tiny sibling that happened to render in the same commit.
 */
export function createRenderWindows(size = 200): RenderWindows {
  const windows: (RenderWindow | undefined)[] = new Array(size);
  let next = 0;

  return {
    add(area, start, end, duration) {
      windows[next] = { area, start, end, duration };
      next = (next + 1) % size;
    },
    findArea(start, end) {
      const overlapping = windows.filter((w): w is RenderWindow => w !== undefined && w.end >= start && w.start <= end);
      if (overlapping.length === 0) return null;

      const longest = Math.max(...overlapping.map((w) => w.duration));
      let best: RenderWindow | null = null;

      for (const window of overlapping) {
        if (window.duration < longest / 2) continue;
        if (!best || window.duration < best.duration) best = window;
      }

      return best?.area ?? null;
    },
  };
}

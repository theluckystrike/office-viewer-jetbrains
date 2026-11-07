// Pure helpers for the virtual grid: only the rows in view (plus a margin) exist in the DOM.

export interface Range { start: number; end: number }

/** Rows [start, end) to draw for a scroll position. */
export function visibleRange(scrollTop: number, viewHeight: number, rowHeight: number, total: number, overscan = 20): Range {
	if (total <= 0 || rowHeight <= 0) return { start: 0, end: 0 };
	const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
	const count = Math.ceil(Math.max(0, viewHeight) / rowHeight);
	const end = Math.min(total, first + count + overscan);
	const start = Math.min(Math.max(0, first - overscan), Math.max(0, end - count - overscan));
	return { start, end: Math.max(start, end) };
}

/** Scroll position that brings row r into view, or null when it is already visible. */
export function scrollToRow(r: number, scrollTop: number, viewHeight: number, rowHeight: number, headerHeight = 0): number | null {
	const top = r * rowHeight;
	const bottom = top + rowHeight;
	const usable = viewHeight - headerHeight;
	if (top < scrollTop) return top;
	if (bottom > scrollTop + usable) return bottom - usable;
	return null;
}

/** Zoom steps used by the DOCX and PPTX views. */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export function stepZoom(z: number, dir: 1 | -1): number {
	if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 0.001) ?? 3;
	for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
		const s = ZOOM_STEPS[i] ?? 1;
		if (s < z - 0.001) return s;
	}
	return 0.25;
}

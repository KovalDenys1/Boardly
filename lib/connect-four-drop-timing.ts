/** The share of a drop spent falling: the disc first touches the bottom at c4-drop's 72 % keyframe, before its bounce. */
export const C4_FALL_SHARE = 0.72

/** The cell height C4Board assumes before it has measured one. */
export const C4_DEFAULT_CELL_PX = 46

const C4_CELL_GAP_PX = 6

export function c4FallDistancePx(row: number, cellPx: number): number {
    return (row + 1) * (cellPx + C4_CELL_GAP_PX)
}

export function c4DropDurationMs(fallDistancePx: number): number {
    return 240 + Math.round(fallDistancePx * 0.9)
}

export function c4LandingMs(row: number, cellPx: number): number {
    return Math.round(c4DropDurationMs(c4FallDistancePx(row, cellPx)) * C4_FALL_SHARE)
}

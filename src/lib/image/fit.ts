/** 종횡비를 유지하며 (maxW, maxH) 박스 안에 맞는 크기를 구한다(확대는 하지 않음). */
export function fitBox(
  w: number,
  h: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 }
  const scale = Math.min(1, maxW / w, maxH / h)
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

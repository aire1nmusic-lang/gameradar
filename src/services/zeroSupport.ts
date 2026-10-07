/** Unbiased shuffle; never repeat the previous complete zero order when change is possible. */
export function shuffleZeroIds(ids: string[], previous: string[] = [], random = Math.random): string[] {
  const next = [...ids]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  if (next.length > 1 && next.every((id, i) => id === previous[i])) next.push(next.shift()!)
  return next
}

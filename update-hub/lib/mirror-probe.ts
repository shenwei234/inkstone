// 加速源连通性探测（浏览器直连 ghproxy 系代理，Range 只取前 2KB 实测延迟）。

export interface MirrorProbeResult {
  url: string
  latency: number // 毫秒；-1 不可达
}

export async function probeMirror(
  url: string,
  timeoutMs = 12000,
  bytes = 2048
): Promise<number> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const start = performance.now()
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Range: `bytes=0-${bytes - 1}` },
    })
    if (!res.ok && res.status !== 206) return -1
    if (res.body) {
      const reader = res.body.getReader()
      let read = 0
      while (read < bytes) {
        const { done, value } = await reader.read()
        if (done) break
        read += value?.length ?? 0
      }
      reader.cancel().catch(() => null)
    }
    return Math.round(performance.now() - start)
  } catch {
    return -1
  } finally {
    clearTimeout(timer)
  }
}

/** 并发探测多个加速源（含直连），按延迟升序返回 */
export async function probeMirrors(
  targets: string[],
  timeoutMs = 12000
): Promise<MirrorProbeResult[]> {
  const results = await Promise.all(
    targets.map(async (url) => ({ url, latency: await probeMirror(url, timeoutMs) }))
  )
  return results.sort((a, b) => {
    if (a.latency < 0) return 1
    if (b.latency < 0) return -1
    return a.latency - b.latency
  })
}

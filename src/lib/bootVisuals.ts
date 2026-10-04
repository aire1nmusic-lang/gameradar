/** Wait for the actual responsive hall background and its three card images. */
export function waitForHomeVisuals(root: HTMLElement, signal: AbortSignal): Promise<void> {
  if (window.location.pathname !== '/') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const decoded = new Map<HTMLImageElement, string>()
    const decoding = new Map<HTMLImageElement, string>()
    const watched = new Set<HTMLImageElement>()
    let done = false
    const cleanup = () => {
      observer.disconnect()
      window.clearTimeout(timeout)
      window.removeEventListener('resize', scan)
      signal.removeEventListener('abort', abort)
      for (const image of watched) {
        image.removeEventListener('load', scan)
        image.removeEventListener('error', scan)
      }
    }
    const finish = (error?: Error) => {
      if (done) return
      done = true
      cleanup()
      if (error) reject(error)
      else resolve()
    }
    const abort = () => finish(new Error('Boot cancelled'))
    function scan() {
      if (done) return
      const images = [...root.querySelectorAll<HTMLImageElement>('[data-boot-visual]')]
        .filter(image => image.getBoundingClientRect().width > 0)
      // Hidden desktop/mobile branches do not block one another.
      if (images.length !== 4) return
      for (const image of images) {
        if (!watched.has(image)) {
          watched.add(image)
          image.addEventListener('load', scan)
          image.addEventListener('error', scan)
        }
        if (!image.complete) continue
        if (!image.naturalWidth) return finish(new Error('Home image failed'))
        const source = image.currentSrc || image.src
        if (decoded.get(image) === source || decoding.get(image) === source) continue
        decoding.set(image, source)
        image.decode().then(() => {
          if (done) return
          decoded.set(image, source)
          decoding.delete(image)
          scan()
        }).catch(() => {
          if (done) return
          decoding.delete(image)
          if ((image.currentSrc || image.src) !== source) scan()
          else finish(new Error('Home image decode failed'))
        })
      }
      if (images.every(image => image.complete && image.naturalWidth > 0 && decoded.get(image) === (image.currentSrc || image.src))) finish()
    }
    const observer = new MutationObserver(scan)
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] })
    const timeout = window.setTimeout(() => finish(new Error('Home visuals timed out')), 30000)
    signal.addEventListener('abort', abort, { once: true })
    window.addEventListener('resize', scan)
    if (signal.aborted) abort()
    else scan()
  })
}

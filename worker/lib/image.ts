/**
 * Reads the type and pixel size of an uploaded logo from its header bytes,
 * so the declared Content-Type cannot disguise another kind of file.
 * PNG, JPEG and WebP only; SVG (scriptable) is never accepted.
 */
export interface ImageInfo {
  mime: 'image/png' | 'image/jpeg' | 'image/webp'
  width: number
  height: number
  animated: boolean
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1]
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n))

export function imageInfo(b: Uint8Array): ImageInfo | undefined {
  if (b.length < 30) return undefined

  // PNG: signature, then IHDR with width and height; an acTL chunk means APNG.
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && ascii(b, 12, 4) === 'IHDR') {
    let animated = false
    for (let i = 8; i + 8 <= b.length; ) {
      const len = u32be(b, i)
      const type = ascii(b, i + 4, 4)
      if (type === 'acTL') animated = true
      if (type === 'IDAT' || type === 'IEND') break
      i += 12 + len
    }
    return { mime: 'image/png', width: u32be(b, 16), height: u32be(b, 20), animated }
  }

  // JPEG: walk the markers to the first start-of-frame.
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) return undefined
      const marker = b[i + 1]
      if (marker === 0xff) { i++; continue }
      const len = u16be(b, i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: 'image/jpeg', height: u16be(b, i + 5), width: u16be(b, i + 7), animated: false }
      }
      i += 2 + len
    }
    return undefined
  }

  // WebP: RIFF container with a VP8 / VP8L / VP8X first chunk.
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    const chunk = ascii(b, 12, 4)
    if (chunk === 'VP8 ') return { mime: 'image/webp', width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff, animated: false }
    if (chunk === 'VP8L') {
      const [b0, b1, b2, b3] = [b[21], b[22], b[23], b[24]]
      return { mime: 'image/webp', width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)), animated: false }
    }
    if (chunk === 'VP8X') return { mime: 'image/webp', width: 1 + u24le(b, 24), height: 1 + u24le(b, 27), animated: (b[20] & 0x02) !== 0 }
  }
  return undefined
}

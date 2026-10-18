// Barcode scanning for the food diary.
//
// The browser's own BarcodeDetector where it has one (Chrome on Android). Everywhere else —
// iPhone above all — the same API from the `barcode-detector` ponyfill over zxing-cpp in
// WebAssembly. Both the ponyfill and its ~1 MB .wasm load only when the scanner opens, and the
// .wasm is served by this app (Vite emits it as an asset) — never fetched from a CDN, so the
// scanner works offline and no third party learns who is scanning.

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

export const cameraSupported = () => !!navigator.mediaDevices?.getUserMedia

export async function createDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const have = await window.BarcodeDetector.getSupportedFormats()
      const ok = FORMATS.filter(f => have.includes(f))
      if (ok.length) return new window.BarcodeDetector({ formats: ok })
    } catch { /* fall through to the ponyfill */ }
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url')
  ])
  prepareZXingModule({
    overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) }
  })
  return new BarcodeDetector({ formats: FORMATS })
}

/**
 * Start the back camera into `video` and call onCode(code) once a barcode is read.
 * Returns stop(). Must be called from a tap — iOS only grants the camera to a user gesture.
 */
export async function scan(video, onCode) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
  video.srcObject = stream
  video.setAttribute('playsinline', '')
  await video.play()
  const detector = await createDetector()
  let stopped = false
  const stop = () => { stopped = true; stream.getTracks().forEach(t => t.stop()); video.srcObject = null }
  const tick = async () => {
    if (stopped) return
    try {
      const found = await detector.detect(video)
      const code = found.find(b => /^\d{6,14}$/.test(b.rawValue))?.rawValue
      if (code) { stop(); onCode(code); return }
    } catch { /* frame not ready yet */ }
    setTimeout(tick, 250)
  }
  tick()
  return stop
}

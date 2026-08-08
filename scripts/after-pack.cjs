const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const path = require('node:path')

const run = promisify(execFile)

/**
 * Local macOS builds have no paid Developer ID certificate, but they still
 * need a coherent code identity for TCC (microphone permission). Electron's
 * untouched linker signature identifies the executable as "Electron" and
 * macOS cannot reliably attach Vilo's consent to it.
 *
 * electron-builder runs this hook before its normal signing stage. When a real
 * Developer ID is available later, that proper signature replaces this local
 * ad-hoc one; otherwise test builds at least carry com.vilo.app consistently.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  // Universal packaging first creates two temporary single-architecture apps
  // and then compares/merges them. Signing those halves makes CodeResources
  // differ and prevents the merge; sign only the combined app that follows.
  if (context.appOutDir.endsWith('-temp')) return

  const product = context.packager.appInfo.productFilename
  const app = path.join(context.appOutDir, `${product}.app`)
  await run('/usr/bin/codesign', [
    '--force',
    '--deep',
    '--sign',
    '-',
    '--identifier',
    'com.vilo.app',
    '--timestamp=none',
    app
  ])
}

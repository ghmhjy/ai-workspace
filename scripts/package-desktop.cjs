const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '..')
const outputRoot = path.join(projectRoot, 'outputs', 'release')
const unpacked = path.join(outputRoot, 'win-unpacked')
const unpackedTemp = `${unpacked}.tmp`
const appBundle = path.join(unpacked, 'resources', 'app')
const nodeCommand = process.execPath
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const viteCli = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const builderCli = path.join(projectRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))

function copy(source, destination) {
  fs.cpSync(source, destination, { recursive: true, force: true })
}

console.log('Building the renderer...')
execFileSync(nodeCommand, [viteCli, 'build'], { cwd: projectRoot, stdio: 'inherit' })

fs.mkdirSync(outputRoot, { recursive: true })
fs.rmSync(unpacked, { recursive: true, force: true })
fs.rmSync(unpackedTemp, { recursive: true, force: true })

console.log('Preparing the standalone Electron runtime...')
try {
    execFileSync(nodeCommand, [builderCli, '--win', 'dir', '--publish', 'never'], { cwd: projectRoot, stdio: 'inherit' })
} catch (error) {
  if (!fs.existsSync(unpackedTemp)) throw error
  console.log('Recovering the Windows runtime staging directory...')
  try {
    fs.renameSync(unpackedTemp, unpacked)
  } catch {
    // Some Windows security tools keep the extracted staging directory open briefly.
    // Copying its contents is equivalent for electron-builder and avoids that rename race.
    copy(unpackedTemp, unpacked)
  }
}

if (!fs.existsSync(unpacked)) throw new Error(`Electron runtime staging failed at ${unpacked}`)

// A Windows security tool can interrupt electron-builder while it is renaming
// the generic runtime executable. Never ship an installer with electron.exe as
// the application entry point or the installed shortcut will be broken.
const productName = packageJson.build?.productName || packageJson.productName || 'Local AI'
const expectedExecutable = path.join(unpacked, `${productName}.exe`)
const genericExecutable = path.join(unpacked, 'electron.exe')
if (!fs.existsSync(expectedExecutable) && fs.existsSync(genericExecutable)) {
  fs.renameSync(genericExecutable, expectedExecutable)
}
if (!fs.existsSync(expectedExecutable)) throw new Error(`Packaged application executable is missing at ${expectedExecutable}`)

console.log('Assembling the standalone Electron app...')
fs.mkdirSync(appBundle, { recursive: true })
copy(path.join(projectRoot, 'dist'), path.join(appBundle, 'dist'))
copy(path.join(projectRoot, 'electron'), path.join(appBundle, 'electron'))
copy(path.join(projectRoot, 'package.json'), path.join(appBundle, 'package.json'))
console.log('Installing production runtime dependencies into the app bundle...')
execFileSync(npmCommand, ['install', '--prefix', appBundle, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'], { cwd: appBundle, stdio: 'inherit' })

const publish = packageJson.build?.win?.publish || packageJson.build?.publish
if (publish && publish.provider === 'github') {
  const updateConfig = [
    'provider: github',
    `owner: ${publish.owner}`,
    `repo: ${publish.repo}`,
    `releaseType: ${publish.releaseType || 'release'}`
  ].join('\n') + '\n'
  fs.writeFileSync(path.join(unpacked, 'resources', 'app-update.yml'), updateConfig, 'utf8')
}

console.log('Creating the Windows NSIS installer...')
execFileSync(nodeCommand, [builderCli, '--win', 'nsis', '--publish', 'never', '--prepackaged', unpacked], { cwd: projectRoot, stdio: 'inherit' })

console.log(`Installer output: ${path.join(outputRoot, `Local AI Setup ${packageJson.version}.exe`)}`)

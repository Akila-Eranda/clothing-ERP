const fs = require('fs')
const path = require('path')

const releaseDir = path.join(__dirname, '..', 'release')
const destDir = path.join(__dirname, '..', '..', 'web', 'public', 'downloads')

const patterns = [/^HexaOne-Setup\.exe$/i, /^latest\.yml$/i, /\.blockmap$/i, /^builder-debug\.yml$/i]

function main() {
  if (!fs.existsSync(releaseDir)) {
    console.error('No release folder. Run: pnpm desktop:dist')
    process.exit(1)
  }
  fs.mkdirSync(destDir, { recursive: true })
  const files = fs.readdirSync(releaseDir).filter((name) => patterns.some((re) => re.test(name)))
  if (!files.length) {
    console.error('No installer artifacts found in', releaseDir)
    process.exit(1)
  }
  for (const name of files) {
    if (name === 'builder-debug.yml') continue
    const from = path.join(releaseDir, name)
    const to = path.join(destDir, name)
    fs.copyFileSync(from, to)
    console.log('copied', name, '->', to)
  }
  console.log('Done. Host /downloads for auto-update (latest.yml + HexaOne-Setup.exe).')
}

main()

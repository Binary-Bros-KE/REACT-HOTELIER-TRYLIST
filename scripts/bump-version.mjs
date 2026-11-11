// Bumps the app version by one step. Each part runs 0-9 only: after x.y.9
// comes x.(y+1).0, after x.9.9 comes (x+1).0.0. There is never a 10.
// Usage: npm run bump
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
let [major, minor, patch] = pkg.version.split('.').map(Number)
patch += 1
if (patch > 9) { patch = 0; minor += 1 }
if (minor > 9) { minor = 0; major += 1 }
const next = `${major}.${minor}.${patch}`
execSync(`npm version ${next} --no-git-tag-version --allow-same-version`, { stdio: 'ignore' })
console.log(`${pkg.version} -> ${next}`)

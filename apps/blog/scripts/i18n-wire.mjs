// Adds the i18n import + `const { copy } = useI18n()` to every file that references copy()
// but has not been wired yet. Reports anything it cannot place so it can be done by hand.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const files = execSync('git ls-files src', { encoding: 'utf8' })
	.split('\n')
	.filter(f => /\.tsx?$/.test(f))

const unplaced = []
let wired = 0

for (const file of files) {
	let source = readFileSync(file, 'utf8')
	if (!/\bcopy\(/.test(source)) continue
	if (source.includes("from '@/i18n'")) continue

	const eol = source.includes('\r\n') ? '\r\n' : '\n'
	const lines = source.split(eol)
	const importIdx = lines.map((l, i) => (l.startsWith('import ') ? i : -1)).filter(i => i >= 0)
	if (!importIdx.length) {
		unplaced.push(`${file} (no imports)`)
		continue
	}
	lines.splice(importIdx[importIdx.length - 1] + 1, 0, "import { useI18n } from '@/i18n'")
	source = lines.join(eol)
	if (!source.startsWith("'use client'")) source = `'use client'${eol}${eol}${source}`

	// Place the hook at the top of the component body that actually uses copy().
	const bodyRe = /^(\s*)(export default function \w+\([^)]*\)[^{]*\{|export function \w+\([^)]*\)[^{]*\{|(?:export )?(?:const|function) \w+ ?[:=]? ?(?:\([^)]*\)|function ?\([^)]*\))(?:: [^=>{]+)? ?(?:=>)? ?\{)$/gm
	let placed = false
	let match
	while ((match = bodyRe.exec(source))) {
		const bodyStart = match.index + match[0].length
		const rest = source.slice(bodyStart)
		const nextBody = rest.search(/^\S/m)
		const scope = nextBody === -1 ? rest : rest.slice(0, nextBody)
		if (!/\bcopy\(/.test(scope)) continue
		if (/const \{[^}]*copy[^}]*\} = useI18n\(\)/.test(scope)) {
			placed = true
			break
		}
		source = source.slice(0, bodyStart) + `${eol}${match[1]}\tconst { copy } = useI18n()` + source.slice(bodyStart)
		placed = true
		break
	}
	if (!placed) {
		unplaced.push(file)
		continue
	}
	writeFileSync(file, source)
	wired += 1
}

console.log(`wired ${wired} files`)
if (unplaced.length) console.log('needs manual placement:', unplaced)

// Temporary migration helper: rewrites hardcoded Chinese into the copy(zh, en) idiom and
// makes sure the module can reach it. Deleted once the migration is done.
import { readFileSync, writeFileSync } from 'node:fs'

const CJK = /[一-鿿]/

function ensureCopy(source, mode) {
	if (source.includes("from '@/i18n'")) return source
	let text = source
	const lines = text.split('\n')
	const imports = lines.map((l, i) => (l.startsWith('import ') ? i : -1)).filter(i => i >= 0)
	const importLine = mode === 'service' ? "import { readStoredLanguage } from '@/i18n'" : "import { useI18n } from '@/i18n'"
	if (imports.length) lines.splice(imports[imports.length - 1] + 1, 0, importLine)
	else lines.unshift(importLine)
	text = lines.join('\n')

	if (mode === 'service') {
		// Plain modules resolve the stored choice once per call instead of using a hook.
		return text.replace(
			/^(export (?:async )?function \w+\([^)]*\)[^{]*\{)$/m,
			"$1\n\tconst copy = (zh: string, en: string) => (readStoredLanguage() === 'zh' ? zh : en)"
		)
	}

	if (!text.startsWith("'use client'")) text = "'use client'\n\n" + text
	const match = text.match(
		/^(export default function \w+\([^)]*\)[^{]*\{|export function \w+\([^)]*\)[^{]*\{|(?:export )?const \w+ = \([^)]*\)(?:: [^=]+)? => \{)$/m
	)
	if (match) {
		const at = match.index + match[0].length
		text = text.slice(0, at) + '\n\tconst { copy } = useI18n()' + text.slice(at)
	}
	return text
}

export function apply(edits, mode = 'component') {
	for (const [file, subs] of Object.entries(edits)) {
		let source = readFileSync(file, 'utf8')
		for (const [from, to] of subs) {
			if (!source.includes(from)) {
				console.log(`MISS ${file} :: ${from.slice(0, 65)}`)
				continue
			}
			source = source.split(from).join(to)
		}
		source = ensureCopy(source, mode)
		writeFileSync(file, source)
		const left = source
			.split('\n')
			.filter(l => CJK.test(l) && !/copy\(/.test(l) && !/^\s*(\/\/|\/\*|\*)/.test(l))
		if (left.length) console.log(`${file} -> ${left.length} left:`, left.map(l => l.trim().slice(0, 55)))
	}
}

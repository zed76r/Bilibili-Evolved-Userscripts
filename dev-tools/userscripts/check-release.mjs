import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import vm from 'node:vm'

const directory = new URL('./dist/', import.meta.url)
assert.deepEqual(readdirSync(directory).sort(), ['bilibili-evolved.meta.js', 'bilibili-evolved.user.js'])
const script = readFileSync(new URL('bilibili-evolved.user.js', directory), 'utf8')
const metadata = readFileSync(new URL('bilibili-evolved.meta.js', directory), 'utf8')
assert.ok(script.startsWith(metadata.trimEnd()), 'Full script and update metadata must match')
const fields = [...metadata.matchAll(/^\/\/ @(\S+)\s+(.+)$/gm)]
const values = name => fields.filter(([, key]) => key === name).map(([, , value]) => value)
assert.deepEqual(values('name'), ['Bilibili Evolved (Userscripts Preview)'])
assert.equal(values('version').length, 1)
assert.match(values('version')[0], /^\d{8}\.\d{6}$/)
const base = 'https://github.com/zed76r/Bilibili-Evolved-Userscripts/releases/latest/download'
assert.deepEqual(values('updateURL'), [`${base}/bilibili-evolved.meta.js`])
assert.deepEqual(values('downloadURL'), [`${base}/bilibili-evolved.user.js`])
assert.ok(script.length > metadata.length + 100_000, 'Expected a complete core bundle')
new vm.Script(script)
console.log('Userscripts release: matching metadata, update URLs, full bundle and JavaScript syntax OK')

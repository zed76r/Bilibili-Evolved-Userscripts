import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { randomUUID } from 'node:crypto'

const source = ts.transpileModule(readFileSync(new URL('../../src/client/userscripts-page.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

class CustomEvent extends Event {
  constructor(name, { detail }) { super(name); this.detail = detail }
}
const setup = ({ blocked = false } = {}) => {
  const nodes = new Map()
  class Node extends EventTarget {
    attrs = new Map()
    setAttribute(key, value) { this.attrs.set(key, String(value)) }
    getAttribute(key) { return this.attrs.get(key) ?? null }
    removeAttribute(key) { this.attrs.delete(key) }
    remove() { nodes.delete(this.id) }
  }
  const handlers = new Map()
  const calls = []
  const player = {
    getManifest: () => ({ aid: 1, cid: 2, bvid: 'BVtest', secret: 'never-export' }),
    getCurrentTime: () => 12,
    seek: function (time) { assert.equal(this, player); calls.push(time) },
    on: (name, callback) => handlers.set(name, callback),
    off: (name, callback) => { if (handlers.get(name) === callback) handlers.delete(name) },
  }
  const page = { player, nano: { EventType: { Player_Play: 'native-play', Player_Pause: 'native-pause' } } }
  const doc = {
    createElement: tag => Object.assign(new Node(), { tag }),
    getElementById: id => nodes.get(id),
    head: { append(...items) {
      for (const node of items) {
        nodes.set(node.id, node)
        if (node.tag === 'script' && !blocked) vm.runInNewContext(node.textContent, { document: doc, window: page, CustomEvent })
      }
    } },
  }
  const exports = {}
  vm.runInNewContext(source, { exports, document: doc, window: {}, crypto: { randomUUID }, Event, CustomEvent, console })
  return { bridge: exports.createUserscriptsPageBridge(doc), page, handlers, calls, nodes }
}

test('isolated facade reads live public IDs only and keeps the page receiver', () => {
  const { bridge, page, calls, nodes } = setup()
  assert.deepEqual(JSON.parse(JSON.stringify(bridge.getState())), { aid: '1', cid: '2', bvid: 'BVtest', player: true })
  assert.equal(bridge.player.getCurrentTime(), 12)
  bridge.player.seek(18)
  assert.deepEqual(calls, [18])
  page.player.getManifest = () => ({ aid: 3, cid: 4, bvid: 'BVnext' })
  assert.equal(bridge.getState().cid, '4')
  assert.equal(nodes.size, 0, 'RPC channel is detached to avoid mutation loops')
})

test('does not expose arbitrary page properties, code evaluation or GM APIs', () => {
  const { bridge, page } = setup()
  page.player.eval = assert.fail
  page.player.GM_xmlhttpRequest = assert.fail
  assert.equal(bridge.player.eval, undefined)
  assert.equal(bridge.player.GM_xmlhttpRequest, undefined)
  assert.equal(bridge.player.getManifest, undefined)
  assert.throws(() => bridge.player.seek({ arbitrary: 'object' }), /API/)
})

test('play subscriptions support once and removal without duplicate callbacks', () => {
  const { bridge, handlers } = setup()
  let count = 0
  const callback = () => count++
  bridge.player.on('play', callback)
  handlers.get('native-play')()
  assert.equal(count, 1)
  bridge.player.off('play', callback)
  assert.equal(handlers.size, 0)
  bridge.player.once('pause', callback)
  handlers.get('native-pause')()
  assert.equal(count, 2)
  assert.equal(handlers.size, 0)
})

test('does not claim readiness when CSP prevents page execution', () => {
  assert.equal(setup({ blocked: true }).bridge, undefined)
})

test('handles an uninitialized player and a throwing manifest without stale data', () => {
  const { bridge, page } = setup()
  page.player.getManifest = () => { throw new Error('not ready') }
  assert.equal(bridge.getState().cid, undefined)
  page.player = undefined
  assert.equal(bridge.getState().player, false)
})


test('rebinds persistent playback listeners when SPA navigation replaces the player', () => {
  const { bridge, page, handlers } = setup()
  let count = 0
  const callback = () => count++
  bridge.player.on('play', callback)
  const replacement = new Map()
  page.player = {
    on: (type, listener) => replacement.set(type, listener),
    off: type => replacement.delete(type),
  }
  bridge.getState()
  assert.equal(handlers.size, 0)
  replacement.get('native-play')()
  assert.equal(count, 1)
  bridge.player.off('play', callback)
  assert.equal(replacement.size, 0)
})

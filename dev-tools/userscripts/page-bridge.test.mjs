import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { randomUUID } from 'node:crypto'

const source = ts.transpileModule(readFileSync(new URL('../../src/client/userscripts-page.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const playerAgentSource = ts.transpileModule(readFileSync(new URL('../../src/components/video/player-agent/base.ts', import.meta.url), 'utf8'), {
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
    getManifest: () => ({ aid: 1, cid: 2, bvid: 'BVtest', hasPrev: true, hasNext: false, secret: 'never-export' }),
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
const createPlayerAgent = bridge => {
  const exports = {}
  vm.runInNewContext(playerAgentSource, {
    exports,
    require: name => name === './types' ? { PlayerAgentEventTypes: { Play: 'play', Pause: 'pause' } } : {},
    EventTarget,
    unsafeWindow: { player: bridge.player, nano: bridge.nano },
  })
  return new exports.PlayerAgent()
}

test('isolated facade reads live public IDs only and keeps the page receiver', () => {
  const { bridge, page, calls, nodes } = setup()
  assert.deepEqual(JSON.parse(JSON.stringify(bridge.getState())), { aid: '1', cid: '2', bvid: 'BVtest', player: true })
  assert.equal(bridge.player.getCurrentTime(), 12)
  bridge.player.seek(18)
  assert.deepEqual(calls, [18])
  assert.deepEqual(JSON.parse(JSON.stringify(bridge.player.getManifest())), { hasPrev: true, hasNext: false })
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
  assert.equal(bridge.player.prev, undefined)
  assert.equal(bridge.player.next, undefined)
  assert.throws(() => bridge.player.seek({ arbitrary: 'object' }), /API/)
})

test('exposes only strict multipart flags and requires available methods with no arguments', () => {
  const { bridge, page } = setup()
  assert.deepEqual(JSON.parse(JSON.stringify(bridge.player.getManifest())), { hasPrev: true, hasNext: false })
  assert.throws(() => bridge.player.getManifest('unexpected'), /API/)
  page.player.getManifest = () => ({ hasPrev: 'true', hasNext: 1, secret: 'never-export' })
  assert.deepEqual(JSON.parse(JSON.stringify(bridge.player.getManifest())), { hasPrev: false, hasNext: false })
  delete page.player.getManifest
  assert.equal(bridge.player.getManifest, undefined)
})

test('part navigation requires zero arguments and does not serialize native return values', () => {
  const { bridge, page } = setup()
  assert.equal(bridge.player.prev, undefined)
  assert.equal(bridge.player.next, undefined)
  const calls = []
  page.player.prev = function () {
    assert.equal(this, page.player)
    calls.push('prev')
    return { secret: 'never-export' }
  }
  const circular = {}
  circular.self = circular
  page.player.next = function () {
    assert.equal(this, page.player)
    calls.push('next')
    return circular
  }
  assert.throws(() => bridge.player.prev(1), /API/)
  assert.throws(() => bridge.player.next('unexpected'), /API/)
  assert.equal(bridge.player.prev(), undefined)
  assert.equal(bridge.player.next(), undefined)
  assert.deepEqual(calls, ['prev', 'next'])
  delete page.player.prev
  assert.equal(bridge.player.prev, undefined)
})

test('PlayerAgent part navigation calls through the page bridge', () => {
  const { bridge, page } = setup()
  const calls = []
  page.player.getManifest = () => ({ hasPrev: true, hasNext: true, secret: 'never-export' })
  page.player.prev = function () {
    assert.equal(this, page.player)
    calls.push('prev')
    return { secret: 'never-export' }
  }
  page.player.next = function () {
    assert.equal(this, page.player)
    calls.push('next')
    return { secret: 'never-export' }
  }
  const agent = createPlayerAgent(bridge)
  assert.equal(agent.previousPart(), undefined)
  assert.equal(agent.nextPart(), undefined)
  assert.deepEqual(calls, ['prev', 'next'])
  page.player.getManifest = () => ({ hasPrev: false, hasNext: false })
  assert.equal(agent.previousPart(), null)
  assert.equal(agent.nextPart(), null)
  assert.deepEqual(calls, ['prev', 'next'])
  page.player.getManifest = () => { throw new Error('manifest unavailable') }
  assert.throws(() => agent.previousPart(), /Userscripts 页面 API 不可用/)
  assert.throws(() => agent.nextPart(), /Userscripts 页面 API 不可用/)
  assert.deepEqual(calls, ['prev', 'next'])
})

test('handoff bridge exposes only supported methods and kinds when the page loads them', () => {
  const { bridge, page } = setup()
  page.nano.HandoffKind = { Auto: 1, Abort: 0, Secret: 2 }
  let currentKind = 0
  page.player.getHandoff = () => currentKind
  page.player.setHandoff = kind => {
    currentKind = kind
  }
  assert.equal(bridge.nano.HandoffKind.Auto, 1)
  assert.equal(bridge.nano.HandoffKind.Abort, 0)
  assert.equal(bridge.nano.HandoffKind.Secret, undefined)
  assert.equal(bridge.player.getHandoff(), 0)
  bridge.player.setHandoff(bridge.nano.HandoffKind.Auto)
  assert.equal(bridge.player.getHandoff(), 1)
  page.player.setHandoff = kind => {
    currentKind = kind
    return { secret: 'not-public' }
  }
  assert.equal(bridge.player.setHandoff(bridge.nano.HandoffKind.Abort), undefined)
  assert.equal(bridge.player.getHandoff(), 0)
  page.player.setHandoff = kind => {
    currentKind = kind
    const result = {}
    result.self = result
    return result
  }
  assert.equal(bridge.player.setHandoff(bridge.nano.HandoffKind.Auto), undefined)
  assert.equal(bridge.player.getHandoff(), 1)
  assert.throws(() => bridge.player.setHandoff(2), /API/)
  page.player.getHandoff = () => ({ secret: 'not-public' })
  assert.throws(() => bridge.player.getHandoff(), /API/)
  page.nano.HandoffKind = undefined
  assert.throws(() => bridge.nano.HandoffKind.Auto, /API/)
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


test('Userscripts skips the legacy ID polyfill while Tampermonkey retains it', async () => {
  const polyfillSource = ts.transpileModule(readFileSync(new URL('../../src/components/video/player-adaptor/v4.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  for (const scriptHandler of ['Userscripts', 'Tampermonkey']) {
    const { bridge } = setup()
    let selections = 0
    let observer
    const exports = {}
    vm.runInNewContext(polyfillSource, {
      exports,
      GM_info: { scriptHandler },
      unsafeWindow: { player: bridge.player },
      lodash: { once: callback => callback },
      require(name) {
        if (name === '@/core/spin-query') return { select: async () => { selections++; return bridge.player } }
        if (name === '@/core/observer') return { allMutations: callback => { observer = callback } }
        if (name === '@/core/utils/log') return { useScopedConsole: () => console }
        return {}
      },
    })
    exports.v4PlayerPolyfill()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(selections, scriptHandler === 'Userscripts' ? 0 : 1)
    assert.equal(typeof observer, scriptHandler === 'Userscripts' ? 'undefined' : 'function')
  }
})

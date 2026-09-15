import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the actual exported function, with browser and polling boundaries supplied
// by the harness. Loading the whole utils module would initialize unrelated UI code.
const path = new URL('../../src/core/utils/index.ts', import.meta.url)
const source = readFileSync(path, 'utf8')
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true)
const declaration = ast.statements.find(
  node =>
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(d => d.name.getText(ast) === 'playerReady'),
)
const compiled = ts.transpileModule(declaration.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText

const harness = ({
  handler = 'Userscripts',
  mounted = true,
  embedded = false,
  wasm = false,
} = {}) => {
  const pollQueries = []
  const errors = []
  let pollStep
  const container = {
    querySelector(selector) {
      if (selector === '.bpx-player-control-wrap') return mounted ? {} : null
      if (selector.includes('video')) {
        assert.ok(selector.includes('bwp-video'), 'WASM video DOM must be supported')
        return mounted ? { tagName: wasm ? 'BWP-VIDEO' : 'VIDEO' } : null
      }
      return null
    },
  }
  const document = {
    URL: 'https://www.bilibili.com/video/BV-test/',
    querySelector(selector) {
      assert.equal(selector, '.bpx-player-container')
      return container
    },
  }
  const page = {}
  const context = {
    exports: {},
    document,
    GM_info: { scriptHandler: handler },
    unsafeWindow: page,
    window: { location: { search: '' } },
    console: { error: () => {} },
    isEmbeddedPlayer: () => embedded,
    require(name) {
      if (name === '../spin-query')
        return {
          sq: async (query, predicate) => {
            pollQueries.push(query)
            if (pollStep) pollStep()
            const result = query()
            return predicate(result) ? result : null
          },
        }
      if (name === './log') return { logError: error => errors.push(error) }
      throw new Error(`Unexpected dependency ${name}`)
    },
  }
  vm.runInNewContext(compiled, context)
  return {
    run: context.exports.playerReady,
    page,
    errors,
    pollQueries,
    setMounted: value => {
      mounted = value
    },
    setPollStep: fn => {
      pollStep = fn
    },
  }
}

test('Userscripts resolves for mounted player DOM without page login globals', async () => {
  const h = harness()
  await h.run()
  assert.equal(h.errors.length, 0)
  assert.equal(h.pollQueries.length, 1)
})

test('Userscripts waits for mounted controls and video and supports bwp-video', async () => {
  const h = harness({ mounted: false, wasm: true })
  h.setPollStep(() => h.setMounted(true))
  await h.run()
  assert.equal(h.errors.length, 0)
})

test('Userscripts rejects when player DOM never becomes ready', async () => {
  const h = harness({ mounted: false })
  await assert.rejects(h.run(), /播放器 DOM/)
})

test('Tampermonkey keeps its page login callback readiness path', async () => {
  const h = harness({ handler: 'Tampermonkey' })
  h.page.UserStatus = {}
  let callbackCalled = false
  h.page.onLoginInfoLoaded = resolve => {
    callbackCalled = true
    resolve()
  }
  await h.run()
  assert.equal(callbackCalled, true)
})

test('embedded player behavior stays pending without triggering a readiness error', async () => {
  const h = harness({ embedded: true })
  let settled = false
  h.run().then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false)
  assert.equal(h.errors.length, 0)
})

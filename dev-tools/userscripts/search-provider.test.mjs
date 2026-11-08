import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import lodash from 'lodash'

const compile = path =>
  ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
const ajaxSource = compile('../../src/core/ajax.ts')
const providerSource = compile('../../src/components/launch-bar/search-provider.ts')

const setup = respond => {
  const requests = []
  const errors = []
  const ajax = {}
  const context = {
    console: { error: (...args) => errors.push(args) },
    XMLHttpRequest: class {
      constructor() {
        throw new Error('Page-world XHR unavailable')
      }
    },
    GM_xmlhttpRequest: details => {
      requests.push(details)
      respond(details)
    },
  }
  vm.runInNewContext(ajaxSource, {
    ...context,
    exports: ajax,
    require: () => ({ logError() {} }),
  })
  const exports = {}
  vm.runInNewContext(providerSource, {
    ...context,
    exports,
    lodash,
    require: name => ({
      '@/core/ajax': ajax,
      '@/core/utils': { getUID: () => '' },
      './history-provider': { addHistoryItem() {} },
    })[name],
  })
  return { provider: exports.searchProvider, requests, errors }
}

test('gets suggestions through the manager request API and encodes the entire input', async () => {
  const { provider, requests } = setup(details => details.onload({
    response: JSON.stringify({
      code: 0,
      result: { tag: [{ value: '猫 & 狗', name: '猫 &amp; 狗' }] },
    }),
  }))
  const input = '猫 & 狗#音乐+动画'
  const actions = await provider.getActions(input)
  assert.equal(new URL(requests[0].url).searchParams.get('term'), input)
  assert.equal(actions[0].name, input)
  assert.equal(actions[1].suggestName, '猫 & 狗')
})

test('keeps the typed search action when the suggestion request fails', async () => {
  const { provider, errors } = setup(details => details.onerror({ status: 0 }))
  const actions = await provider.getActions('动画')
  assert.equal(actions.length, 1)
  assert.equal(actions[0].name, '动画')
  assert.equal(errors.length, 1)
})

test('finishes a timed-out suggestion request instead of keeping the list loading', async () => {
  const { provider, requests } = setup(() => {})
  const pending = provider.getActions('动画')
  assert.equal(requests[0].timeout, 5000)
  assert.equal(typeof requests[0].ontimeout, 'function')
  requests[0].ontimeout({ status: 0 })
  const actions = await pending
  assert.equal(actions.length, 1)
  assert.equal(actions[0].name, '动画')
})

test('keeps the typed search action for invalid JSON and API errors', async () => {
  for (const response of ['invalid JSON', 'null', '{"code":-1}', '{"code":0,"result":{}}']) {
    const { provider } = setup(details => details.onload({ response }))
    const actions = await provider.getActions('动画')
    assert.equal(actions.length, 1)
    assert.equal(actions[0].name, '动画')
  }
})

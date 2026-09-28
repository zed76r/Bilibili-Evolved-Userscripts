import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { parse, compileScript } from 'vue/compiler-sfc'
import * as vue from 'vue'
import lodash from 'lodash'

const require = createRequire(import.meta.url)
const descriptor = parse({
  source: readFileSync(
    new URL('../../src/components/launch-bar/LaunchBar.vue', import.meta.url),
    'utf8',
  ),
  filename: 'LaunchBar.vue',
})
const source = ts.transpileModule(compileScript(descriptor, { id: 'launch-bar-test' }).content, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
const setup = (getSearchActions, getHistoryActions) => {
  const exports = {}
  const errors = []
  const searchProvider = { name: 'search', getActions: getSearchActions }
  const historyProvider = { name: 'history', getActions: getHistoryActions }
  const modules = {
    vue: { ...vue, onMounted() {} },
    '@/ui': {},
    '@/plugins/data': { registerAndGetData: (_, value) => [value] },
    '@/core/spin-query': { select: async () => null },
    '@/core/utils/sort': { ascendingSort: getter => (a, b) => getter(a) - getter(b) },
    '@/core/utils': { matchUrlPattern: () => false },
    '@/core/observer': { urlChange() {} },
    './ActionItem.vue': { default: {} },
    './launch-bar-action': { LaunchBarActionProviders: 'launchBar.actions' },
    './search-provider': { searchProvider, search() {} },
    './history-provider': { historyProvider },
  }
  vm.runInNewContext(source, {
    exports,
    lodash,
    console: { log() {}, error: (...args) => errors.push(args) },
    require: name => modules[name] ?? require(name),
  })
  const state = exports.default.setup({}, { emit() {}, expose() {} })
  const input = value => {
    state.handleSearch({ target: { value } })
    // Attach a rejection handler so the pre-fix failure remains an assertion failure.
    const pending = state.getOnlineActions.flush()
    pending?.catch(() => {})
  }
  return { state, input, errors }
}
const settle = () => new Promise(resolve => setImmediate(resolve))
const suggestion = name => ({ name, suggestName: name, action() {} })

test('shows online candidates while the history iframe is unavailable', async () => {
  const history = deferred()
  const { state, input } = setup(
    async query => [suggestion(`${query}动画`)],
    () => history.promise,
  )
  input('哔哩')
  await settle()
  assert.equal(state.isOpen.value, true)
  assert.equal(state.actions.value[0]?.suggestName, '哔哩动画')
  history.resolve([])
  await settle()
})

test('keeps online candidates when history rejects and finishes an all-failed query', async () => {
  const failed = async () => {
    throw new Error('COLS iframe not found')
  }
  const { state, input } = setup(async query => [suggestion(query)], failed)
  input('搜索')
  await settle()
  assert.equal(state.actions.value[0]?.suggestName, '搜索')
  const allFailed = setup(failed, failed)
  allFailed.input('搜索')
  await settle()
  assert.equal(allFailed.state.noOnlineActions.value, true)
})

test('ignores late candidates from the previous query', async () => {
  const oldQuery = deferred()
  const { state, input } = setup(
    query => (query === '旧' ? oldQuery.promise : Promise.resolve([suggestion('新词')])),
    async () => [],
  )
  input('旧')
  input('新')
  await settle()
  oldQuery.resolve([suggestion('旧词')])
  await settle()
  assert.equal(state.actions.value[0]?.suggestName, '新词')
})

test('handles an unavailable history service for an empty input', async () => {
  const { state } = setup(
    async () => [],
    async () => {
      throw new Error('COLS iframe not found')
    },
  )
  await state.getActions()
  assert.equal(state.actions.value.length, 0)
})

import { getUID } from '@/core/utils'
import { monkey } from '@/core/ajax'
import { LaunchBarAction, LaunchBarActionProvider } from './launch-bar-action'
import { addHistoryItem } from './history-provider'

export const search = (keyword: string) => {
  if (!keyword) {
    return
  }
  addHistoryItem(keyword)
  const params = {
    keyword,
    from_source: 'nav_suggest_new',
  }
  window.open(`https://search.bilibili.com/all?${new URLSearchParams(params)}`, '_blank')
}
export const searchProvider: LaunchBarActionProvider = {
  name: 'search',
  getActions: async input => {
    const api = `https://s.search.bilibili.com/main/suggest?func=suggest&suggest_type=accurate&sub_type=tag&main_ver=v1&highlight=&userid=${getUID()}&bangumi_acc_num=1&special_acc_num=1&topic_acc_num=1&upuser_acc_num=3&tag_num=10&special_num=10&bangumi_num=10&upuser_num=3&term=${encodeURIComponent(
      input,
    )}`
    const results: LaunchBarAction[] = [
      {
        name: input,
        icon: 'search',
        content: async () =>
          Vue.extend({
            render: h => {
              const content = h(
                'div',
                {
                  class: 'suggest-highlight',
                },
                [input],
              )
              return content
            },
          }),
        action: () => search(input),
      },
    ]
    let json: { code: number; result?: { tag?: { value: string; name: string }[] } }
    try {
      json = JSON.parse(await monkey<string>({ url: api, responseType: 'text', timeout: 5000 }))
    } catch {
      console.error('Failed to get search suggestions.')
      return results
    }
    const suggests = json?.result?.tag
    if (json?.code !== 0 || !Array.isArray(suggests)) {
      return results
    }
    results.push(
      ...suggests.map(
        (result): LaunchBarAction => ({
          name: `${input}.${result.value}`,
          icon: 'search',
          suggestName: result.value,
          content: async () =>
            Vue.extend({
              render: h => {
                const content = h('div', {
                  domProps: {
                    innerHTML: result.name.replace(/suggest_high_light/g, 'suggest-highlight'),
                  },
                })
                return content
              },
            }),
          action: () => search(result.value),
        }),
      ),
    )
    return lodash.uniqBy(results, it => it.name)
  },
}

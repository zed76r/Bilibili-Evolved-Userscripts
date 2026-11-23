import { CheckRule } from '../types'

const allowedBaseRefs = ['preview-features', 'preview-fixes']

export const baseBranchRule: CheckRule = {
  name: 'base-branch',
  check: ({ baseRef }) => {
    const allowedRefs =
      process.env.GITHUB_REPOSITORY === 'zed76r/Bilibili-Evolved-Userscripts'
        ? ['main', ...allowedBaseRefs]
        : allowedBaseRefs
    if (!baseRef || allowedRefs.includes(baseRef)) {
      return {}
    }
    return {
      errors: [`pull request base branch must be ${allowedRefs.join(' or ')}, got ${baseRef}.`],
    }
  },
}

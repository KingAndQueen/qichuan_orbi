import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import nextPlugin from '@next/eslint-plugin-next'

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      'postcss.config.js',
      'postcss.config.cjs',
      'coverage/**'
    ]
  },

  // 基础配置
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      }
    },
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],

      // === [新增] 架构防御规则 ===

      // 1. 架构安全：禁止直接使用 process.env.NEXT_PUBLIC_ 变量
      // 这会导致 Docker 镜像在构建时被“锁死”到构建机器的环境（如 localhost），无法在生产环境复用。
      "no-restricted-syntax": [
        "error",
        {
          "selector": "MemberExpression[object.meta.name!='import'][object.name='process'][property.name='env'] MemberExpression[property.name=/^NEXT_PUBLIC_/]",
          "message": "❌ 架构警告: 禁止直接使用 NEXT_PUBLIC_ 环境变量配置 URL。这会导致 Docker 镜像在构建时锁死环境地址。请使用相对路径 (/api/...) 配合 Nginx 转发，或使用动态 Window 属性。"
        }
      ],

      // 2. 代码质量：强制文件行数限制
      // 超过 400 行的文件会导致 AI 上下文命中率下降，增加幻觉风险。
      "max-lines": [
        "warn", // 暂用 warn 提示，建议 AI 进行拆分。成熟后可改为 error。
        {
          "max": 400,
          "skipBlankLines": true,
          "skipComments": true
        }
      ]
      // ==========================
    },
  },

  // 测试文件的特定配置
  {
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      globals: {
        ...globals.jest,
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      // 测试文件允许长一点
      "max-lines": "off"
    }
  },

  // Next.js 配置文件的特定配置
  {
    files: ['next.config.mjs', 'next.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      }
    },
    rules: {
      'no-undef': 'off',
    }
  },

  // Floating UI 组件的特定配置
  {
    files: ['components/ui/Dropdown.tsx', 'components/ui/Tooltip.tsx'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/refs': 'off',
    }
  },

  // E2E Playwright 测试文件配置
  // Playwright fixture 中的 use() 不是 React Hook
  {
    files: ['e2e/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'max-lines': 'off',
    }
  },
]
import { Suspense } from 'react'
import LoginForm from './LoginForm' // 1. 导入新创建的客户端组件

// 2. 移除了 "use client" - 这现在是一个服务端组件 (RSC)
export default function SiteLoginPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center p-6"
      style={{ background: 'var(--color-bg-layout)' }}
    >
      <main className="flex-grow flex items-center justify-center w-full">
        {/* 3. 在 Suspense 中加载表单 */}
        <Suspense fallback={
          <div 
            className="rounded-lg border p-6 w-full max-w-sm h-[400px]" // 占位符高度
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-bg-container)',
              color: 'var(--color-text-secondary)'
            }}
          >
            加载登录框...
          </div>
        }>
          <LoginForm />
        </Suspense>
      </main>

      {/* 4. 保留原来的 Footer */}
      <footer
        className="w-full text-center p-6 text-xs"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <div className="flex flex-col sm:flex-row justify-center items-center gap-2 sm:gap-4">
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            京ICP备XXXXXXXX号-1
          </a>

          <a
            href="http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=YYYYYYYYYYYYYY"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:underline"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <img
              src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAACFElEQVR42mP8//8/AyUYB5gYIA2NxGWI/w/BwMCYyXj7EwMz+w+BGA8NJlYx4P////89+fDoHyMDIwMDw58rGP5//XvBweHjNwaG/3+X3y+fXAh3F8u3z7+////P//8/o/8/I/+/sLAwLNL5+z/D9wcjAyMjy9/PHzC8fXyF4e9nF4b3n1/9/3n+M8P1FwMDw/9nZ2f/P754+f/F8+f/P168/v/l6/c/Hx7+Z2BgYGD4fP785wsLMzO0/vobg+k/Mfy/fP78x3D+9h8GBgYGhh9/fPz94+sXy7+vXl75fvv2A8O/b96+Z2BgYGD4+PHj538+fGb4+uUrw/Xr1wg+nJyc/P/j2zcM375+YXh19QrD25t3GF7dvsNw+PALw/evXxl+fX1l+PXNF4Z3N2+Z3tx6x/Du5k0GBgYGhluv3zFcv3bJ8PPbNwy/vXjN8O2rNww/vHzF8OKSJQYjA8P/t2/fMrx+4yLD1Zu3mb4/fMBw+PAxw5VLlxh+f/mK4cW58ww/PnzCcOr0KQYjA8P/p8+fMrx7+YrhtZvXmb48f8Hw5tY7hpc2bzE8uXmN4d3d+wzv79xh+P3jB8O3b98y/P7+neH39R8M/58/fGb48/s/w4/7PzP8/PqN4c2NNwzPbd5jeHPzDsOb23cY3t+4y3B/4xbD/Zs3Gf5/ePHy/8ePnwwoAAD/6y2p9Pj5kwAAAABJRU5ErkJggg=="
              alt="公网安备图标"
              className="w-4 h-4"
            />
            <span>京公网安备 YYYYYYYYYYYYYY号</span>
          </a>
        </div>
      </footer>
    </div>
  )
}
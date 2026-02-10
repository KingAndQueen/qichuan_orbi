# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - main [ref=e3]:
      - generic [ref=e4]:
        - heading "新智流 (Orbitaskflow)" [level=1] [ref=e5]
        - paragraph [ref=e6]: 请输入账号与密码完成登录
        - generic [ref=e7]:
          - generic [ref=e8]:
            - text: 账号（邮箱 / 手机号 / 用户名）
            - textbox "账号（邮箱 / 手机号 / 用户名）" [ref=e9]:
              - /placeholder: 邮箱 / 手机号 / 用户名
              - text: test-user-a@example.com
          - generic [ref=e10]:
            - text: 密码
            - textbox "密码" [ref=e11]: TestPassword123!
          - button "登录中..." [disabled] [ref=e12]
          - paragraph [ref=e13]: 飞书、微信、企微、钉钉 等第三方登录暂未开放
    - contentinfo [ref=e14]:
      - generic [ref=e15]:
        - link "京ICP备XXXXXXXX号-1" [ref=e16] [cursor=pointer]:
          - /url: https://beian.miit.gov.cn/
        - link "公网安备图标 京公网安备 YYYYYYYYYYYYYY号" [ref=e17] [cursor=pointer]:
          - /url: http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=YYYYYYYYYYYYYY
          - img "公网安备图标" [ref=e18]
          - generic [ref=e19]: 京公网安备 YYYYYYYYYYYYYY号
  - alert [ref=e20]
```
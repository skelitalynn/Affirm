# 04 Admin 后台

## 1. 什么时候看这篇

当你要改这些内容时：

- 后台路由
- Dashboard
- 长期记忆管理
- 知识管理
- 同步任务管理
- Basic Auth / CSRF

## 2. 先读哪些文件

按顺序读：

1. `src/admin/server.js`
2. `src/admin/middleware/auth.js`
3. `src/admin/routes/profiles.js`
4. `src/admin/routes/knowledge.js`
5. `src/admin/routes/sync-jobs.js`
6. `src/admin/views/*`

## 3. 当前后台职责

### Dashboard

`/admin`

当前展示：

- Profiles 数量
- Knowledge 数量
- Messages 数量
- Sync Jobs 数量
- 队列模式
- Knowledge RAG 状态
- 最近同步任务

### Profiles

`/admin/profiles`

负责：

- 查看长期记忆记录
- 新建 / 编辑 / 删除 profile
- 直接查看结构化 `preferences`

### Knowledge

`/admin/knowledge`

负责：

- 单条新增 / 编辑 / 删除知识
- 批量导入知识
- 查看 `rag_sync` 状态
- 手动重新同步到 Haystack

### Sync Jobs

`/admin/sync-jobs`

负责：

- 查看 memory / knowledge 等异步任务
- 按状态和任务类型筛选
- 快速定位失败任务

## 4. 当前后台写入边界

- 所有 `/admin` 路由先过 Basic Auth
- 所有写请求都走 Origin / Referer 校验
- `profiles` 写操作走 `Profile` 模型
- `knowledge` 写操作走 `Knowledge` 模型，再由模型调用 provider
- `sync_jobs` 当前以只读观察为主
- 不在路由层直接拼复杂 SQL 或直接操作 Haystack 内部表

## 5. 最小验证方式

```bash
npm run admin
```

然后验证：

1. 打开 `/admin`
2. 看 Dashboard 是否能显示队列、RAG、同步任务状态
3. 进入 `/admin/profiles`，新建或编辑一条长期记忆
4. 进入 `/admin/knowledge`，新增一条知识并检查 `rag_sync`
5. 进入 `/admin/sync-jobs`，确认能看到 `memory_update` 或知识同步任务

## 6. 改后台时的固定顺序

1. 先改 route
2. 再改 model / provider
3. 最后改 view
4. 再做手工验证

## 7. 最容易犯的错

1. 把长期记忆页做成纯资料页
2. 让知识路由绕过 provider，直接回退旧本地 RAG 逻辑
3. 页面改了但状态来源没变
4. 只看“写成功”，不看同步是否成功

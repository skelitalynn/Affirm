# 04 Admin 后台

## 1. 什么时候看这篇

当你要改这些内容时：

- 后台路由
- 画像管理
- 知识管理
- 表单和列表页面
- Basic Auth / CSRF

## 2. 先读哪些文件

按顺序读：

1. `src/admin/server.js`
2. `src/admin/middleware/auth.js`
3. `src/admin/routes/profiles.js`
4. `src/admin/routes/knowledge.js`
5. `src/admin/views/*`

## 3. 当前后台模块

### Profiles

- 列表
- 新增
- 编辑
- 删除

### Knowledge

- 列表
- 单条新增
- 编辑
- 删除
- 批量导入

## 4. 后台写操作的边界

- 所有 `/admin` 路由都先过 Basic Auth
- 所有状态变更请求都要过 Origin/Referer 检查
- 知识写入最终走 `Knowledge` 模型，不要在路由里直写 SQL

## 5. 最小验证方式

```bash
npm run admin
```

然后验证：

1. 打开 `/admin`
2. 进入 `/admin/profiles`
3. 进入 `/admin/knowledge`
4. 新增一条知识
5. 导入一段长文本
6. 确认列表页能看到结果

## 6. 改后台时的固定顺序

1. 先改 route
2. 再改 model/service
3. 最后改 view
4. 再做手工验证

不要反过来先改页面，否则很容易在错误的接口上兜圈子。

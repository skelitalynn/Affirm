# Affirm项目 - 数据层API文档

## 概述
本文档描述了Affirm项目的数据库访问层API，包括数据模型、服务类和可用方法。

## 数据模型

### 1. User (用户模型)
**文件**: `src/models/user.js`
**表名**: `users`

#### 方法

##### `User.create(userData)`
创建新用户。

**参数**:
- `userData` (Object):
  - `telegram_id` (number, required): Telegram用户ID
  - `username` (string, optional): 用户名

**返回值**: Promise<Object> - 创建的用户对象

**示例**:
```javascript
const user = await User.create({
  telegram_id: 123456789,
  username: 'test_user'
});
```

##### `User.findByTelegramId(telegramId)`
根据Telegram ID查找用户。

**参数**:
- `telegramId` (number, required): Telegram用户ID

**返回值**: Promise<Object|null> - 用户对象或null

**示例**:
```javascript
const user = await User.findByTelegramId(123456789);
```

##### `User.update(telegramId, updates)`
更新用户信息。

**参数**:
- `telegramId` (number, required): Telegram用户ID
- `updates` (Object, required): 更新字段
  - `username` (string, optional): 新用户名

**返回值**: Promise<Object> - 更新后的用户对象

**示例**:
```javascript
const updatedUser = await User.update(123456789, {
  username: 'new_username'
});
```

##### `User.findAll(limit, offset)`
获取所有用户（分页）。

**参数**:
- `limit` (number, optional, default: 100): 每页数量
- `offset` (number, optional, default: 0): 偏移量

**返回值**: Promise<Array> - 用户列表

**示例**:
```javascript
const users = await User.findAll(50, 0);
```

##### `User.delete(telegramId)`
删除用户。

**参数**:
- `telegramId` (number, required): Telegram用户ID

**返回值**: Promise<boolean> - 是否删除成功

**示例**:
```javascript
const deleted = await User.delete(123456789);
```

##### `User.count()`
统计用户数量。

**返回值**: Promise<number> - 用户总数

**示例**:
```javascript
const userCount = await User.count();
```

---

### 2. Profile (用户画像模型)
**文件**: `src/models/profile.js`
**表名**: `profiles`

#### 方法

##### `Profile.create(profileData)`
创建用户画像。

**参数**:
- `profileData` (Object):
  - `user_id` (string, required): 用户UUID
  - `goals` (string, optional): 用户目标
  - `status` (string, optional, default: 'active'): 状态
  - `preferences` (Object, optional): 用户偏好设置

**返回值**: Promise<Object> - 创建的画像对象

##### `Profile.findByUserId(userId)`
根据用户ID查找画像。

**参数**:
- `userId` (string, required): 用户UUID

**返回值**: Promise<Object|null> - 画像对象或null

##### `Profile.findOrCreate(userId, defaults)`
查找或创建用户画像。

**参数**:
- `userId` (string, required): 用户UUID
- `defaults` (Object, optional): 默认值

**返回值**: Promise<Object> - 画像对象

##### `Profile.update(userId, updates)`
更新用户画像。

**参数**:
- `userId` (string, required): 用户UUID
- `updates` (Object): 更新字段
  - `goals` (string, optional): 新目标
  - `status` (string, optional): 新状态
  - `preferences` (Object, optional): 新偏好

**返回值**: Promise<Object> - 更新后的画像对象

##### `Profile.updateGoals(userId, goals)`
更新用户目标。

**参数**:
- `userId` (string): 用户UUID
- `goals` (string): 新目标

**返回值**: Promise<Object> - 更新后的画像对象

##### `Profile.updatePreferences(userId, preferences)`
更新用户偏好。

**参数**:
- `userId` (string): 用户UUID
- `preferences` (Object): 新偏好

**返回值**: Promise<Object> - 更新后的画像对象

##### `Profile.updateStatus(userId, status)`
更新用户状态。

**参数**:
- `userId` (string): 用户UUID
- `status` (string): 新状态

**返回值**: Promise<Object> - 更新后的画像对象

---

### 3. Message (消息模型)
**文件**: `src/models/message.js`
**表名**: `messages`

#### 方法

##### `Message.create(messageData)`
创建消息（自动生成向量嵌入）。

**参数**:
- `messageData` (Object):
  - `user_id` (string, required): 用户UUID
  - `role` (string, required): 角色 ('user', 'assistant', 'system')
  - `content` (string, required): 消息内容
  - `embedding` (Array<number>, optional): 向量嵌入（如未提供则自动生成）
  - `metadata` (Object, optional): 元数据

**返回值**: Promise<Object> - 创建的消息对象

##### `Message.semanticSearch(embedding, userId, limit, similarityThreshold)`
根据向量查找相似消息。

**参数**:
- `embedding` (Array<number>, required): 查询向量
- `userId` (string, optional): 用户UUID
- `limit` (number, optional, default: 10): 返回数量
- `similarityThreshold` (number, optional, default: 0.7): 相似度阈值 (0-1)

**返回值**: Promise<Array> - 相似消息和分数数组

##### `Message.semanticSearchByText(queryText, userId, limit, similarityThreshold)`
根据文本查找相似消息。

**参数**:
- `queryText` (string, required): 查询文本
- `userId` (string, optional): 用户UUID
- `limit` (number, optional, default: 10): 返回数量
- `similarityThreshold` (number, optional, default: 0.7): 相似度阈值 (0-1)

**返回值**: Promise<Array> - 相似消息和分数数组

##### `Message.findByUserId(userId, limit, offset)`
根据用户ID查找消息。

**参数**:
- `userId` (string, required): 用户UUID
- `limit` (number, optional, default: 50): 限制数量
- `offset` (number, optional, default: 0): 偏移量

**返回值**: Promise<Array> - 消息列表

##### `Message.getRecentConversation(userId, hours)`
获取最近的对话记录。

**参数**:
- `userId` (string, required): 用户UUID
- `hours` (number, optional, default: 24): 时间范围（小时）

**返回值**: Promise<Array> - 消息列表

---

### 4. Knowledge (知识片段模型)
**文件**: `src/models/knowledge.js`
**表名**: `knowledge_chunks`

#### 方法

##### `Knowledge.create(knowledgeData)`
创建知识片段（自动生成向量嵌入）。

**参数**:
- `knowledgeData` (Object):
  - `user_id` (string, required): 用户UUID
  - `content` (string, required): 知识内容
  - `source` (string, optional, default: 'user_input'): 来源

**返回值**: Promise<Object> - 创建的知识片段

##### `Knowledge.semanticSearch(queryText, userId, limit, similarityThreshold)`
语义搜索相关知识片段。

**参数**:
- `queryText` (string, required): 查询文本
- `userId` (string, optional): 用户UUID
- `limit` (number, optional, default: 10): 返回数量
- `similarityThreshold` (number, optional, default: 0.7): 相似度阈值 (0-1)

**返回值**: Promise<Array> - 相关知识和相似度分数

##### `Knowledge.createBatch(knowledgeArray)`
批量创建知识片段。

**参数**:
- `knowledgeArray` (Array<Object>, required): 知识数据数组

**返回值**: Promise<Array> - 创建的知识片段数组

---

### 5. EmbeddingService (向量嵌入服务)
**文件**: `src/services/embedding.js`

#### 方法

##### `embeddingService.generateEmbedding(text)`
生成文本的向量嵌入。

**参数**:
- `text` (string, required): 要嵌入的文本

**返回值**: Promise<Array<number>> - 向量嵌入

**示例**:
```javascript
const embedding = await embeddingService.generateEmbedding('这是一个测试文本');
```

##### `embeddingService.generateEmbeddings(texts)`
批量生成向量嵌入。

**参数**:
- `texts` (Array<string>, required): 文本数组

**返回值**: Promise<Array<Array<number>>> - 向量嵌入数组

##### `embeddingService.cosineSimilarity(vec1, vec2)`
计算两个向量的余弦相似度。

**参数**:
- `vec1` (Array<number>, required): 向量1
- `vec2` (Array<number>, required): 向量2

**返回值**: number - 余弦相似度 (-1 到 1)

##### `embeddingService.test()`
测试向量嵌入服务。

**返回值**: Promise<boolean> - 测试是否成功

---

## 数据库连接

### Database类
**文件**: `src/db/connection.js`

#### 方法

##### `db.query(text, params)`
执行SQL查询。

**参数**:
- `text` (string, required): SQL查询文本
- `params` (Array, optional): 查询参数

**返回值**: Promise<Object> - 查询结果

**示例**:
```javascript
const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
```

##### `db.transaction(callback)`
执行事务。

**参数**:
- `callback` (Function, required): 事务回调函数，接收client参数

**返回值**: Promise<any> - 回调函数的返回值

**示例**:
```javascript
const result = await db.transaction(async (client) => {
  const user = await client.query('INSERT INTO users ...');
  const profile = await client.query('INSERT INTO profiles ...');
  return { user, profile };
});
```

##### `testConnection()`
测试数据库连接。

**返回值**: Promise<boolean> - 连接是否成功

**示例**:
```javascript
const connected = await testConnection();
console.log('数据库连接:', connected ? '成功' : '失败');
```

---

## 配置管理

### 配置文件
**文件**: `src/config.js`

#### 配置项

```javascript
const config = {
  database: {
    url: 'postgresql://user:password@localhost:5432/dbname',
    pool: { max: 20, min: 5, idleTimeoutMillis: 30000 }
  },
  telegram: {
    botToken: 'your_bot_token',
    webhookUrl: '',
    adminIds: []
  },
  notion: {
    token: 'your_notion_token',
    parentPageId: 'your_parent_page_id',
    databaseId: 'your_database_id'
  },
  ai: {
    provider: 'openai',
    apiKey: 'your_api_key',
    baseURL: 'https://api.ikuncode.cc/v1',
    model: 'gpt-5.3-codex',
    temperature: 0.7,
    maxTokens: 1000
  },
  app: {
    port: 3000,
    timezone: 'Asia/Shanghai',
    logLevel: 'info',
    nodeEnv: 'development'
  },
  security: {
    jwtSecret: 'your_jwt_secret',
    encryptionKey: 'your_encryption_key',
    corsOrigins: ['http://localhost:3000']
  }
};
```

---

## 使用示例

### 1. 基本使用
```javascript
const User = require('./src/models/user');
const Message = require('./src/models/message');

// 创建用户
const user = await User.create({
  telegram_id: 123456789,
  username: 'john_doe'
});

// 创建消息（自动生成向量嵌入）
const message = await Message.create({
  user_id: user.id,
  role: 'user',
  content: '你好，我想学习编程'
});

// 语义搜索相似消息
const similarMessages = await Message.semanticSearchByText(
  '学习编程',
  user.id,
  5,
  0.6
);
```

### 2. 事务处理
```javascript
const { db } = require('./src/db/connection');

async function createUserWithProfile(userData, profileData) {
  return await db.transaction(async (client) => {
    // 在事务中执行多个操作
    const userResult = await client.query(
      'INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING *',
      [userData.telegram_id, userData.username]
    );
    
    const profileResult = await client.query(
      'INSERT INTO profiles (user_id, goals) VALUES ($1, $2) RETURNING *',
      [userResult.rows[0].id, profileData.goals]
    );
    
    return {
      user: userResult.rows[0],
      profile: profileResult.rows[0]
    };
  });
}
```

### 3. 向量操作
```javascript
const embeddingService = require('./src/services/embedding');
const Knowledge = require('./src/models/knowledge');

// 创建知识片段
const knowledge = await Knowledge.create({
  user_id: 'user-uuid',
  content: 'JavaScript是一种高级编程语言',
  source: 'learning_material'
});

// 语义搜索相关知识
const relatedKnowledge = await Knowledge.semanticSearch(
  '编程语言',
  'user-uuid',
  3,
  0.5
);

// 计算相似度
const vec1 = await embeddingService.generateEmbedding('我喜欢编程');
const vec2 = await embeddingService.generateEmbedding('编程很有趣');
const similarity = embeddingService.cosineSimilarity(vec1, vec2);
console.log('相似度:', similarity);
```

---

## 错误处理

所有模型方法都包含错误处理，常见的错误类型：

1. **数据库连接错误**: 检查数据库服务是否运行，连接字符串是否正确
2. **唯一约束冲突**: 使用 `findOrCreate` 方法或检查数据是否已存在
3. **向量嵌入生成失败**: 检查OpenAI API密钥和网络连接
4. **参数验证错误**: 确保提供了所有必需参数

**错误处理示例**:
```javascript
try {
  const user = await User.create(userData);
  console.log('用户创建成功:', user);
} catch (error) {
  if (error.code === '23505') {
    console.log('用户已存在');
    const existingUser = await User.findByTelegramId(userData.telegram_id);
    console.log('现有用户:', existingUser);
  } else {
    console.error('创建用户失败:', error.message);
  }
}
```

---

## 性能优化建议

1. **连接池**: 使用配置的连接池参数优化数据库连接
2. **批量操作**: 使用 `createBatch` 方法批量插入数据
3. **索引优化**: 确保向量列已创建适当的索引
4. **缓存策略**: 考虑实现缓存层减少数据库查询
5. **异步处理**: 使用异步操作避免阻塞主线程

---

## 版本历史

- **v1.0.0** (2026-02-27): 初始版本，完成Day 2数据层开发
- 支持用户、画像、消息、知识片段的基本CRUD操作
- 集成向量嵌入和语义搜索功能
- 包含完整的错误处理和事务支持

---

## 后续计划

1. **Day 3**: OpenClaw技能集成
2. **Day 4**: Notion集成和归档功能
3. **Day 5**: 后台管理界面
4. **Day 6**: 性能优化和测试
5. **Day 7**: 部署和监控

---

**文档版本**: 1.0.0  
**最后更新**: 2026-02-27  
**维护者**: Affirm开发团队
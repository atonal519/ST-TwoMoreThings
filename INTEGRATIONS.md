# 两三事的外部接口约定

## 柏宝绘（已接入调用方，真实生图待实测）

使用柏宝绘既有 `globalThis.STBaiBaiImage`、`apiVersion: 1`，读取 `getBackendStatus()`、`getCharacters()`，点击图片卡时才调用 `generate()`。不读取服务地址或密钥，不改柏宝绘代码或设置。

手机负责把照片描述、发图者和画面人物整理为场景提示。人物的外貌、体型和衣着取 `getCharacters().characters[].tag` 的完整权威串，缺档时提示用户补档。支持独立角色提示时传 `characters`；不支持时把同一份标签和自然语言外貌合入整体 `prompt/nl`。手机不维护第二个人物外貌库，服装随柏宝绘人物库当前记录。

`save: true` 让柏宝绘保存到图库，手机只存返回路径和种子。删除手机消息不会删除柏宝绘图库原图。返回没有持久路径时准确报告保存失败，不把大段 base64 写入手机存档。图库生成图不新增正文楼层。

## 构画天气（手机侧已准备，构画尚未提供）

建议构画提供下列同步只读入口；名称是本次约定，不代表构画现有版本已经实现：

```js
globalThis.STSevenDaysCal = {
  apiVersion: 1,
  getPhoneSnapshot() {
    // 从构画已加载的当前剧情快照取值；没有天气时返回 null。
    return { weather: { text: '小雨', temperature: '18°C' } };
  },
};
```

接口不触发模型、保存、额外读取整份存档或重建日历；构画是唯一权威来源。天气温度均为显示字符串，手机不换算虚构历法、不查询真实天气。

构画的展示快照更新后，可发出 `st-sevendayscal:display-changed` 事件，手机复用现有界面刷新入口；不需要轮询。没有此接口时显示固定装饰天气，装饰天气不进入模型上下文或正文回流。日历页面与月份/日程的公开合同后续单独确定。

## 随卡标记与独立版停用

卡作者可在 `data.extensions.twoMoreThings` 留下非空配置对象，标识该卡带有两三事。独立版每次打开时都会提醒，入口继续保留，不自动隐藏、互斥或接管。

设置页顶部总开关控制当前角色卡的独立版，按头像文件名标识角色卡；角色群聊使用群组标识，没有角色时使用当前聊天标识。保存于本插件全局设置的 `pocketPhone.disabledCards`；不影响其他卡、卡内版或现有档案。停用后阻止手机业务保存与正文回流；已发出的宿主/柏宝绘请求不承诺中止。

0.1.0包含随卡加载与导出，制作步骤见AUTHORING.md。酒馆助手脚本的data.twoMoreThings为作者预设的唯一来源；直接放在data.extensions.twoMoreThings的配置也可作为标记。独立版检测两种存放位置，检测仅表示配置存在，不跟踪运行状态。

卡内入口embed.js导出mountEmbedded({preset})，只显式启动，不触发独立版自动注册；共享逻辑在src/runtime.js。加载脚本在宿主realm运行核心，脚本真实pagehide时释放自己的实例、命令、悬浮球及QR，不设置切聊任务或恢复系统。

独立版仍使用pocketPhone偏好、tmt-open命令和pocket-phone-context摘要槽；卡内版使用twoMoreThingsEmbedded偏好、tmt-card-open命令和pocket-phone-context-card摘要槽。两者手机档案统一保存在当前聊天pocketPhone，作者预设仅作为无档案时的初始值，不复制第二份存档。

# DiceBear Cameo 10.6.0

- `core.js`：[@dicebear/core 10.6.0 的自包含浏览器 ESM](https://cdn.jsdelivr.net/npm/@dicebear/core@10.6.0/+esm)，原作者 Florian Körner，完整 MIT 许可见 [LICENSE](./LICENSE)。仅移除远端 source map 注释。
- `cameo.js`：[官方 Cameo 单份定义](https://cdn.hopjs.net/npm/@dicebear/styles@10.6.0/dist/cameo.min.json)，封装为本地 ES Module；定义内容不改写。Cameo 由 DiceBear 创作，采用 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)，来源及许可同时保留在定义的 `meta` 中。

[官方样式说明](https://www.dicebear.com/styles/cameo/)及[JavaScript 文档](https://www.dicebear.com/integrations/javascript/)。运行时使用本地模块生成，不请求头像服务。

新建联系人和动态路人会生成固定头像；打开或重新启用时也会补充这两类人物未人工保护的空头像。保存后保持不变，排除 `taper` 头型，其余选项沿用官方默认。`src/cameo-avatar.js` 在生成结果的 SVG 根节点添加本插件默认图来源标记，头像几何保持原样。

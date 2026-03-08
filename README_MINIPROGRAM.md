# AIA Excellence 小程序

友邦保险卓越代理团队小程序

## 项目结构

```text
aiazj_shanxinzheli/
├── app.js                    # 小程序入口文件
├── app.json                  # 小程序全局配置
├── app.wxss                  # 小程序全局样式
├── sitemap.json              # 小程序索引配置
├── project.config.json       # 项目配置文件
├── project.private.config.json # 私有配置文件
└── pages/                    # 页面目录
    ├── home/                 # 首页
    │   ├── home.wxml        # 页面结构
    │   ├── home.wxss        # 页面样式
    │   ├── home.js          # 页面逻辑
    │   └── home.json        # 页面配置
    ├── team/                 # 团队页面
    │   ├── team.wxml
    │   ├── team.wxss
    │   ├── team.js
    │   └── team.json
    ├── events/               # 活动页面
    │   ├── events.wxml
    │   ├── events.wxss
    │   ├── events.js
    │   └── events.json
    └── profile/              # 个人资料页面
        ├── profile.wxml
        ├── profile.wxss
        ├── profile.js
        └── profile.json
```

## 功能特性

### 首页 (Home)

- 公司品牌展示
- 欢迎横幅
- 关于友邦保险介绍
- 核心价值展示（使命、愿景、价值观）
- 团队统计数据

### 团队页面 (Team)

- 搜索合伙人功能
- 团队规模展示
- 合伙人网格展示
- 申请成为合伙人入口

### 活动页面 (Events)

- 活动分类标签（全部活动、正在进行、往期精彩）
- 活动卡片展示
- 活动状态标识（报名中、即将开始、已结束）
- 活动详情（时间、地点、描述）

### 个人资料页面 (Profile)

- 封面和头像展示
- 个人信息和统计数据
- 三个标签页：
  - 成就荣誉：荣誉徽章、成长足迹
  - 最近动态：时间线展示
  - 个人概览：个人简介、专业领域、联系信息
- 浮动聊天按钮
- 底部操作栏（分享、发送消息）

## 底部导航栏 (TabBar)

- 首页 (Home)
- 团队 (Team)
- 活动 (Events)

**注意**: 当前使用微信小程序默认图标。如需自定义图标，请参考下方"添加自定义 TabBar 图标"部分。

## 开发说明

### 使用微信开发者工具

1. 下载并安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开微信开发者工具
3. 导入项目，选择本项目目录
4. 使用 AppID: `wx5b741da08933b5be`
5. 开始开发和调试

### 注意事项

- 本项目已从 React + Vite 架构转换为微信小程序原生架构
- 所有页面使用 WXML、WXSS、JS、JSON 四个文件组成
- 图标使用 emoji 替代了原来的 Material Icons
- 颜色主题保持 AIA 红色 (#c20000)
- 支持深色模式的样式已转换为小程序适配方案

### 添加自定义 TabBar 图标

TabBar 需要准备以下图标资源（放在 `assets/icons/` 目录）：

- home.png / home-active.png
- team.png / team-active.png
- events.png / events-active.png

建议尺寸：81px × 81px

添加图标后，需要在 `app.json` 的 `tabBar.list` 中为每个标签页添加 `iconPath` 和 `selectedIconPath` 字段。

## 技术栈

- 微信小程序原生框架
- WXML (页面结构)
- WXSS (样式)
- JavaScript (逻辑)
- JSON (配置)

## 配置文件说明

- `app.json`: 全局配置，包括页面路径、窗口样式、TabBar 配置
- `app.js`: 小程序生命周期管理
- `app.wxss`: 全局样式，包括通用类和主题色
- `sitemap.json`: 配置小程序页面是否允许被索引
- `project.config.json`: 项目配置，包括编译设置和 AppID

## 版本信息

- 微信小程序基础库版本: 3.14.2
- 开发工具版本: 最新稳定版

# DevTools Request Formatter

[![Latest Release](https://img.shields.io/github/v/release/ifeevel/devtools-request-formatter?display_name=tag)](https://github.com/ifeevel/devtools-request-formatter/releases)
[![Release Extension Zip](https://img.shields.io/github/actions/workflow/status/ifeevel/devtools-request-formatter/release.yml?label=release%20zip)](https://github.com/ifeevel/devtools-request-formatter/actions/workflows/release.yml)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853)
![Zero Build](https://img.shields.io/badge/Build-Zero-111111)
![i18n en zh-CN](https://img.shields.io/badge/i18n-en%20%7C%20zh--CN-007AFF)
![License MIT](https://img.shields.io/badge/License-MIT-white)

[简体中文](./README.md) | [English](./README.en.md)

一个零构建的 Chrome DevTools 扩展，用于在 DevTools 内直接格式化 HTTP 请求、响应以及 WebSocket 消息数据。

![DevTools Request Formatter Screenshot](assets/screenshots/screenshot.png)

## 功能

- 在 Chrome DevTools 中新增 `Request Formatter` 面板
- 自动捕获当前页面已完成的 `Network` 请求
- 展示请求方法、URL、状态码、资源类型和耗时
- 格式化 `URL Params`、`Request Headers`、`Request Body`、`Response Headers`、`Response Body`
- 自动美化 `JSON` 与 `application/x-www-form-urlencoded` 数据
- 支持查看 `WebSocket` 握手信息、连接状态、消息列表与消息详情
- 自动格式化 `WebSocket` 文本帧中的 `JSON` 消息
- 支持过滤请求、暂停捕获、清空列表、复制格式化结果

## 项目结构

```text
devtools-request-formatter/
├── .github/workflows/release.yml
├── _locales/
├── assets/
├── scripts/package.sh
├── devtools.html
├── devtools.js
├── manifest.json
├── panel.css
├── panel.html
├── panel.js
├── LICENSE
├── README.md
└── README.en.md
```

项目保持零构建结构，扩展运行入口文件直接位于仓库根目录。

## 本地安装

1. 打开 Chrome，进入 `chrome://extensions/`
2. 开启右上角开发者模式
3. 点击加载已解压的扩展程序
4. 选择当前项目目录
5. 打开任意页面的 DevTools，即可看到新的 `Request Formatter` 面板

## 使用说明

1. 保持 `DevTools` 打开
2. 切换到 `Request Formatter` 面板
3. 刷新页面或触发接口请求
4. 在左侧列表选择请求，在右侧查看格式化后的详情
5. 需要采集 WebSocket 帧时，启用 `WebSocket` 开关

## 权限和数据边界

- `clipboardWrite`：用于复制格式化后的内容到剪贴板
- `debugger`：用于接入 Chrome DevTools Protocol，采集 WebSocket 握手信息和消息帧

注意：
- 只有在你打开 DevTools 并使用该面板时，扩展才能访问当前调试会话中可见的请求数据
- 启用 `WebSocket` 捕获时，Chrome 可能显示浏览器级的“正在调试此标签页”提示
- 是否能读取完整响应体，仍然受 Chrome DevTools API 本身能力限制

## 发布

### 本地打包

```bash
bash scripts/package.sh
```

脚本会读取 `manifest.json` 中的 `version`，并在 `release` 目录生成：

```text
release/devtools-request-formatter-v<version>.zip
```

### 发布到 GitHub Release

1. 更新 `manifest.json` 中的 `version`
2. 提交代码并打 `tag`，例如 `v0.1.0`
3. 推送 `tag` 到 `GitHub`
4. `GitHub Actions` 会自动生成 `zip` 并附加到 `Release`

## 限制

- Chrome 只会暴露 DevTools 打开期间捕获到的请求
- WebSocket 消息捕获依赖 `chrome.debugger` 权限，启用后 Chrome 可能显示浏览器级调试提示
- 当前 WebSocket 实现主要格式化文本帧和 JSON 帧；二进制帧仅展示大小和基础元数据
- 每个 WebSocket 连接最多保留最近 `500` 条消息，以控制面板内存和渲染成本
- 二进制 HTTP 响应会以 `base64` 提示展示，不会进一步解析为图片或压缩包预览
- 部分跨进程、缓存或浏览器内部请求可能无法读取 `response body`，这是 Chrome DevTools API 的能力限制

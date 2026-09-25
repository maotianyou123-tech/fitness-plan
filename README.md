# 焚决 · 长期力量轮转

手机、平板和电脑共用的力量训练计划与记录工具。无需账号，支持卧推、深蹲、硬拉轮转，包含热身、辅助、恢复段、重量计算和训练记录。

**网站入口：[直接打开训练网站](https://maotianyou123-tech.github.io/fitness-plan/)**

本项目唯一维护目录为 `/home/k405/Desktop/fitness-plan`。所有源码、资源和构建工具均在本目录内，不依赖原来的桌面目录。

## 文件架构

```text
fitness-plan/
├── index.html                  # 发布网页，也可直接双击离线打开
├── 健身计划.zip                 # 离线分享包，内含同一份index.html
├── README.md                   # 项目入口与维护指引
├── .github/workflows/deploy.yml # 检查并自动发布GitHub Pages
├── .gitignore                  # 忽略缓存、依赖和个人导出记录
├── .gitattributes              # 统一文本换行和二进制文件处理
└── 项目资料/
    ├── src/                    # 网页、样式与训练逻辑源码
    │   ├── index.html
    │   ├── styles.css
    │   ├── training.js         # 纯训练计算与进阶规则
    │   ├── app.js              # 记录、存储、导出及页面交互
    │   ├── mobile.js           # 手机导航、分区与网址分享
    │   └── assets/             # 图片资源和素材说明
    ├── docs/                   # 使用、训练设计、发布、维护说明
    ├── scripts/build.py        # 生成单文件HTML和ZIP
    ├── tests/                  # 训练计算、桌面和手机回归测试
    └── 示例/                   # 空白训练表、PDF与界面预览
```

## 本地使用

直接用浏览器打开根目录的 `index.html`。文件包含样式、图片、脚本及说明下载，不依赖CDN或应用服务器。手机可以通过线上网址访问，底部导航可切换计划、训练和记录。

`健身计划.zip` 用于离线发送，对方解压后打开HTML即可。

## 修改与发布

修改 `项目资料/src/` 和 `项目资料/docs/` 下的源文件，再执行：

```bash
node --test 项目资料/tests/training.test.cjs
python3 项目资料/scripts/build.py
python3 项目资料/scripts/build.py --check
```

构建只依赖Python标准库，训练测试只依赖Node内置测试模块。浏览器回归测试的可选依赖与运行方式见 [维护说明](项目资料/docs/维护说明.md)。

将源码及重新生成的 `index.html`、`健身计划.zip` 一起提交并推送到 `main`。GitHub Actions会先检查，再把HTML发布到GitHub Pages。部署进度见仓库的 [Actions](https://github.com/maotianyou123-tech/fitness-plan/actions) 页面。

## 说明与数据

- [使用说明](项目资料/docs/使用说明.md)
- [完整训练安排与研究依据](项目资料/docs/重建计划与研究依据.md)
- [GitHub发布说明](项目资料/docs/GitHub发布说明.md)
- [给后续AI或开发者的维护说明](项目资料/docs/维护说明.md)

训练记录保存在每位使用者自己的浏览器中，分享网址不会共享训练记录。不同设备、本地文件和线上网址之间不自动同步，可在“记录”页导出JSON备份。

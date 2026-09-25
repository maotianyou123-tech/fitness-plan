# 网站发布与更新

更新：2026-09-25。项目已迁入独立Git仓库，后续只维护 `/home/k405/Desktop/fitness-plan`。

## 网站和仓库

- 网站入口：https://maotianyou123-tech.github.io/fitness-plan/
- Git仓库：https://github.com/maotianyou123-tech/fitness-plan
- 部署记录：https://github.com/maotianyou123-tech/fitness-plan/actions

手机、平板和电脑访问同一个地址。网页右上角“分享”可复制当前网址，支持的浏览器也能调用系统分享。每人的训练记录只保存在各自的浏览器里。

## 自动发布架构

仓库的 `.github/workflows/deploy.yml` 使用GitHub Actions：

1. main收到推送后，检查JavaScript语法并运行训练计算测试。
2. 校验根目录HTML和ZIP是否与源码、说明文档完全一致。
3. 将HTML放入独立部署目录，只把网页发布到GitHub Pages。
4. Actions的部署任务完成后，网站更新为该次提交的版本。

GitHub仓库Settings → Pages的Source使用 **GitHub Actions**。不再使用从分支根目录直接发布的旧配置。GitHub官方流程见[自定义Pages工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

部署目录仅含 `index.html`；素材、样式、脚本、可下载说明已经内嵌。源码和测试留在Git仓库，网站运行不依赖旧桌面目录、Node服务、数据库或第三方CDN。

## 以后怎样更新

在唯一维护目录中修改源文件，然后执行：

```bash
cd /home/k405/Desktop/fitness-plan
node --test 项目资料/tests/training.test.cjs
python3 项目资料/scripts/build.py
python3 项目资料/scripts/build.py --check
git add .
git commit -m "用中文说明本次修改"
git push origin main
```

在Actions页面等待“检查并发布训练网站”成功，再刷新网站。不要只修改生成后的HTML，也不要漏掉重新生成的HTML和ZIP；持续集成会检查源码与发布文件是否一致。

## 排查发布问题

- 仓库中的代码可以浏览，但网址404：查看Pages是否使用GitHub Actions，以及最近部署是否成功。
- 工作流提示构建产物不一致：本地运行构建脚本，提交生成文件后再次推送。
- 页面仍显示旧内容：先核对Actions成功部署的提交，再刷新浏览器。
- 浏览器没有原先本地HTML的记录：本地文件与线上网址属于不同存储环境，不会自动迁移；切换前应导出JSON备份。当前未提供账号同步或导入界面。

原目录由用户自行删除；删除后无需修改新仓库的任何路径。复制给别人的离线版本仍可使用根目录的 `健身计划.zip`。

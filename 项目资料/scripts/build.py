#!/usr/bin/env python3
"""从源码构建可离线打开的单文件网页，并打包只含该网页的分享压缩包。"""
from pathlib import Path
import argparse
import base64
import mimetypes
import re
import zipfile

DETAILS = Path(__file__).resolve().parents[1]
SOURCE = DETAILS / 'src'
ROOT = DETAILS.parent
HTML = ROOT / 'index.html'
ZIP = ROOT / '健身计划.zip'


# 仅允许读取项目资料目录内的真实文件，避免错误引用其他目录。
def local_file(base, name):
    path = (base / name).resolve()
    if not path.is_relative_to(DETAILS) or not path.is_file():
        raise ValueError(f'找不到项目内资源：{name}')
    return path


# 将图片和说明文件编码到HTML中，部署时不依赖额外资源路径。
def data_url(path):
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


# 串联页面结构、样式和脚本；源码仍分文件维护。
def render():
    html = (SOURCE / 'index.html').read_text(encoding='utf-8')
    css = (SOURCE / 'styles.css').read_text(encoding='utf-8')

    def inline_asset(match):
        name = match.group(2).strip()
        if name.startswith(('data:', '#')):
            return match.group(0)
        return f'url("{data_url(local_file(SOURCE, name))}")'

    css = re.sub(r'url\(([\'"]?)([^)]+?)\1\)', inline_asset, css)
    if '</style' in css.lower():
        raise ValueError('CSS中不能包含style结束标签')
    html = re.sub(r'<link\s+rel="stylesheet"\s+href="styles.css"\s*/?>', lambda _: '<style>\n' + css + '\n</style>', html)

    def inline_script(match):
        path = local_file(SOURCE, match.group(1))
        code = path.read_text(encoding='utf-8')
        code = re.sub(r'</script', r'<\\/script', code, flags=re.IGNORECASE)
        return '<script>\n' + code + '\n</script>'

    html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)
    html = re.sub(r'href="([^"]+\.md)"', lambda m: f'href="{data_url(local_file(SOURCE, m.group(1)))}"', html)
    html = html.replace('<head>', '<head>\n  <!-- 单文件发布版；维护请阅读 项目资料/docs/维护说明.md，修改源文件后运行 项目资料/scripts/build.py。 -->', 1)
    if re.search(r'<script[^>]+src=|<link[^>]+rel="stylesheet"', html):
        raise ValueError('发布HTML仍有外部脚本或样式依赖')
    return html.encode('utf-8')


# 默认生成发布文件；--check只校验已生成文件，不写入。
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='检查发布文件是否与源码完全一致，不写文件')
    args = parser.parse_args()
    content = render()
    if not args.check:
        HTML.write_bytes(content)
        with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED) as bundle:
            # 固定压缩包内的时间戳，同一源码在本地和持续集成中得到相同文件。
            entry = zipfile.ZipInfo('index.html', date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            bundle.writestr(entry, content)
    if HTML.read_bytes() != content:
        raise ValueError('index.html尚未按当前源码重新构建')
    with zipfile.ZipFile(ZIP) as bundle:
        if bundle.namelist() != ['index.html'] or bundle.read('index.html') != content or bundle.testzip() is not None:
            raise ValueError('ZIP必须且只能包含当前单文件index.html')
    print(f'OK: index.html ({len(content):,} bytes); 健身计划.zip仅包含index.html。')


if __name__ == '__main__':
    main()

# 卧推训练网页 Hero 素材

- 原始素材：`bench-hero.png`
- 发布素材：`bench-hero.webp`，2026-09-24用Pillow转为无损WebP，逐像素验证与PNG一致；由1,754,121字节降至1,239,594字节。CSS使用WebP，构建时内嵌到HTML。
- 尺寸：1672 × 941，约 16:9
- 工具：内置 `image_gen.imagegen`，generate 后进行两次局部 edit；未使用 CLI。
- 设计用途：黑色摄影首屏背景，左侧留白用于 HTML 标题。
- 图片已检查：空置卧推架、左右配重片、黑色皮革卧推凳；无人物、无可读文字、无明显标志；暖色自然侧光与深炭灰背景。

## 生成 Prompt

```text
Use case: photorealistic-natural
Asset type: premium bench press training website photographic hero background, landscape 16:9.
Primary request: An exceptionally art-directed premium editorial sports photograph of one empty bench press station in a quiet industrial gym.
Scene/backdrop: A restrained charcoal industrial gym interior with concrete walls and a dark floor, no clutter.
Subject: Tactile black iron weight plates and a straight steel Olympic barbell securely resting in the J-hooks of a real stable bench press rack above a black leather flat bench. Complete plausible bench and rack construction, correctly connected pieces. One simple bench station only.
Style/medium: Authentic high-end sports editorial photography, analog film feel, crisp realistic equipment texture, understated and sophisticated.
Composition/framing: Wide landscape photograph, oblique low camera angle. The bench and iron plates occupy the RIGHT TWO THIRDS of the image. The LEFT THIRD is dark calm empty negative space for a heading later added in HTML. Entire equipment has natural physically coherent perspective. Show the closest heavy plate as a compelling foreground detail on the right and let the leather bench recede.
Lighting/mood: Dramatic natural side lighting and a narrow subtle warm sunlight beam entering from the upper right, deep elegant charcoal shadows, quiet focused comeback-to-training atmosphere.
Color palette: Mostly monochrome charcoal, warm gray and black with restrained golden warm highlights.
Materials/textures: Real worn steel grain, knurled bar, iron texture, fine black leather texture; sophisticated realistic highlights and soft film grain.
Constraints: No people, no text, no numbers, no logos, no brands, no watermark. No website or UI mockup. No floating objects, no precariously balanced barbell, no impossible geometry, no excessive gym equipment. Photography only.
```

## 最终修正 Prompt

```text
Edit the supplied bench press photograph. Replace the entire visible FLOOR surface with clean unmarked deep charcoal rubber flooring. Especially the lower right 250 by 120 pixel corner must be uniform natural dark rubber with absolutely NO pale lines, NO chalk, NO scratches, NO doodles, NO signature, NO written or drawn marks. Remove the small white squiggle right beside the extreme bottom right edge entirely. This corner should just be plain black floor. Preserve all the gym equipment, bench, barbell, concrete back wall, warm sunlight, dark empty left side, and 16:9 framing. Photorealistic seamless edit.
```


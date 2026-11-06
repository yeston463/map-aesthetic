# Interface copy

A map page has words outside the map: the title, the legend, the layer panel, the
site list, the status bar, the buttons, the popup, the empty state. They are part
of the design, and they are the part most often left as filler.

The rule: **every sentence is one a reader would say out loud to a colleague.**
No marketing, no invented feature names, no phrase that only makes sense after
you have read the rest of the page.

## Five rules

1. **The title names the place and the task.** "江岸片区配送地图" says where and
   what. "地图" alone says nothing. If the page serves a district, a route or a
   fleet, the title says which.
2. **The first thing on screen holds one hard fact.** A number, a date, a place,
   a count. Not a greeting.
3. **Every heading names a thing.** The product, a part of it, the section's
   noun, or a digit. "站点" names things; "功能一览" does not.
4. **Buttons are a verb plus what the reader gets.** 1 to 5 words. "查看全部
   站点", "切换到深色", "导出为图片". Never "了解更多", "点击这里", "更多".
5. **Few actions, one wording each.** The main action names the transaction and
   reads the same in the toolbar, the panel and the popup.

## Words for the parts of a map page

| Part | Says | Example |
| --- | --- | --- |
| Page title | the place and the task | 江岸片区配送地图 |
| Layer panel heading | what the layer group is | 底图 / 业务图层 / 注记 |
| A layer switch | the layer's content, not its type | 片区色带 (not 图层 3) |
| A measure switch | the metric and its nature | 业务量（顺序色带） |
| Legend entry | the class and its range | ≥ 1200 |
| A list row | the name and its state | 南苑驿站 · 异常 |
| A popup title | the feature's name | 南苑驿站 |
| A popup field | the value's name | 业务量 1130 件 |
| Status bar | the current reading | 缩放 15 · 可见标注 14 · 选中 S01 |
| Empty state | what is empty and what would fill it | 当前视野内没有异常站点 |
| Error | what failed and what to do | 瓦片加载失败，请检查网络后重试 |

## Numbers and units

- A number sits in a sentence with its unit: "1840 件", "缩放 15", "3 个片区".
- A number that stands alone in a table or a legend row carries its unit in the
  header, not repeated on every row.
- Never write "250 / W". The unit belongs to the value.
- The same number keeps the same wording everywhere it appears. If the legend
  says "≥ 1200", the popup says "1200 件以上", not "1200+" in one place and
  "> 1200" in another.
- Percentages read as numbers people use: 38%, not 0.38.

## Plain versions

When a line is vague, name the thing first, then give one number.

| Vague | Plain |
| --- | --- |
| "实时配送态势" | 江岸片区 12 个站点的当前状态 |
| "数据可视化展示" | 按片区查看业务量分布 |
| "更多功能" | 切换色带口径与图层 |

## Legend correspondence

The legend is a table of the map, and it must correspond to the map exactly.

- Every colour in the legend appears on the map, and every data colour on the
  map appears in the legend. A colour that exists in one place only is a defect.
- The legend states the class breaks in the same order as the ramp runs. The
  light end is the low end, always, and the wording says which.
- A class that has no member says so, or is not drawn. A legend with an empty
  swatch is a promise the map does not keep.
- The missing value is in the legend, with the texture or hatch that shows it on
  the map, and the count of how many features are missing.
- The legend is generated from the same objects the map paints from. A hand-
  written legend drifts from the map the first time a colour changes.

## What may be assumed

Nothing, except what the data already contains. In particular:

- **No invented counts.** If the data has 12 sites, the legend says 12, not
  "上百个站点".
- **No invented claims.** No "覆盖全城", "实时更新", "毫秒级响应" unless the
  project can show it.
- **No invented place names.** If a district has no name in the data, the map
  does not grow one.
- An assumed value is listed in the report, as the assumed price is on a site.

## Banned

- Marketing words in a working interface: 赋能, 打造, 一站式, 智能化, 领先,
  高效, 极致, 无缝.
- English filler where a Chinese term exists: "Dashboard", "Widget", "Overview"
  beside 概览.
- Exclamation marks.
- All-caps labels for ordinary UI. Chinese has no all-caps tradition; use
  letter-spacing if a label needs to be set apart.
- A label that says what the element is instead of what it does: "地图区域"
  above a map, "按钮" on a button.
- A tooltip that repeats the label under the pointer. A tooltip carries the
  value, not the name of the control.

## The rule that catches most of it

Read every string in the interface aloud, in order, without looking at the map.
If a sentence could sit on any other project's page, it is filler: replace it
with the thing this page actually shows.

# 一笔护崽 · Budline

[![CI](https://github.com/renyijiu/budline/actions/workflows/ci.yml/badge.svg)](https://github.com/renyijiu/budline/actions/workflows/ci.yml)

画一条线，挡住蜂群，保护你的萌宠！

一款竖屏网页物理小游戏：观察关卡 → 按住拖动画一笔 → 松手后墨线变成有重量的实体 → 蜂群、胡蜂、鳄鱼、青蛙、炸弹和落石一起扑上来 → 撑过倒计时就过关。

## 玩法一览

- **5 章 30 关**：阳光草地、荷叶池塘、熔岩火山、冰雪山巅、萤火之夜，每章引入新的威胁和地形。
- **敌人**：蜜蜂（成群找缝）、胡蜂（瞄准后猛冲，能撞歪墨线）、鳄鱼（会叼起挡路的线甩开，水里的还会跃起扑咬）、青蛙（直线吐舌头）、炸弹（炸飞周围的线和蜜蜂）、落石、冰锥。
- **地形机关**：水面（能浮）、岩浆、尖刺、阵风、冰面、木筏、跷跷板、移动平台，以及能把线钉住的**红色图钉**、画不了线的**乌云**、挡蜜蜂却挡不住青蛙舌头的**竹篱笆**、会塌的**石桥**。
- **墨线会坏**：炸弹会炸断附近的墨线，大石头和冰锥正面撞上也会把线撞断（擦着滑过去的斜坡不会断）；钢铁笔画的线不怕这些。
- **每关一个巧思**：除了前几关教学，任何一关都不能靠“对着萌宠画个半圆罩子”过关——要落盖、钉门、套圈、配重、借力、挡板送走炸弹……
- **评分**：过关 ★，毫发无伤 ★，墨水不超过省墨线 ★。新星换蜂蜜。
- **道具**（用蜂蜜购买）：泡泡盾、加墨水、钢铁笔（线固定不掉）、驱蜂喷雾、沙漏。
- **萌宠收集**：团团、啾啾、噗噗、糯米、墩墩、咪咪，通关章节免费解锁，也可以用蜂蜜买。
- **无尽蜂潮**：一波比一波凶，每波补墨水，旧线会慢慢消失，看你能撑几波。
- 失败后会显示原因和针对性建议；连续失败 3 次提示免费，提示会显示参考画法。

操作：鼠标或手指拖动画线；`R` 重来，`Esc` 暂停，多笔关卡按空格提前开始。

## 开发

```sh
pnpm install
pnpm dev          # http://127.0.0.1:5173
pnpm test         # 单元测试 + 30 关自动验证
pnpm lint && pnpm typecheck
pnpm build
pnpm verify       # 上面全部，CI 跑的就是这个
```

需要 Node 24 或更高版本，以及 pnpm（版本见 `package.json` 的 `packageManager`）。

`pnpm build` 的产物在 `dist/`，是纯静态站点，可以放到任何静态托管上。如果站点不在域名根路径（比如 GitHub Pages 的 `/budline/`），用 `pnpm build --base=/budline/` 构建。

调试参数：`?level=3-4` 直接进入关卡；`?level=3-4&auto` 自动画出参考解法；`?level=3-4&auto=naive` 画一个“新手标准罩子”，用来判断关卡是否有足够挑战；`?endless` 直接进入无尽模式。

## 结构

```
src/game/core      常量、数学、确定性随机数
src/game/levels    关卡数据（world1-5.ts）、世界主题、几何辅助函数
src/game/sim       无 DOM 的确定性模拟：Sim（Rapier 物理）、蜂群 AI、敌人、笔画校验、无尽模式
src/game/render    Canvas 2D 渲染：程序化绘制的角色、场景、特效
src/app            界面与流程：标题、选关、商店、关卡 HUD、结算、存档、WebAudio 合成音效
tests              单元测试与关卡验证
```

模拟层不依赖浏览器，每一关的参考解法都会在测试中按玩家画线的同一套规则重放，确保：

- 参考解法能三星通关，不画线必输，整体偏移 5px（手抖）三次至少成功两次；
- 除标了 `naiveOk` 的教学关外，“标准罩子”（对每只萌宠画半径 80/100/125 的半圆，多萌宠关再加一个罩住全部的大半圆）全部失败；
- 关卡里声明的 `pitfalls`（看似可行的错误画法）必须失败。

设计关卡时可以用 `LAB=3- pnpm vitest run tests/lab.test.ts --silent=false --reporter=verbose` 查看每关在参考解法、不画线和各种标准罩子下的结果。

所有美术都是代码绘制，所有音效和背景音乐都是 WebAudio 实时合成，项目里没有图片或音频素材。存档只保存在浏览器 localStorage 里。

设计说明见 [docs/design.md](docs/design.md)。

## English

**Budline** is a portrait-mode browser physics game. Draw a single stroke; when you let go it becomes a solid, weighted body, and it has to keep your pet safe from bee swarms, hornets, crocodiles, frogs, bombs and falling rocks until the timer runs out. It has 30 levels across 5 worlds, an endless mode, boosters and collectible pets. All art is drawn in code and all sound is synthesized with WebAudio, so the repo contains no image or audio files. The in-game text is Chinese only for now.

Physics runs on deterministic Rapier with a fixed timestep, so every level's reference solution is replayed in the test suite (`pnpm test`) to check that it still wins, that drawing nothing loses, and that a beginner's plain dome fails.

## License

[MIT](LICENSE)

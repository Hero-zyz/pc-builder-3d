# 3D 装机模拟器

选件即装配的 3D 装机模拟器：从 26,268 个真实型号里挑 CPU / 主板 / 显卡 / 内存 / 硬盘 / 电源 / 机箱 / 散热器，右侧实时给出兼容性判断与功耗估算，中间用真实尺寸驱动的 3D 场景展示装配结果。

## 快速开始

```bash
npm install
npm run dev -- --port 5180   # http://localhost:5180
npm run build                # tsc -b && vite build
```

打开 `http://localhost:5180/?demo=1` 会自动生成一套兼容配置，方便直接看效果；界面右上角「示例配置」按钮做同样的事。

## 数据层

- 数据源：[BuildCores OpenDB](https://github.com/buildcores/buildcores-open-db)，**CC BY-NC-SA 4.0（禁止商用，衍生需同协议）**。
- `scripts/sync-parts.mjs` 把原始 48,713 条 JSON 压成 8 个品类、26,268 条精简记录，写入 `public/data/*.json`（总计约 8 MB）：

| 品类 | 条数 | 品类 | 条数 |
|---|---|---|---|
| CPU | 790 | 电源 | 3,303 |
| 主板 | 3,697 | 机箱 | 3,808 |
| 显卡 | 3,865 | 散热器 | 2,424 |
| 内存 | 4,876 | 硬盘 | 3,505 |

重新同步（默认读 `../_data/buildcores-open-db-main/open-db`）：

```bash
node scripts/sync-parts.mjs [open-db 目录]
```

**换数据源**：`src/parts.ts` 是唯一的取数入口，任何满足 `PartMap` 形状的 JSON 分片都能替换 OpenDB；商用场景请换成自有数据。

## 兼容性规则（`src/compat.ts`）

| 检查 | 依据字段 |
|---|---|
| CPU 插槽 ↔ 主板 | `CPU.socket` / `Motherboard.socket` |
| 主板板型 ↔ 机箱 | `form_factor` / `supported_motherboard_form_factors` |
| 内存类型、条数、容量上限 | `RAM.type` / `Motherboard.memoryType`、`memorySlots`、`maxMemory` |
| 显卡长度 ↔ 机箱限长 | `GPU.length` / `PCCase.maxGpuLength` |
| 散热器限高、扣具 | `CPUCooler.height`、`sockets` / `PCCase.maxCoolerHeight` |
| 电源规格、功率、供电接口 | `PSU.formFactor`、`wattage`、`connectors` / 峰值功耗 × 1.3 |
| M.2 数量 | `Storage.formFactor` / `Motherboard.m2Slots` |

功耗估算：`CPU TDP + GPU TDP + 70 W` 作为峰值，建议电源 = 峰值 × 1.3（向上取 50 W）。

## 3D 场景（`src/Scene.tsx`）

- 全部用 three.js 基础几何体按**真实毫米尺寸**生成：机箱框体 + 主板 + CPU + 散热器 + 内存条 + 显卡 + 电源 + M.2。
- 场景整体 `group scale` 归一化到约 3 个单位，默认相机即可框住整机；换机箱时通过 `key` 重建相机。
- 缺失的部件显示为半透明线框空位；检查失败的部件变红。

## 已知限制

- 部件坐标仍是固定系数，散热器/电源位置没有严格按机箱内腔推算（下一步改为内腔驱动的布局）。
- 没有价格与购买链接（OpenDB 不含报价）。
- 3D 是参数化方块，不是真实模型；真实模型需要额外资产与授权。

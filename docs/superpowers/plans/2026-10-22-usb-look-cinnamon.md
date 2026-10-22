# USB-Look-Cinnamon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Cinnamon 6.6.7 で USB 機器全般をイベント駆動で監視し、種類別フィルタ、識別情報、根拠付き利用状態を安全に表示する軽量アプレットを配布可能にする。

**Architecture:** Cinnamon の CJS applet を入口とし、純粋な分類/集約モデル、GUdev アダプタ、用途別利用状態検査、Cinnamon 固有 UI を分離する。USB 物理機器を sysfs パスで一意に識別し、詳細検査はポップアップ表示中のみ行う。常駐デーモン、権限昇格、USB への書き込みなし。

**Tech Stack:** JavaScript (Cinnamon CJS/GJS), GUdev-1.0, GLib/Gio, Cinnamon AppletSettings/PopupMenu, Node.js 標準テストランナー（純粋ロジック用）、GitHub Actions。

**Spec:** [2026-10-22-usb-look-cinnamon-design.md](../specs/2026-10-22-usb-look-cinnamon-design.md)

## Global Constraints

- Private リポジトリを維持する。外部公開、リセット、解放、強制アンマウント、権限昇格、通信データの取得を実装しない。
- 監視の設定は 9 種類別のみで、全部初期 ON。プロジェクトとポートの紐付けは設けない。
- 日本語 README を主入口とし、英語 README、MIT、CONTRIBUTING/CHANGELOG を継続管理する。
- GNU/Linux 上の観測結果は断定せず、権限不足なら Unknown。ドライババインドを Busy 扱いしない。
- ルートハブを数えず、複合デバイスを物理機器 1 件として扱う。
- 実機検証は Linux Mint Cinnamon 6.6.7 で別途必須。Node.js の単体テストは Cinnamon/GUdev 統合試験の代わりにならない。
- 配布ディレクトリは \`usb-look-cinnamon@tail-backshape/files/usb-look-cinnamon@tail-backshape/\`。その内部が \`~/.local/share/cinnamon/applets/usb-look-cinnamon@tail-backshape/\` にコピーされる。

## Review Focus

- GUdev / GJS API の実際の呼び出し方式と Cinnamon 6.6.7 のローカル JS モジュール読み込み。
- 物理デバイス親子の判定（特に USB hub/USB composite/ttyACM/ttyUSB）と root hub 除外。
- 重複排除、フィルタ切り替え、途中切断と非同期結果の競合。
- 使用中判定で他ユーザーの不可視性を Not in use と誤認させないこと。
- タイマー、signal 接続、Gio.Cancellable、PopupMenu の破棄時の解放。
- GUI フリーズ、未サニタイズ文字列、外部コマンドの不安全な実行がないこと。

---

### Task 1: 分類・集約の純粋ロジックとテスト

**Files:**
- Create: \`usb-look-cinnamon@tail-backshape/files/usb-look-cinnamon@tail-backshape/deviceModel.js\`
- Create: \`tests/device-model.test.cjs\`
- Create: \`tests/support/load-gjs-module.cjs\`
- Create: \`package.json\`

**Interfaces:** \`classifyInterface(record): string[]\`、\`buildDevices(records): Device[]\`、\`filterDevices(devices, toggles, query): Device[]\`。record は {sysfsPath,parentUsbPath,devtype,subsystem,deviceNode,properties,attributes,driver}、Device は {id,vid,pid,name,manufacturer,usbPath,categories,interfaces,nodes}。分類キーは serial/debug/storage/hid/camera/audio/network/hub/other。

- [ ] RED: Node の \`node --test tests/device-model.test.cjs\` で USB composite、9 分類、重複除去、root hub 除外、欠損属性、カテゴリ OR、検索とノード保持を検証し、意図した未実装失敗を確認する。
- [ ] GREEN: CJS に依存しない \`deviceModel.js\` を最小実装してテストを再実行し、全件合格を確認する。
- [ ] REFACTOR: 不変フィールドとカテゴリーキーを揃え、同じテストを再実行する。
- [ ] Commit: \`feat(core): classify and aggregate USB devices\`。

### Task 2: GUdev Snapshot とイベント更新

**Files:**
- Create: \`usb-look-cinnamon@tail-backshape/files/usb-look-cinnamon@tail-backshape/deviceRegistry.js\`
- Create: \`tests/device-registry.test.cjs\`

**Interfaces:** \`DeviceRegistry.start(onChange)\`、\`snapshot()\`、\`stop()\`。GUdev device → record の変換関数 \`toRecord(device, parentPath)\`。USB の add/remove/change と関連子サブシステムのイベントを短時間で合流し、全件再列挙してモデルに渡す（イベントの取りこぼしと差分破損を抑止）。

- [ ] RED: fake client によるイベント重複、途中切断、連続挿抜、停止後の通知抑止、欠損プロパティのテストを実行し未実装失敗を確認する。
- [ ] GREEN: GUdev adapter と \`DeviceRegistry\` を実装し、再列挙予約を debounce して例外をコールバックへ伝える。
- [ ] VERIFY: \`node --test tests/*.test.cjs\` の全件合格。Cinnamon 実機では USB 子孫関連の取りこぼしを確認する。
- [ ] Commit: \`feat(core): monitor GUdev snapshots and hotplug events\`。

### Task 3: Cinnamon 起動、パネル、カテゴリ設定

**Files:**
- Create: \`usb-look-cinnamon@tail-backshape/files/usb-look-cinnamon@tail-backshape/applet.js\`
- Create: \`usb-look-cinnamon@tail-backshape/files/usb-look-cinnamon@tail-backshape/metadata.json\`
- Create: \`usb-look-cinnamon@tail-backshape/files/usb-look-cinnamon@tail-backshape/settings-schema.json\`
- Create: \`usb-look-cinnamon@tail-backshape/info.json\`
- Create: \`tests/package-layout.test.cjs\`

**Interfaces:** \`main(metadata, orientation, panelHeight, instanceId)\` は Applet インスタンスを返す。AppletSettings で 9 個の \`show-*\` と \`show-count\`、\`notify-changes\` を設定/監視。パネルはアイコンとフィルタ済み物理デバイス数、エラーを表示。

- [ ] RED: JSON のロード、UUID 一致、設定初期値、依存が Cinnamon 以外の常駐デーモンを要求しないことのテストを作り失敗を確認する。
- [ ] GREEN: native Applet / settings / パネル表示を実装する。
- [ ] VERIFY: \`node --test tests/*.test.cjs\`、\`node --check\`、Linux Mint Cinnamon 上でロード・設定保存。
- [ ] Commit: \`feat(applet): add Cinnamon panel and category settings\`。

### Task 4: 利用状態を示す非同期・非破壊プローブ

**Files:**
- Create: \`usb-look-cinnamon@tail-backshape/files/usb-look-cinnamon@tail-backshape/usageInspector.js\`
- Create: \`tests/usage-inspector.test.cjs\`

**Interfaces:** \`inspectNodes(nodes, runner, generation): Promise<UsageResult>\`（テスト用の純粋な結果パーサと GUI 側 Gio 実行器を分離）。Busy は実在する PID/command と根拠があるときのみ、Mounted はストレージ用、Unknown は権限/取得不能。状態には \`checkedAt\` を持つ。

- [ ] RED: PID のあり/なし、権限不足、コマンド不在、プロセス退出、競合切断、文字列注入への耐性を fixture で確認し失敗させる。
- [ ] GREEN: Gio.Subprocess を引数配列で起動する read-only 検査、検査キャンセル、3 秒以上のスロットリング、プローブ理由を実装する。
- [ ] VERIFY: 全 unit テスト、Cinnamon 実機で \`lsof\`/FD 列挙結果と照合。
- [ ] Commit: \`feat(usage): inspect visible device usage safely\`。

### Task 5: 検索・詳細・コピー・通知とライフサイクル

**Files:**
- Modify: \`.../applet.js\`
- Create/Modify: \`.../popupView.js\`
- Create: \`tests/lifecycle.test.cjs\`

**Interfaces:** ポップアップ表示中にのみ fresh プローブを開始し、閉じた瞬間タイマー停止・失効トークン更新。詳細、カテゴリ別折りたたみ、検索、パス/VID:PID コピー、通知初期 OFF。

- [ ] RED: 検査途中で remove/close/setting-toggle した際の古い結果廃棄、重複通知防止、タイマー停止をテストし失敗を確認する。
- [ ] GREEN: PopupMenu + Cinnamon native widgets、通知、Clipboard、generation guard を実装する。
- [ ] VERIFY: unit 全件と Cinnamon 実機でクリック/右クリック/ライト・ダーク/複数配置/繰返し挿抜。
- [ ] Commit: \`feat(ui): show searchable device details and guarded usage\`。

### Task 6: CI、インストール、OSS公開前ドキュメント

**Files:**
- Create: \`.github/workflows/test.yml\`
- Create: \`scripts/install-local.sh\`
- Modify: \`README.md\`、\`README.en.md\`、\`CHANGELOG.md\`、\`CONTRIBUTING.md\`

- [ ] RED: lint、\`node --test\`、設定 JSON 検証、構成ファイルの存在を CI 用スクリプトでチェックし失敗を確認する。
- [ ] GREEN: 最小依存の CI と非破壊・ユーザー領域のみのインストーラを実装する。README に依存パッケージ、導入/削除、制約、操作/トラブルシュートを書く。
- [ ] VERIFY: Actions と README 手順をレビューし、\`node --test\` / \`node --check\` の実行結果を記録。
- [ ] Commit: \`chore: prepare CI and bilingual installation docs\`。

### Task 7: Cinnamon 6.6.7 実機受け入れ（別環境作業）

**Files:**
- Create: \`docs/test-matrix.md\`
- Update: \`CHANGELOG.md\`

- [ ] Linux Mint Cinnamon 6.6.7 のデスクトップセッションでロードと削除（セッションを落とさない）。
- [ ] USB-UART/CDC ACM/ストレージ/HID/USB hub/debug/camera を可能な範囲で確認し、未実施項目を明記。
- [ ] 同型複数機器、再接続、占有 PID、他ユーザーの権限不足、連続イベント、複数パネル、テーマ切り替え。
- [ ] クローズ中に \`/proc\` 占有ポーリングが走らないこと、Cinnamon のメモリ/CPU 増分を観測。
- [ ] 未合格は issue に切り出し、合格するまで安定版リリースと書かない。

## Checkpoints

- **M1:** Task 1–2 完了でモデル/レジストリが自動テスト可能。
- **M2:** Task 3 完了で Cinnamon パネルへ追加可能な最小版。
- **M3:** Task 4–5 完了で用途別検査と UI。
- **M4:** Task 6–7 完了で配布/受け入れ。

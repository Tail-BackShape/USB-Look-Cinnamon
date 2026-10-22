# USB-Look-Cinnamon

[English README](README.en.md) · [設計仕様](docs/superpowers/specs/2026-10-22-usb-look-cinnamon-design.md) · [実装計画](docs/superpowers/plans/2026-10-22-usb-look-cinnamon.md)

> **開発版 v0.1.0（実機未検証）** — ソースコードとテストはあるが、Linux Mint / Cinnamon 6.6.7での実機受け入れ試験はまだ完了していない。安定版リリースではない。

USB-Look-Cinnamonは、CinnamonパネルからUSB接続機器の識別情報と確認可能な利用状態を閲覧する、軽量・読み取り専用のAppletだ。

## 現在の実装

- USBシリアル、デバッグ機器、ストレージ、HID、カメラ、オーディオ、USBネットワーク、ハブ、その他を**種類別に**ON/OFF
- GUdevの接続イベントをきっかけに列挙を更新。物理USB機器を1件として表示し、複合機器のインターフェースを集約
- システムフォント／Cinnamonテーマのパネルアイコンと件数表示
- 検索、カテゴリの折りたたみ、sysfsパス・VID/PID・デバイスノード・ドライバの詳細、クリップボードコピー
- シリアル・カメラ等で確認可能なプロセス/PIDを表示（任意の `lsof`）。ストレージは `findmnt` によるマウント状態を表示
- 占有検査はポップアップを開いている間だけ。閉じる・切断・種類別設定変更時には古い検査結果を破棄
- 接続・切断通知（初期OFF）。設定はCinnamonの仕組みで保存する

USB全般に共通する排他的な「空き／使用中」判定はない。他ユーザーのプロセスが見えない場合など、`Not in use` は「確実に利用可能」の保証ではない。情報を取得できなければ `Unknown` と表示する。

## 対応環境・依存関係

- Linux Mint / Cinnamon 6.6.7を初期対象とする（**実機未検証**）
- CinnamonのJavaScript環境（追加の常駐デーモン不要）
- GUdev GObject Introspection typelib（Ubuntu/Mint系では通常 `gir1.2-gudev-1.0`）
- オプション: `lsof`（シリアル・カメラ等の可視プロセス検出）
- `findmnt`（通常は `util-linux` に含まれる。ストレージ判定で使用）
- Python仮想環境やDockerは不要

Mint/Ubuntuで必要に応じて:

```bash
sudo apt install gir1.2-gudev-1.0
sudo apt install lsof
```

## インストール（開発版）

リポジトリを取得後、プロジェクトルートで:

```bash
sh scripts/install-local.sh
```

`~/.local/share/cinnamon/applets/usb-look-cinnamon@tail-backshape/`（`XDG_DATA_HOME` があればその配下）へコピーする。既存フォルダがある場合、上書きせず停止する。更新時は旧フォルダのバックアップを取ってから手動で入れ替える。

Cinnamonの「システム設定 → アプレット」で **USB-Look-Cinnamon** をパネルへ追加する。左クリックでポップアップ、右クリックでCinnamon標準のメニューを開く。アプレットの設定から9種類の監視対象を切り替える。

アンインストールする場合は、パネルから外したうえで、上記の専用アプレットディレクトリのみを確認して削除すること。インストールスクリプトはシステム領域に書き込まない。

## 開発と検証

```bash
npm test
npm run check
sh -n scripts/install-local.sh
```

Node.js 18以降の標準テストランナーを利用し、デバイス・GUdev・Cinnamon APIを模したfixtureで検証する。Cinnamonの実際の描画、GUdevの動作、USBの挿抜、テーマ継承、プロセス権限差、常駐負荷の検証は[実機テスト項目](docs/test-matrix.md)に従って別途実施する。自動テストの合格だけでは実機互換性を保証しない。

## セキュリティ・設計方針

監視対象機器を開かず、USBリセット、解放、強制アンマウント、ファーム書き込み、監視対象を利用中のプロセス終了、権限昇格、外部送信を行わない。占有検査用にアプレット自身が起動した `lsof` / `findmnt` のみ、検査中断・タイムアウト時に終了する。開発プロジェクトとポートの紐付けはない。製品名等の機器由来文字列をコードとして評価しない。

## 貢献・ライセンス

[CONTRIBUTING.md](CONTRIBUTING.md)、[CHANGELOG.md](CHANGELOG.md)を参照。Copyright (c) 2026 Tail-BackShape. [MIT](LICENSE)。

リポジトリは現在Privateであり、将来のOSS公開は所有者が判断する。公開前に実機確認とライセンス監査を行う。

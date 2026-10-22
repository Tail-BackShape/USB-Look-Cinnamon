# USB-Look-Cinnamon

[English](README.en.md) · [変更履歴](CHANGELOG.md) · [貢献ガイド](CONTRIBUTING.md)

Cinnamonパネルから、接続中のUSB機器とその利用状態を確認できるアプレットです。機器を種類別に表示し、製品名やポートを検索できます。利用状態は、取得できたプロセス情報やマウント情報に基づいて表示します。

## 主な機能

- USBシリアル、デバッグ機器、ストレージ、HID、カメラ、オーディオ、USBネットワーク、ハブ、その他の9カテゴリを個別に表示・非表示
- USB接続イベントに応じた一覧更新と、パネルへの機器数表示
- 複合機器のインターフェースを物理機器ごとに集約
- 製品名・VID/PID・デバイスノードによる検索
- 製造元、sysfsパス、デバイスノード、ドライバの詳細表示と識別情報のコピー
- 対応する機器のプロセス名・PIDや、ストレージのマウント先の表示
- 接続・切断通知（初期設定では無効）

利用状態の検査はポップアップを開いている間だけ実行します。表示にはCinnamonのテーマとシステムフォントを使用します。

## 動作環境

- Linux Mint / Cinnamon
- GUdevのGObject Introspection typelib（Mint/Ubuntuでは `gir1.2-gudev-1.0`）
- `lsof`：プロセス情報の取得に使用（任意）
- `findmnt`：ストレージのマウント情報の取得に使用（通常は `util-linux` に含まれます）

**v0.1.0は開発版です。** Linux Mint 22.3 / Cinnamon 6.6.9で、機器一覧・検索・カテゴリ別表示・詳細メニューと利用状態検査の実行を確認しています。USB挿抜、実使用中PIDの検出、ストレージのマウント検出、負荷測定は未確認です。

## インストール

Mint/UbuntuでGUdevが未導入の場合は、次を実行します。プロセス情報も表示する場合は `lsof` を追加してください。

```bash
sudo apt install gir1.2-gudev-1.0
sudo apt install lsof
```

リポジトリを取得し、インストールスクリプトを実行します。

```bash
git clone https://github.com/Tail-BackShape/USB-Look-Cinnamon.git
cd USB-Look-Cinnamon
sh scripts/install-local.sh
```

Cinnamonの「システム設定 → アプレット」から **USB-Look-Cinnamon** をパネルへ追加してください。

インストール先は `~/.local/share/cinnamon/applets/usb-look-cinnamon@tail-backshape/` です。`XDG_DATA_HOME` を設定している場合は、その配下の `cinnamon/applets/usb-look-cinnamon@tail-backshape/` に配置します。追加の常駐デーモンは不要です。

### 更新・アンインストール

インストーラーは既存のフォルダを上書きしません。更新時はパネルからアプレットを外し、インストール先のフォルダを別の場所へバックアップしてから、新しいソースでインストールしてください。その後、パネルへ追加し直してください。

アンインストールする場合は、パネルから外したうえで、上記の専用アプレットフォルダのみを削除してください。

## 使い方

1. パネルのアイコンを左クリックして機器一覧を開きます。
2. 検索欄で製品名・VID/PID・ポートを指定して絞り込みます。
3. カテゴリと機器を展開すると、詳細と利用状態を確認できます。
4. 右クリックのメニューから設定を開き、表示カテゴリ・件数表示・通知を変更できます。

検索による絞り込みは一覧だけに適用されます。パネルの件数は、表示対象カテゴリに含まれる物理機器の数です。root hubは数えません。

### 利用状態の見方

| 表示 | 意味 |
| --- | --- |
| `Busy` | このユーザーから確認できるプロセスがデバイスを開いています。 |
| `Not in use` | このユーザーから確認できるプロセスは見つかりませんでした。 |
| `Mounted` | 検査したデバイスノードにマウント先が見つかりました。 |
| `Unmounted` | 検査したデバイスノードにマウント先が見つかりませんでした。 |
| `Unknown` | 未対応の機器種別、情報不足、権限不足、コマンドの警告などにより判定できません。 |

`Not in use` は、機器が確実に利用可能であることを保証しません。他ユーザーのプロセスなど、取得できない情報があります。`lsof` がファイルシステムの警告を出す環境でも、結果が不完全な場合は `Unknown` と表示します。

## 読み取り専用の動作

アプレットは監視対象のデバイスを開かず、USBリセット、強制アンマウント、ファームウェア書き込み、利用中プロセスの終了、権限昇格、外部送信を行いません。検査中断・タイムアウト時に終了するのは、自身が起動した一時的な `lsof` / `findmnt` だけです。

## 開発・不具合報告

Node.js 18以降で検証できます。

```bash
npm test
npm run check
sh -n scripts/install-local.sh
```

自動テストではGUdevとCinnamon APIを模した環境を使用します。実機での確認項目は[テスト項目](docs/test-matrix.md)、開発方針は[設計仕様](docs/superpowers/specs/2026-10-22-usb-look-cinnamon-design.md)を参照してください。

不具合は[Issues](https://github.com/Tail-BackShape/USB-Look-Cinnamon/issues)へ、OS・Cinnamonのバージョン、再現手順、期待する結果と実際の結果を添えて報告してください。ログ中の個人情報や機器のシリアル番号は共有前に削除してください。

## ライセンス

[MIT](LICENSE) · Copyright (c) 2026 Tail-BackShape.

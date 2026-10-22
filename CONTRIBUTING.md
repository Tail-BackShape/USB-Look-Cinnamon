# Contributing / 貢献ガイド

USB-Look-Cinnamonへの改善提案やバグ報告を歓迎する。現在は設計段階であり、動作するApplet本体はまだない。

## 日本語

1. 既存のIssuesと[設計仕様書](docs/superpowers/specs/2026-10-22-usb-look-cinnamon-design.md)を確認する。
2. 不具合報告ではCinnamonのバージョン、ディストリビューション、再現手順、期待する結果と実際の結果を記載する。
3. USB機器のシリアル番号、ホスト名、ユーザー名、ログ中の個人情報は共有前に削除または匿名化する。
4. 機能追加を提案する場合は、まずIssueで目的・操作体験・省リソース性への影響を相談する。
5. 将来Pull Requestを作る場合は、関連するテストとドキュメントを更新し、MITで再配布可能な自作コードまたは適切に権利処理されたコードのみを含める。
6. USB機器をリセット、強制切断、終了させるコードや、特権を前提にしたコードは初期スコープ外とする。

## English

Contributions and bug reports are welcome. The project is in the design phase and is not yet installable.

- Read the [design specification](docs/superpowers/specs/2026-10-22-usb-look-cinnamon-design.md) and existing issues before proposing changes.
- Include distro/Cinnamon versions, reproduction steps, expected results, and actual results in bug reports.
- Redact device serial numbers, hostnames, usernames, and personal data from logs before posting.
- Discuss new features in an issue first, especially changes that affect resource usage or system safety.
- Include tests and documentation with future pull requests; submit only original or compatibly licensed code.
- Forced USB resets, disconnects, process termination, and privilege escalation are out of scope for the initial release.

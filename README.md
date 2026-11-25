# MusubiPublisher

Reddit・Hacker News・国内トレンドから注目の話題を自動収集し、Gemini API で日本語オリジナル解説記事の下書き PR を自動作成するキュレーションメディアです。

人間の運用は **スマホの GitHub アプリで下書き PR を見て「Merge（公開）」か「Close（ボツ）」を選ぶだけ**。Merge すると GitHub Actions で自動ビルド＆公開され、`/rss.xml` を通じて姉妹アプリ **MusubiReader** にも即反映されます。

## セットアップ（初回のみ）

1. **GitHub Pages を有効化**
   - リポジトリの `Settings → Pages → Source` を **GitHub Actions** に設定
2. **Gemini API キーを登録**
   - リポジトリの `Settings → Secrets and variables → Actions` に `GEMINI_API_KEY` を登録
3. **Actions の PR 作成権限を有効化**
   - `Settings → Actions → General → Workflow permissions` で **Allow GitHub Actions to create and approve pull requests** にチェック

## コマンド

```bash
npm run dev        # ローカル開発サーバー
npm run typecheck  # Astro + TypeScript 型チェック
npm test           # パイプライン単体テスト (Vitest)
npm run build      # 静的サイトビルド (dist/)
npm run curate     # 収集＆下書き生成をローカル実行（要 GEMINI_API_KEY）
```

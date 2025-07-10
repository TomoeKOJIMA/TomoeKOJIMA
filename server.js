const express = require('express');
const multer = require('multer');
const { Dropbox } = require('dropbox');

// Renderに設定した環境変数からアクセストークンを取得
const dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });

const app = express();
const PORT = process.env.PORT || 3000;

// Multerはメモリ上にファイルを一時保存するように設定
const upload = multer({ storage: multer.memoryStorage() });

// フロントエンドのファイルを提供
app.use(express.static(__dirname));

// 番号が使用済みかチェックするAPI
app.get('/api/check_number', async (req, res) => {
    const number = req.query.number;
    const dropboxPath = `/${number.substring(1)}.wav`;

    try {
        await dbx.filesGetMetadata({ path: dropboxPath });
        // ファイルが見つかった = 使用済み
        res.json({ available: false });
    } catch (error) {
        if (error.status === 409) {
            // ファイルが見つからなかった = 利用可能
            res.json({ available: true });
        } else {
            // その他のDropboxエラー
            console.error("Dropbox check error:", error);
            res.status(500).json({ message: 'サーバーエラーが発生しました。' });
        }
    }
});

// 録音データをDropboxにアップロードするAPI
app.post('/api/record', upload.single('audio'), async (req, res) => {
    const requestedNumber = req.body.number;
    const fileName = `${requestedNumber.substring(1)}.wav`;
    const dropboxPath = `/${fileName}`;

    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ message: '音声データがありません。' });
    }

    try {
        await dbx.filesUpload({
            path: dropboxPath,
            contents: req.file.buffer,
            mode: 'add', // 厳密に、新規追加のみ許可
            autorename: false
        });
        res.status(201).json({ success: true, newNumber: requestedNumber });
    } catch (error) {
        console.error("Dropbox upload error:", error);
        // すでにファイルが存在していた場合のエラーをハンドリング
        if (error.status === 409) {
            return res.status(409).json({ message: 'この番号は既に使用されています（アップロード直前に他の方が使用しました）。' });
        }
        res.status(500).json({ message: 'アップロード中にサーバーエラーが発生しました。' });
    }
});

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
    console.log(`サーバーがポート ${PORT} で起動しました。`);
});
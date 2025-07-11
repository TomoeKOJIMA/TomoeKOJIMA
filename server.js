require('dotenv').config();

const express = require('express');
const multer = require('multer');
const { Dropbox } = require('dropbox');
const ffmpeg = require('fluent-ffmpeg');
const { Readable } = require('stream');

const dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static(__dirname));

// 番号が使用済みかチェックするAPI
app.get('/api/check_number', async (req, res) => {
    try {
        const number = req.query.number;

        // numberが存在しない、または空文字の場合はエラーを返す
        if (!number) {
            console.log("リクエストに number が含まれていませんでした。");
            return res.status(400).json({ message: 'クエリパラメータ "number" が必要です。' });
        }

        console.log(`受け取った番号: ${number}`); // どんな値が来たかログで確認

        const dropboxPath = `/${number.substring(1)}.wav`;
        console.log(`確認するDropboxパス: ${dropboxPath}`); // 生成されたパスも確認

        try {
            // DropboxのAPIを呼び出す
            await dbx.filesGetMetadata({ path: dropboxPath });
            // ファイルが存在した場合
            res.json({ available: false });
        } catch (dropboxError) {
            // Dropbox APIからのエラーを処理
            if (dropboxError.status === 409) {
                // ファイルが存在しない場合 (これが正常な「利用可能」ケース)
                res.json({ available: true });
            } else {
                // その他のDropboxエラー
                throw dropboxError; // 外側のcatchにエラーを投げる
            }
        }
    } catch (error) {
        // 予期せぬ全体的なエラーをキャッチ
        console.error("★★★★ /api/check_number で予期せぬエラーが発生しました ★★★★", error);
        res.status(500).json({ message: 'サーバー内部でエラーが発生しました。' });
    }
});

// ★★★ ここから新しいAPIを追加 ★★★
// Dropboxから一時的なダウンロードリンクを取得するAPI
app.get('/api/listen', async (req, res) => {
    const number = req.query.number;
    const dropboxPath = `/${number.substring(1)}.wav`;

    try {
        // ファイルの存在を確認
        await dbx.filesGetMetadata({ path: dropboxPath });
        
        // 一時的なダウンロードリンクを生成
        const { result } = await dbx.filesGetTemporaryLink({ path: dropboxPath });
        
        // リンクをフロントエンドに返す
        res.json({ success: true, link: result.link, number: number });

    } catch (error) {
        if (error.status === 409) {
            // ファイルが見つからなかった場合
            res.status(404).json({ message: 'その番号の伝言は見つかりませんでした。' });
        } else {
            console.error("Dropbox get link error:", error);
            res.status(500).json({ message: 'サーバーエラーが発生しました。' });
        }
    }
});
// ★★★ ここまで ★★★


// 録音データをDropboxにアップロードするAPI
app.post('/api/record', upload.single('audio'), async (req, res) => {
    const requestedNumber = req.body.number;
    const fileName = `${requestedNumber.substring(1)}.wav`;
    const dropboxPath = `/${fileName}`;

    if (!req.file) {
        return res.status(400).json({ message: '音声データがありません。' });
    }

    try {
        // メモリ上のWEBMデータをWAVに変換
        const wavBuffer = await new Promise((resolve, reject) => {
            const chunks = [];
            const readableStream = Readable.from(req.file.buffer);
            
            ffmpeg(readableStream)
                .toFormat('wav')
                .on('error', (err) => reject(new Error('FFmpeg conversion error: ' + err.message)))
                .stream()
                .on('data', (chunk) => chunks.push(chunk))
                .on('end', () => resolve(Buffer.concat(chunks)));
        });

        // 変換したWAVデータをDropboxにアップロード
        await dbx.filesUpload({
            path: dropboxPath,
            contents: wavBuffer,
        });

        res.status(201).json({ success: true, newNumber: requestedNumber });

    } catch (error) {
        console.error("Upload/Conversion error:", error);
        res.status(500).json({ message: 'サーバーエラーが発生しました。' });
    }
});

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
    console.log(`サーバーがポート ${PORT} で起動しました。`);
});
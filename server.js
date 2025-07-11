require('dotenv').config();

const express = require('express');
const multer = require('multer');
const { Dropbox } = require('dropbox');
const ffmpeg = require('fluent-ffmpeg');
const { Readable } = require('stream');

// Dropboxのアクセストークンが設定されているか確認
if (!process.env.DROPBOX_ACCESS_TOKEN) {
    console.error("★★★★ 環境変数 DROPBOX_ACCESS_TOKEN が設定されていません。アプリを終了します。 ★★★★");
    process.exit(1); // アプリを強制終了
}
const dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static(__dirname));

// 番号が使用済みかチェックするAPI
app.get('/api/check_number', async (req, res) => {
    try {
        const number = req.query.number;
        if (!number) {
            console.log("リクエストに number が含まれていませんでした。");
            return res.status(400).json({ message: 'クエリパラメータ "number" が必要です。' });
        }
        console.log(`[Check] 受け取った番号: ${number}`);
        const dropboxPath = `/${number.substring(1)}.wav`;
        console.log(`[Check] 確認するDropboxパス: ${dropboxPath}`);

        try {
            await dbx.filesGetMetadata({ path: dropboxPath });
            res.json({ available: false }); // ファイルが存在する = 使用不可
        } catch (dropboxError) {
            if (dropboxError.status === 409) {
                res.json({ available: true }); // ファイルが存在しない = 使用可能
            } else {
                throw dropboxError; // その他のDropboxエラーは外側のcatchへ
            }
        }
    } catch (error) {
        console.error("★★★★ /api/check_number で予期せぬエラー ★★★★", error);
        res.status(500).json({ message: 'サーバー内部でエラーが発生しました。' });
    }
});

// Dropboxから一時的なダウンロードリンクを取得するAPI
app.get('/api/listen', async (req, res) => {
    // ★★★ ここを修正 ★★★
    try {
        const number = req.query.number;
        if (!number) {
            console.log("リクエストに number が含まれていませんでした。");
            return res.status(400).json({ message: 'クエリパラメータ "number" が必要です。' });
        }
        console.log(`[Listen] 受け取った番号: ${number}`);
        const dropboxPath = `/${number.substring(1)}.wav`;
        console.log(`[Listen] 確認するDropboxパス: ${dropboxPath}`);

        // ファイルの存在を確認し、一時的なダウンロードリンクを生成
        const { result } = await dbx.filesGetTemporaryLink({ path: dropboxPath });
        res.json({ success: true, link: result.link, number: number });

    } catch (error) {
        if (error.status === 409) {
            res.status(404).json({ message: 'その番号の伝言は見つかりませんでした。' });
        } else {
            console.error("★★★★ /api/listen で予期せぬエラー ★★★★", error);
            res.status(500).json({ message: 'サーバー内部でエラーが発生しました。' });
        }
    }
});


// 録音データをDropboxにアップロードするAPI
app.post('/api/record', upload.single('audio'), async (req, res) => {
    try {
        const requestedNumber = req.body.number;
        const fileName = `${requestedNumber.substring(1)}.wav`;
        const dropboxPath = `/${fileName}`;

        if (!req.file) {
            return res.status(400).json({ message: '音声データがありません。' });
        }

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
        console.error("★★★★ /api/record で予期せぬエラー ★★★★", error);
        res.status(500).json({ message: 'サーバーエラーが発生しました。' });
    }
});

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
    console.log(`サーバーがポート ${PORT} で起動しました。`);
});

const express = require('express');
const multer = require('multer');
const { Dropbox } = require('dropbox');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static(__dirname));

// 番号チェックAPI (変更なし)
app.get('/api/check_number', async (req, res) => {
    const number = req.query.number;
    const dropboxPath = `/${number.substring(1)}.wav`;
    try {
        await dbx.filesGetMetadata({ path: dropboxPath });
        res.json({ available: false });
    } catch (error) {
        if (error.status === 409) {
            res.json({ available: true });
        } else {
            console.error("Dropbox check error:", error);
            res.status(500).json({ message: 'サーバーエラーが発生しました。' });
        }
    }
});

// 録音API (FFmpeg変換処理を追加)
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

// サーバー起動 (変更なし)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`サーバーがポート ${PORT} で起動しました。`);
});
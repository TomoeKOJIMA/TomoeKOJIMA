const express = require('express');
const multer = require('multer');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const PORT = 3000;

// --- データベースとファイル保存の設定 (変更なし) ---
const DB_PATH = path.join(__dirname, 'database.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const TEMP_DIR = path.join(__dirname, 'temp');

fs.mkdir(UPLOAD_DIR, { recursive: true });
fs.mkdir(TEMP_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, TEMP_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '.webm');
    }
});
const upload = multer({ storage: storage });

// --- データベース操作の関数 (変更なし) ---
async function readDB() {
    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

async function writeDB(data) {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

// --- APIの定義 ---
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOAD_DIR));


// 【録音API】★重複チェックのロジックをここに追加
app.post('/api/record', upload.single('audio'), async (req, res) => {
    const requestedNumber = req.body.number; // 例: "#8300"
    const tempFilePath = req.file.path;

    if (!requestedNumber || !requestedNumber.startsWith('#') || requestedNumber.length !== 5) {
        await fs.unlink(tempFilePath);
        return res.status(400).json({ message: '無効な番号形式です。' });
    }

    try {
        const db = await readDB();

        // ★★★ ここからが新しいロジック ★★★
        const existingRecording = db.find(rec => rec.number === requestedNumber);

        if (existingRecording) {
            // もし番号が既に使用されていた場合
            await fs.unlink(tempFilePath); // 一時ファイルを削除
            // 409 Conflictエラーを返し、番号が使われていることを伝える
            return res.status(409).json({ message: 'この番号は既に使用されています。' });
        }
        // ★★★ ここまで ★★★

        // 番号が使用されていなければ、以下の処理に進む
        const numberInt = parseInt(requestedNumber.substring(1), 10);
        const newFileName = `${String(numberInt).padStart(4, '0')}.wav`;
        const finalWavPath = path.join(UPLOAD_DIR, newFileName);

        // FFmpegによる変換処理
        await new Promise((resolve, reject) => {
            ffmpeg(tempFilePath)
                .toFormat('wav')
                .on('error', (err) => reject(err))
                .on('end', () => resolve())
                .save(finalWavPath);
        });
        
        await fs.unlink(tempFilePath);

        // データベースに記録
        db.push({
            number: requestedNumber, // リクエストされた番号をそのまま使用
            filePath: `/uploads/${newFileName}`,
            timestamp: new Date().toISOString()
        });
        await writeDB(db);

        // 成功を返す
        res.status(201).json({ success: true, newNumber: requestedNumber });

    } catch (error) {
        console.error("録音処理エラー:", error);
        if (fsSync.existsSync(tempFilePath)) {
            await fs.unlink(tempFilePath);
        }
        res.status(500).json({ message: 'サーバーエラーが発生しました。' });
    }
});

// 【番号チェックAPI】★このブロックを新しく追加
app.get('/api/check_number', async (req, res) => {
    const number = req.query.number;

    if (!number || !number.startsWith('#') || number.length !== 5) {
        return res.status(400).json({ message: '無効な番号形式です。' });
    }
    
    try {
        const db = await readDB();
        const existingRecording = db.find(rec => rec.number === number);
        
        if (existingRecording) {
            // 番号が見つかったら「利用不可」を返す
            res.json({ available: false });
        } else {
            // 番号が見つからなければ「利用可能」を返す
            res.json({ available: true });
        }
    } catch (error) {
        console.error("番号チェックエラー:", error);
        res.status(500).json({ message: 'サーバーエラーが発生しました。' });
    }
});


// 【再生API】★指定された番号だけを探すように変更
app.get('/api/listen', async (req, res) => {
    const number = req.query.number;

    if (!number || !number.startsWith('#') || number.length !== 5) {
        return res.status(400).json({ message: '無効な番号形式です。' });
    }
    try {
        const db = await readDB();
        
        // データベースから完全に一致する番号だけをフィルタリング
        const recordings = db.filter(rec => rec.number === number);

        res.json(recordings);
    } catch (error) {
        console.error("再生処理エラー:", error);
        res.status(500).json({ message: 'サーバーエラーが発生しました。' });
    }
});


// サーバー起動 (変更なし)
app.listen(PORT, () => {
    console.log(`サーバーがポート ${PORT} で起動しました: http://localhost:${PORT}`);
});
document.addEventListener('DOMContentLoaded', () => {
    // ポップアップの処理
    const welcomePopup = document.getElementById('welcome-popup');
    const closePopupBtn = document.getElementById('close-popup-btn');

    closePopupBtn.addEventListener('click', () => {
        welcomePopup.classList.add('hidden');
    });

    // 必要なHTML要素を取得します
    const display = document.getElementById('display');
    const statusEl = document.getElementById('status');
    const recordBtn = document.getElementById('recordBtn');
    const playBtn = document.getElementById('playBtn');
    const audioPlaybackArea = document.getElementById('audio-playback-area');

    // 録音関連の変数を準備します
    let mediaRecorder;
    let audioChunks = [];
    let recordingTimer;

    // ダイヤルパッドの入力処理
    document.querySelector('.dial-pad').addEventListener('click', (e) => {
        if (!e.target.classList.contains('dial-btn')) return;

        const key = e.target.textContent;

        if (key === 'C') {
            display.textContent = '#';
        } else if (key === '#') {
            if (!display.textContent.startsWith('#')) {
                display.textContent = '#' + display.textContent;
            }
        } else if (display.textContent.length < 5) {
            display.textContent += key;
        }
    });

    // 録音ボタンの処理
    recordBtn.addEventListener('click', async () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            clearTimeout(recordingTimer);
        } else {
            const number = display.textContent;
            if (number.length !== 5 || !number.startsWith('#')) {
                statusEl.textContent = '「# + 4桁」で番号を指定してください。';
                return;
            }
            
            // ステップ1: まず番号が利用可能かサーバーに確認
            statusEl.textContent = `番号「${number}」が使えるか確認中...`;
            try {
                const checkResponse = await fetch(`/api/check_number?number=${encodeURIComponent(number)}`);
                const checkResult = await checkResponse.json();

                if (!checkResponse.ok) {
                    throw new Error(checkResult.message || 'サーバーでエラーが発生しました。');
                }
                
                if (!checkResult.available) {
                    statusEl.textContent = 'この番号は既に使用されています。';
                    return;
                }
            } catch (error) {
                statusEl.textContent = 'サーバーとの通信に失敗しました。';
                console.error('Check number error:', error);
                return;
            }

            // ステップ2: 番号が利用可能なら、録音を開始
            try {
                statusEl.textContent = 'マイクの準備をしています...';
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.addEventListener('dataavailable', event => {
                    audioChunks.push(event.data);
                });

                mediaRecorder.addEventListener('stop', () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    uploadRecording(audioBlob);
                    
                    recordBtn.textContent = '録音 (30秒)';
                    recordBtn.classList.remove('recording');
                    statusEl.textContent = '録音をアップロード中...';
                });
                
                mediaRecorder.start();
                statusEl.textContent = '録音中... (最大30秒)';
                recordBtn.textContent = '停止';
                recordBtn.classList.add('recording');

                recordingTimer = setTimeout(() => {
                    if (mediaRecorder && mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                    }
                }, 30000);

            } catch (err) {
                console.error("マイクへのアクセスエラー:", err);
                statusEl.textContent = 'マイクへのアクセスが拒否されました。';
            }
        }
    });

    // 音声アップロード処理
    async function uploadRecording(blob) {
        const number = display.textContent;
        const formData = new FormData();
        formData.append('audio', blob);
        formData.append('number', number);

        try {
            const response = await fetch('/api/record', {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();
            if (response.ok) {
                statusEl.textContent = `録音完了！あなたの番号は ${result.newNumber} です。`;
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('アップロードエラー:', error);
            statusEl.textContent = error.message;
        }
    }

    // 再生ボタンの処理
    playBtn.addEventListener('click', async () => {
        const number = display.textContent;
        if (number.length !== 5 || !number.startsWith('#')) {
            statusEl.textContent = '「# + 4桁」で再生したい番号を指定してください。';
            return;
        }

        statusEl.textContent = `「${number}」の伝言を探しています...`;
        audioPlaybackArea.innerHTML = '';

        try {
            const response = await fetch(`/api/listen?number=${encodeURIComponent(number)}`);
            const recordings = await response.json();

            if (response.ok) {
                if (recordings.length > 0) {
                    statusEl.textContent = `「${number}」に関連する ${recordings.length} 件の伝言が見つかりました。`;
                    recordings.forEach(rec => {
                        const audioEl = document.createElement('audio');
                        audioEl.controls = true;
                        audioEl.src = rec.filePath;
                        
                        const label = document.createElement('p');
                        label.textContent = `伝言番号: ${rec.number}`;
                        label.style.marginBottom = '5px';

                        audioPlaybackArea.appendChild(label);
                        audioPlaybackArea.appendChild(audioEl);
                    });
                } else {
                    statusEl.textContent = `「${number}」の伝言は見つかりませんでした。`;
                }
            } else {
                throw new Error(recordings.message);
            }
        } catch (error) {
            console.error('再生エラー:', error);
            statusEl.textContent = 'メッセージの取得に失敗しました。';
        }
    });
});
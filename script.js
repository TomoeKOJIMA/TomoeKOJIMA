document.addEventListener('DOMContentLoaded', () => {
    // ポップアップの処理
    const welcomePopup = document.getElementById('welcome-popup');
    const closePopupBtn = document.getElementById('close-popup-btn');

    closePopupBtn.addEventListener('click', () => {
        welcomePopup.classList.add('hidden');
    });

    // 必要なHTML要素を取得
    const display = document.getElementById('display');
    const statusEl = document.getElementById('status');
    const recordBtn = document.getElementById('recordBtn');
    const playBtn = document.getElementById('playBtn');
    const audioPlaybackArea = document.getElementById('audio-playback-area');

    // 録音関連の変数
    let mediaRecorder;
    let audioChunks = [];
    let recordingTimer;
    let countdownInterval; // ★カウントダウン用の変数を追加

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
            clearInterval(countdownInterval); // ★カウントダウンを停止
        } else {
            const number = display.textContent;
            if (number.length !== 5 || !number.startsWith('#')) {
                statusEl.textContent = '「# + 4桁」で番号を指定してください。';
                return;
            }
            
            statusEl.textContent = `番号「${number}」が使えるか確認中...`;
            try {
                const checkResponse = await fetch(`/api/check_number?number=${encodeURIComponent(number)}`);
                const checkResult = await checkResponse.json();
                if (!checkResponse.ok) throw new Error(checkResult.message);
                if (!checkResult.available) {
                    statusEl.textContent = 'この番号は既に使用されています。';
                    return;
                }
            } catch (error) {
                statusEl.textContent = 'サーバーとの通信に失敗しました。';
                return;
            }

            try {
                statusEl.textContent = 'マイクの準備をしています...';
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.addEventListener('dataavailable', event => audioChunks.push(event.data));
                mediaRecorder.addEventListener('stop', () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    uploadRecording(audioBlob);
                    recordBtn.textContent = '録音 (30秒)';
                    recordBtn.classList.remove('recording');
                    statusEl.textContent = '録音をアップロード中...';
                });
                
                mediaRecorder.start();
                recordBtn.textContent = '停止';
                recordBtn.classList.add('recording');

                // ★★★ カウントダウン処理 ★★★
                let timeLeft = 30;
                statusEl.textContent = `録音中... 残り ${timeLeft} 秒`;
                countdownInterval = setInterval(() => {
                    timeLeft--;
                    statusEl.textContent = `録音中... 残り ${timeLeft} 秒`;
                    if (timeLeft <= 0) {
                        clearInterval(countdownInterval);
                    }
                }, 1000);
                // ★★★ ここまで ★★★

                recordingTimer = setTimeout(() => {
                    if (mediaRecorder && mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                    }
                }, 30000);

            } catch (err) {
                statusEl.textContent = 'マイクへのアクセスが拒否されました。';
                clearInterval(countdownInterval);
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
            const response = await fetch('/api/record', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            statusEl.textContent = `録音完了！あなたの番号は ${result.newNumber} です。`;
        } catch (error) {
            statusEl.textContent = error.message;
        }
    }

    // ★★★ 再生ボタンの処理を書き換え ★★★
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
            const result = await response.json();
            
            if (!response.ok) throw new Error(result.message);

            statusEl.textContent = `伝言が見つかりました。再生します。`;
            
            const audioEl = document.createElement('audio');
            audioEl.controls = true;
            audioEl.src = result.link; // ★Dropboxの一時リンクを使用
            
            const label = document.createElement('p');
            label.textContent = `伝言番号: ${result.number}`;
            
            audioPlaybackArea.appendChild(label);
            audioPlaybackArea.appendChild(audioEl);
            audioEl.play();

        } catch (error) {
            statusEl.textContent = error.message;
        }
    });
});
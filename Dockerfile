# 1. ベースとなるOSとNode.jsのバージョンを指定
FROM node:18-slim

# 2. FFmpegをインストール（ここで管理者権限が使える）
RUN apt-get update && apt-get install -y ffmpeg

# 3. アプリの作業ディレクトリを作成
WORKDIR /usr/src/app

# 4. package.jsonファイルをコピーして、ライブラリをインストール
COPY package*.json ./
RUN npm install

# 5. プロジェクトのすべてのファイルをコピー
COPY . .

# 6. アプリを起動するコマンドを指定
CMD [ "node", "server.js" ]
# 1. ベースとなるOSとNode.jsのバージョンを指定
FROM node:18-slim

# 2. アプリの作業ディレクトリを作成
WORKDIR /usr/src/app

# 3. package.jsonファイルをコピーして、ライブラリをインストール
COPY package*.json ./
RUN npm install

# 4. プロジェクトのすべてのファイルをコピー
COPY . .

EXPOSE 10000

# 5. アプリを起動するコマンドを指定
CMD [ "node", "server.js" ]
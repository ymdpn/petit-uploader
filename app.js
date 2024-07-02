// app.js

const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const iconv = require('iconv-lite');

const app = express();
const port = 3000;

// ミドルウェアの設定
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// データディレクトリの作成
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// JSONファイルのパス
const usersFilePath = path.join(dataDir, 'users.json');
const filesFilePath = path.join(dataDir, 'files.json');

// ユーザーデータの読み込み
function loadUsers() {
  if (fs.existsSync(usersFilePath)) {
    const data = fs.readFileSync(usersFilePath, 'utf8');
    return JSON.parse(data);
  }
  return {};
}

// ユーザーデータの保存
function saveUsers(users) {
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
}

// ファイルデータの読み込み
function loadFiles() {
  if (fs.existsSync(filesFilePath)) {
    const data = fs.readFileSync(filesFilePath, 'utf8');
    return JSON.parse(data);
  }
  return {};
}

// ファイルデータの保存
function saveFiles(files) {
  fs.writeFileSync(filesFilePath, JSON.stringify(files, null, 2));
}

// マルチパートフォームの設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.session.userId;
    const date = new Date().toISOString().split('T')[0];
    const dir = path.join(__dirname, 'files', userId, date);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // ファイル名をデコード
    const decodedFilename = iconv.decode(Buffer.from(file.originalname, 'binary'), 'utf8');
    cb(null, decodedFilename);
  }
});

const upload = multer({ storage: storage });

// ルートページ
app.get('/', (req, res) => {
  res.render('index');
});

// ユーザー登録ページ
app.get('/register', (req, res) => {
  res.render('register');
});

// ユーザー登録処理
app.post('/register', (req, res) => {
  const { loginId, password } = req.body;
  const users = loadUsers();

  if (users[loginId]) {
    return res.status(400).send('このログインIDは既に使用されています。');
  }

  const userId = uuidv4();
  const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

  users[loginId] = { userId, password: hashedPassword };
  saveUsers(users);

  res.redirect('/login');
});

// ログインページ
app.get('/login', (req, res) => {
  res.render('login');
});

// ログイン処理
app.post('/login', (req, res) => {
  const { loginId, password } = req.body;
  const users = loadUsers();

  if (users[loginId] && users[loginId].password === crypto.createHash('sha256').update(password).digest('hex')) {
    req.session.userId = users[loginId].userId;
    req.session.loginId = loginId;
    res.redirect('/dashboard');
  } else {
    res.status(401).send('ログインIDまたはパスワードが間違っています。');
  }
});

// ダッシュボード
app.get('/dashboard', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  const files = loadFiles();
  const userFiles = files[req.session.userId] || [];

  res.render('dashboard', { loginId: req.session.loginId, files: userFiles });
});

// ファイルアップロード
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.session.userId) {
    return res.status(401).send('ログインしてください。');
  }

  const userId = req.session.userId;
  const date = new Date().toISOString().split('T')[0];
  const decodedFilename = iconv.decode(Buffer.from(req.file.originalname, 'binary'), 'utf8');
  const filePath = path.join('files', userId, date, decodedFilename);

  const files = loadFiles();
  if (!files[userId]) {
    files[userId] = [];
  }

  files[userId].push({
    name: decodedFilename,
    path: filePath,
    date: new Date().toISOString()
  });

  saveFiles(files);

  res.redirect('/dashboard');
});

// ファイルダウンロード
app.get('/download/:fileName', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).send('ログインしてください。');
  }

  const userId = req.session.userId;
  const fileName = req.params.fileName;
  const files = loadFiles();

  const file = files[userId].find(f => f.name === fileName);
  if (!file) {
    return res.status(404).send('ファイルが見つかりません。');
  }

  const filePath = path.join(__dirname, file.path);
  
  // Content-Dispositionヘッダーでファイル名をエンコード
  const encodedFilename = encodeURIComponent(file.name);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
  
  res.download(filePath);
});

// ファイル削除
app.post('/delete/:fileName', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).send('ログインしてください。');
  }

  const userId = req.session.userId;
  const fileName = req.params.fileName;
  const files = loadFiles();

  const fileIndex = files[userId].findIndex(f => f.name === fileName);
  if (fileIndex === -1) {
    return res.status(404).send('ファイルが見つかりません。');
  }

  const filePath = path.join(__dirname, files[userId][fileIndex].path);
  fs.unlinkSync(filePath);

  files[userId].splice(fileIndex, 1);
  saveFiles(files);

  res.redirect('/dashboard');
});

// ログアウト
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('ログアウトエラー:', err);
    }
    res.redirect('/');
  });
});

// サーバーの起動
app.listen(port, () => {
  console.log(`サーバーが http://localhost:${port} で起動しました`);
});
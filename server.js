const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');  //フォームから送られた内容を、req.body に自動的に取り込んでくれる

const app = express();
const PORT = 8000;
const imageDir = path.join(__dirname, 'images');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);  //存在しなければ 新しく data フォルダを作る。
}

// 静的ファイル（HTML, JS, imagesなど）を公開
app.use(express.static(path.join(__dirname)));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/data', express.static(path.join(__dirname, 'data')));
app.use(bodyParser.json());

// 画像リストAPI（未使用画像取得用）
app.get('/api/images', (req, res) => {
  fs.readdir(imageDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: '画像ディレクトリの読み込みエラー' });
    }

    const usedIcons = req.query.used ? req.query.used.split(',') : [];
    const pngs = files.filter(f =>
      f.endsWith('.png') && !usedIcons.includes(f)
    );

    res.json(pngs);
  });
});


// JSON保存用APIエンドポイント
app.post('/api/save', (req, res) => {
  const { filename, graph } = req.body;

  console.log("=== POST /api/save 受信 ===");
  console.log(JSON.stringify(req.body, null, 2));

  // ✅ まず graph 自体があるかどうかをチェック！
  if (!graph || typeof graph !== 'object') {
    return res.status(400).json({ error: 'graph データが存在しません' });
  }

  const { nodes, links } = graph;

  // ✅ nodes, links の妥当性をチェック
  if (!Array.isArray(nodes) || !Array.isArray(links)) {
    return res.status(400).json({ error: '保存するノードまたはリンクデータがありません' });
  }

  if (typeof filename !== 'string' || filename.trim() === '') {
    return res.status(400).json({ error: 'ファイル名が指定されていません' });
  }

  const filepath = path.join(dataDir, filename.endsWith('.json') ? filename : filename + '.json');

  fs.writeFile(filepath, JSON.stringify({ nodes, links }, null, 2), 'utf8', err => {
    if (err) {
      console.error('ファイル保存エラー:', err);
      return res.status(500).json({ error: '保存に失敗しました' });
    }
    res.json({ message: '保存が完了しました', path: filepath });
  });
});

// JSONファイル読み込みAPIエンドポイント
app.get('/api/load/:filename', (req, res) => {
  const filename = typeof req.params.filename === 'string' ? req.params.filename : '';
  if (!filename) {
    return res.status(400).json({ error: 'ファイル名が無効です' });
  }
  const filepath = path.join(dataDir, filename.endsWith('.json') ? filename : filename + '.json');
  console.log('読み込もうとしているファイルのパス:', filepath);

  fs.readFile(filepath, 'utf8', (err, data) => {
    if (err) {
      console.error('ファイル読み込みエラー:', err);
      return res.status(500).json({ error: 'ファイルの読み込みに失敗しました' });
    }
    try {
      const jsonData = JSON.parse(data);
      res.json(jsonData);
    } catch (parseError) {
      console.error('JSON解析エラー:', parseError);
      res.status(500).json({ error: 'JSONファイルの解析に失敗しました' });
    }
  });
});

// /data フォルダ内の JSON ファイル一覧を返すAPI
app.get('/api/list', (req, res) => {
  fs.readdir(dataDir, (err, files) => {
    if (err) {
      console.error('ディレクトリ読み込みエラー:', err);
      return res.status(500).json({ error: 'ファイル一覧の取得に失敗しました' });
    }

    const jsonFiles = files.filter(file => file.endsWith('.json'));
    res.json(jsonFiles);
  });
});



// JSONファイル一覧取得API
app.get('/api/list', (req, res) => {
  fs.readdir(dataDir, (err, files) => {
    if (err) {
      console.error('ディレクトリ読み込みエラー:', err);
      return res.status(500).json({ error: 'ファイル一覧の取得に失敗しました' });
    }
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    res.json(jsonFiles);
  });
});

// JSONファイル読込API
app.get('/api/load/:filename', (req, res) => {
  const filePath = path.join(dataDir, req.params.filename);
  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      console.error('ファイル読み込みエラー:', err);
      return res.status(404).json({ error: 'ファイルが見つかりません' });
    }
    try {
      const jsonData = JSON.parse(content);
      res.json(jsonData);
    } catch (parseErr) {
      console.error('JSON解析エラー:', parseErr);
      res.status(500).json({ error: 'JSON解析に失敗しました' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
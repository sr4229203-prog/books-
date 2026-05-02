const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();
const port = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
const booksFile = path.join(dataDir, 'books.json');
const usersFile = path.join(dataDir, 'users.json');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const fileExt = path.extname(file.originalname);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  }
});
const upload = multer({ storage });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'books-secret-session',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function ensureDataFiles() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }

  if (!fs.existsSync(booksFile)) {
    fs.writeFileSync(booksFile, JSON.stringify([{
      id: 1,
      title: 'Sample Book',
      author: 'Admin',
      description: 'Welcome to the book reader app. Use the admin page to add more books.',
      type: 'text',
      content: 'This is a sample book page. Add more books from the admin section and read them here.'
    }], null, 2));
  }

  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify([
      { username: 'admin', password: 'admin123', role: 'admin' }
    ], null, 2));
  }
}

function readJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content || '[]');
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

ensureDataFiles();

app.get('/api/auth/status', (req, res) => {
  const user = req.session.user || null;
  res.json({ authenticated: Boolean(user), user });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const users = readJson(usersFile);
  const user = users.find((item) => item.username === username && item.password === password);
  if (!user) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }
  req.session.user = { username: user.username, role: user.role };
  res.json({ success: true, user: req.session.user });
});

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const users = readJson(usersFile);
  if (users.some((item) => item.username === username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const newUser = { username, password, role: 'user' };
  users.push(newUser);
  writeJson(usersFile, users);

  req.session.user = { username: newUser.username, role: newUser.role };
  res.json({ success: true, user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

function parseExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    return { name: sheetName, rows };
  });
}

app.get('/api/books', (req, res) => {
  const books = readJson(booksFile);
  const summary = books.map(({ id, title, author, description, type }) => ({
    id,
    title,
    author,
    description,
    type: type || 'text'
  }));
  res.json(summary);
});

app.get('/api/books/:id', (req, res) => {
  const books = readJson(booksFile);
  const book = books.find((item) => item.id === Number(req.params.id));
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }
  const result = { ...book, type: book.type || 'text' };
  if (book.fileName) {
    result.fileUrl = `/uploads/${encodeURIComponent(book.fileName)}`;
  }
  res.json(result);
});

app.get('/api/books/:id/data', (req, res) => {
  const books = readJson(booksFile);
  const book = books.find((item) => item.id === Number(req.params.id));
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }
  if (book.type !== 'excel') {
    return res.status(400).json({ error: 'Book is not an Excel file' });
  }
  try {
    const filePath = path.join(uploadsDir, book.fileName);
    const sheets = parseExcel(filePath);
    res.json({ sheets });
  } catch (err) {
    res.status(500).json({ error: 'Unable to parse Excel file' });
  }
});

app.post('/api/books', requireAdmin, upload.single('file'), (req, res) => {
  const { title, author, description, content } = req.body;
  const file = req.file;
  if (!title || !author) {
    if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return res.status(400).json({ error: 'Title and author are required' });
  }

  const bookType = file ? (() => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (extension === '.pdf') return 'pdf';
    if (extension === '.xls' || extension === '.xlsx') return 'excel';
    return null;
  })() : 'text';

  if (!file && !content) {
    return res.status(400).json({ error: 'Please provide book content or upload a file' });
  }

  if (file && !bookType) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return res.status(400).json({ error: 'Only PDF or Excel files are allowed' });
  }

  const books = readJson(booksFile);
  const nextId = books.length ? Math.max(...books.map((book) => book.id)) + 1 : 1;
  const newBook = {
    id: nextId,
    title,
    author,
    description: description || '',
    type: bookType,
    content: content || '',
    fileName: file ? file.filename : ''
  };
  books.push(newBook);
  writeJson(booksFile, books);
  res.json({ success: true, book: newBook });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  console.log(`Book reader app listening on http://${host}:${port}`);
});

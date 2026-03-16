const express = require('express');
const session = require('express-session');
const initSqlJs = require('sql.js');

const app = express();

// In-memory SQLite (sql.js / WebAssembly) — fully synchronous
let db;
initSqlJs().then((SQL) => {
  db = new SQL.Database();
  db.run(`
    CREATE TABLE users (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT    NOT NULL UNIQUE,
      password TEXT    NOT NULL
    )
  `);
  db.run("INSERT INTO users (username, password) VALUES ('admin', 'password123')");
  db.run("INSERT INTO users (username, password) VALUES ('user1', 'mypassword')");
});

app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: 'super-secret-key-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 30 * 60 * 1000 }, // 30 min
}));

const html = (title, body) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f0f2f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: white; border-radius: 12px; padding: 40px; width: 100%; max-width: 420px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    h1 { font-size: 1.6rem; margin-bottom: 8px; color: #1a1a2e; }
    p.subtitle { color: #666; margin-bottom: 28px; font-size: 0.95rem; }
    label { display: block; font-size: 0.85rem; font-weight: 600; color: #444; margin-bottom: 6px; }
    input { width: 100%; padding: 10px 14px; border: 1.5px solid #ddd; border-radius: 8px; font-size: 1rem; outline: none; transition: border-color 0.2s; }
    input:focus { border-color: #4f46e5; }
    .field { margin-bottom: 18px; }
    button { width: 100%; padding: 12px; background: #4f46e5; color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #4338ca; }
    .error { background: #fee2e2; color: #b91c1c; padding: 10px 14px; border-radius: 8px; margin-bottom: 18px; font-size: 0.9rem; }
    .badge { display: inline-block; background: #d1fae5; color: #065f46; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; margin-bottom: 20px; }
    .admin-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
    .logout { font-size: 0.85rem; color: #4f46e5; text-decoration: none; font-weight: 600; }
    .logout:hover { color: #4338ca; }
    .info-box { background: #f5f3ff; border-left: 4px solid #4f46e5; padding: 16px 20px; border-radius: 8px; color: #3730a3; font-size: 0.95rem; }
    .users-table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 0.9rem; }
    .users-table th, .users-table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #f0f0f0; }
    .users-table th { color: #888; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; }
    .hint { margin-top: 20px; font-size: 0.8rem; color: #999; text-align: center; }
  </style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`;

// --- Routes ---

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/admin');
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/admin');
  res.send(html('Login', `
    <h1>Welcome back</h1>
    <p class="subtitle">Sign in to access the admin area</p>
    ${req.query.error ? `<div class="error">Invalid username or password.</div>` : ''}
    <form method="POST" action="/login">
      <div class="field">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" placeholder="Enter username" required autofocus>
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" placeholder="Enter password" required>
      </div>
      <button type="submit">Sign In</button>
    </form>
    <p class="hint">Try: admin / password123 &nbsp;|&nbsp; user1 / mypassword</p>
  `));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = getUser(username, password);

  if (!user) {
    return res.redirect('/login?error=1');
  }

  req.session.regenerate((err) => {
    if (err) return res.redirect('/login?error=1');
    req.session.user = { username: user.username };
    res.redirect('/admin');
  });
});

//function to retrieve user from database
const getUser = (username, password) => {
  const result = db.exec("SELECT * FROM users WHERE username = '" + username + "' AND password = '" + password + "'");

  if (!result.length || !result[0].values.length) return null;
  const [id, uname] = result[0].values[0];
  return { id, username: uname };
};

app.get('/admin', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const { username } = req.session.user;
  const result = db.exec('SELECT id, username FROM users');
  const userList = result.length ? result[0].values.map(([id, username]) => ({ id, username })) : [];

  res.send(html('Admin Area', `
    <div class="admin-header">
      <div>
        <span class="badge">✓ Authenticated</span>
        <h1>Admin Area</h1>
      </div>
      <a class="logout" href="/logout">Sign out</a>
    </div>
    <div class="info-box">
      You are logged in as <strong>${username}</strong>.
    </div>
    <table class="users-table">
      <thead>
        <tr><th>ID</th><th>Username</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${userList.map(u => `
          <tr>
            <td>${u.id}</td>
            <td>${u.username}</td>
            <td style="color:#16a34a">● Active</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `));
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Credentials: admin / password123  |  user1 / mypassword');
});

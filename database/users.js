const bcrypt = require('bcrypt');

async function ensureAdminUser(db) {
  const users = db.collection('users');

  const existing = await users.findOne({ username: 'admin' });
  if (existing) return;

  const passwordPlain = process.env.ADMIN_PASSWORD || 'admin12345';
  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  await users.insertOne({
    username: 'admin',
    passwordHash,
    role: 'admin',
    createdAt: new Date()
  });

  console.log('Admin user created: admin');
}

module.exports = { ensureAdminUser };

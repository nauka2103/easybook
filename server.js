const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const session = require('express-session');
const MongoStore = require('connect-mongo').default;
const bcrypt = require('bcrypt');

const { ObjectId } = require('mongodb');
const { connectToDb, getDb } = require('./database/db');
const { ensureAdminUser } = require('./database/users');

const app = express();

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.set('trust proxy', 1);

app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    dbName: process.env.DB_NAME || 'easybooking'
  }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 6
  }
}));

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const safeHtml = (html = '') => ({ __safeHtml: true, html });

const renderView = (file, replacements) => {
  let html = fs.readFileSync(path.join(__dirname, 'views', file), 'utf8');
  for (const [key, raw] of Object.entries(replacements)) {
    const value = raw?.__safeHtml ? raw.html : escapeHtml(raw);
    html = html.split(`{{${key}}}`).join(value);
  }
  return html;
};

function requireAuth(req, res, next) {
  if (req.session?.user) return next();

  if (req.path.startsWith('/api')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/login');
}

let DB_READY = false;

// 20 seeded hotels + meaningful fields (8+ fields)
const ITEMS = [
  { title: 'Luxury Hotel Room', description: 'Premium room with city view', location: 'Almaty', price_per_night: 70000, stars: 5, rooms: 40, amenities: 'WiFi, Breakfast, Spa, Gym', contact_phone: '+7 700 111 22 33' },
  { title: 'Cozy Apartment', description: '2-bedroom apartment near center', location: 'Astana', price_per_night: 55000, stars: 4, rooms: 12, amenities: 'WiFi, Kitchen, Parking', contact_phone: '+7 701 222 33 44' },
  { title: 'Beach Resort', description: 'All-inclusive resort near beach', location: 'Aktau', price_per_night: 120000, stars: 5, rooms: 90, amenities: 'Pool, Beach, WiFi, All-inclusive', contact_phone: '+7 702 333 44 55' },
  { title: 'Business Hotel', description: 'Comfort stay for business trips', location: 'Astana', price_per_night: 65000, stars: 4, rooms: 60, amenities: 'WiFi, Breakfast, Conference hall', contact_phone: '+7 703 444 55 66' },
  { title: 'Family Apartment', description: 'Spacious apartment for families', location: 'Almaty', price_per_night: 60000, stars: 4, rooms: 18, amenities: 'WiFi, Kitchen, Washer', contact_phone: '+7 704 555 66 77' },

  { title: 'Mountain Lodge', description: 'Quiet lodge near mountains', location: 'Almaty', price_per_night: 80000, stars: 5, rooms: 25, amenities: 'WiFi, Sauna, Fireplace', contact_phone: '+7 705 111 11 11' },
  { title: 'City Hostel', description: 'Budget hostel in downtown', location: 'Astana', price_per_night: 18000, stars: 2, rooms: 30, amenities: 'WiFi, Shared kitchen', contact_phone: '+7 705 222 22 22' },
  { title: 'Lake House', description: 'House near lake with terrace', location: 'Burabay', price_per_night: 90000, stars: 5, rooms: 10, amenities: 'WiFi, BBQ, Lake view', contact_phone: '+7 705 333 33 33' },
  { title: 'Boutique Hotel', description: 'Stylish boutique rooms', location: 'Shymkent', price_per_night: 50000, stars: 4, rooms: 22, amenities: 'WiFi, Breakfast, Cafe', contact_phone: '+7 705 444 44 44' },
  { title: 'Airport Inn', description: 'Close to airport, quick stay', location: 'Almaty', price_per_night: 35000, stars: 3, rooms: 45, amenities: 'WiFi, Shuttle, Breakfast', contact_phone: '+7 705 555 55 55' },

  { title: 'Central Suites', description: 'Suites in city center', location: 'Astana', price_per_night: 75000, stars: 5, rooms: 35, amenities: 'WiFi, Gym, Parking', contact_phone: '+7 706 111 22 33' },
  { title: 'Old Town Hotel', description: 'Classic hotel near old town', location: 'Turkistan', price_per_night: 42000, stars: 3, rooms: 28, amenities: 'WiFi, Breakfast', contact_phone: '+7 706 222 33 44' },
  { title: 'Riverside Apartment', description: 'Apartment near river walk', location: 'Pavlodar', price_per_night: 38000, stars: 3, rooms: 14, amenities: 'WiFi, Kitchen', contact_phone: '+7 706 333 44 55' },
  { title: 'Steppe Hotel', description: 'Simple comfortable rooms', location: 'Karaganda', price_per_night: 32000, stars: 3, rooms: 50, amenities: 'WiFi, Parking', contact_phone: '+7 706 444 55 66' },
  { title: 'Green Park Resort', description: 'Nature resort with park', location: 'Kokshetau', price_per_night: 85000, stars: 5, rooms: 55, amenities: 'Pool, WiFi, Spa', contact_phone: '+7 706 555 66 77' },

  { title: 'Budget Stay', description: 'Good for short trips', location: 'Aktobe', price_per_night: 25000, stars: 2, rooms: 35, amenities: 'WiFi', contact_phone: '+7 707 111 00 11' },
  { title: 'Premium Suites', description: 'Premium suites with services', location: 'Almaty', price_per_night: 140000, stars: 5, rooms: 20, amenities: 'WiFi, Spa, Butler', contact_phone: '+7 707 222 00 22' },
  { title: 'Family Resort', description: 'Resort for families & kids', location: 'Aktau', price_per_night: 110000, stars: 4, rooms: 75, amenities: 'Kids zone, Pool, WiFi', contact_phone: '+7 707 333 00 33' },
  { title: 'Student Rooms', description: 'Affordable rooms near uni', location: 'Almaty', price_per_night: 20000, stars: 2, rooms: 80, amenities: 'WiFi, Shared kitchen', contact_phone: '+7 707 444 00 44' },
  { title: 'Conference Hotel', description: 'Hotel with conference center', location: 'Astana', price_per_night: 95000, stars: 5, rooms: 120, amenities: 'WiFi, Conference halls, Breakfast', contact_phone: '+7 707 555 00 55' }
];

const buildFilterFromQuery = (query) => {
  const { q = '', city = '', minPrice = '', maxPrice = '' } = query;
  const filter = {};

  if (city) filter.location = city;

  if (minPrice || maxPrice) {
    filter.price_per_night = {};
    if (minPrice !== '' && Number.isFinite(Number(minPrice))) {
      filter.price_per_night.$gte = Number(minPrice);
    }
    if (maxPrice !== '' && Number.isFinite(Number(maxPrice))) {
      filter.price_per_night.$lte = Number(maxPrice);
    }
    if (Object.keys(filter.price_per_night).length === 0) delete filter.price_per_night;
  }

  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
      { location: { $regex: q, $options: 'i' } },
      { amenities: { $regex: q, $options: 'i' } }
    ];
  }

  return filter;
};

const buildSortFromQuery = (query) => {
  const { sort = '' } = query;

  switch (sort) {
    case 'price_asc': return { price_per_night: 1, title: 1 };
    case 'price_desc': return { price_per_night: -1, title: 1 };
    case 'title_asc': return { title: 1, price_per_night: 1 };
    case 'title_desc': return { title: -1, price_per_night: 1 };
    default: return { price_per_night: 1, title: 1 };
  }
};

const buildProjectionFromQuery = (query) => {
  const { fields = '' } = query;
  if (!fields) return null;

  const projection = {};
  fields.split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .forEach((f) => { projection[f] = 1; });

  return Object.keys(projection).length ? projection : null;
};

(async () => {
  try {
    await connectToDb();
    const db = getDb();

    await ensureAdminUser(db);

    const count = await db.collection('hotels').countDocuments();
    if (count === 0) {
      await db.collection('hotels').insertMany(
        ITEMS.map(x => ({ ...x, createdAt: new Date() }))
      );
      console.log('Hotels seeded');
    }

    DB_READY = true;
    console.log('MongoDB connected');
  } catch (e) {
    console.error('MongoDB connection failed:', e.message);
    console.error('Server will still start, but DB routes may fail.');
  }

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})();

app.get('/__debug', (req, res) => {
  res.json({
    cwd: process.cwd(),
    dirname: __dirname,
    viewsExists: fs.existsSync(path.join(__dirname, 'views')),
    publicExists: fs.existsSync(path.join(__dirname, 'public')),
    filesInViews: fs.existsSync(path.join(__dirname, 'views'))
      ? fs.readdirSync(path.join(__dirname, 'views'))
      : [],
    filesInPublic: fs.existsSync(path.join(__dirname, 'public'))
      ? fs.readdirSync(path.join(__dirname, 'public'))
      : []
  });
});

// Block if DB not ready
app.use((req, res, next) => {
  if (DB_READY) return next();
  if (req.path === '/__debug') return next();
  return res.status(503).send('Database unavailable');
});

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'views', 'index.html'))
);

app.get('/about', (req, res) =>
  res.sendFile(path.join(__dirname, 'views', 'about.html'))
);

app.get('/contact', (req, res) =>
  res.sendFile(path.join(__dirname, 'views', 'contact.html'))
);

// LOGIN / LOGOUT
app.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/hotels');
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/login', async (req, res) => {
  try {
    const db = getDb();
    const { username = '', password = '' } = req.body;

    if (!username || !password) {
      return res.status(400).send('Invalid credentials');
    }

    const user = await db.collection('users').findOne({ username });
    if (!user) return res.status(401).send('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).send('Invalid credentials');

    req.session.user = { id: user._id.toString(), username: user.username, role: user.role };
    return res.redirect('/hotels');
  } catch (e) {
    return res.status(500).send('Server error');
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.redirect('/login');
  });
});

app.get('/search', (req, res) => {
  const q = req.query.q || '';
  res.redirect(`/hotels?q=${encodeURIComponent(q)}`);
});

app.get('/hotels', async (req, res) => {
  const db = getDb();
  const {
    q = '',
    city = '',
    minPrice = '',
    maxPrice = '',
    sort = '',
    fields = ''
  } = req.query;

  const filter = buildFilterFromQuery(req.query);
  const sortObj = buildSortFromQuery(req.query);
  const projection = buildProjectionFromQuery(req.query);
  const findOptions = projection ? { projection } : undefined;

  const hotels = await db.collection('hotels')
    .find(filter, findOptions)
    .sort(sortObj)
    .toArray();

  const cities = await db.collection('hotels').distinct('location');

  const results = hotels.length === 0
    ? '<div class="feature-card"><h3>No hotels found</h3></div>'
    : hotels.map(h => `
      <div class="feature-card">
        <h3>${escapeHtml(h.title)}</h3>
        <p>${escapeHtml(h.description || '')}</p>
        <p>
          <strong>City:</strong> ${escapeHtml(h.location || '')}<br/>
          <strong>Price:</strong> ${escapeHtml(String(h.price_per_night ?? ''))} ₸<br/>
          <strong>Stars:</strong> ${escapeHtml(String(h.stars ?? ''))}<br/>
          <strong>Rooms:</strong> ${escapeHtml(String(h.rooms ?? ''))}<br/>
          <strong>Amenities:</strong> ${escapeHtml(String(h.amenities ?? ''))}<br/>
          <strong>Phone:</strong> ${escapeHtml(String(h.contact_phone ?? ''))}
        </p>

        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top: 10px;">
          <a class="btn" href="/item/${h._id}">View</a>
          <a class="btn btn-outline" href="/item/${h._id}/edit">Edit</a>
          <form method="POST" action="/item/${h._id}/delete" style="display:inline;">
            <button class="btn btn-outline" type="submit" onclick="return confirm('Delete this hotel?')">Delete</button>
          </form>
        </div>
      </div>
    `).join('');

  const options = ['<option value="">All</option>']
    .concat(cities.map(c =>
      `<option value="${escapeHtml(c)}" ${c === city ? 'selected' : ''}>${escapeHtml(c)}</option>`
    )).join('');

  const sortOptions = [
    { v: '', label: 'Default' },
    { v: 'price_asc', label: 'Price ↑' },
    { v: 'price_desc', label: 'Price ↓' },
    { v: 'title_asc', label: 'Title A→Z' },
    { v: 'title_desc', label: 'Title Z→A' }
  ].map(o =>
    `<option value="${escapeHtml(o.v)}" ${o.v === sort ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
  ).join('');

  const qs = new URLSearchParams({ q, city, minPrice, maxPrice, sort, fields }).toString();
  const apiUrl = `/api/hotels${qs ? `?${qs}` : ''}`;

  // show auth status (small helper in page if you want)
  const authInfo = req.session?.user
    ? `<form method="POST" action="/logout" style="margin: 0 0 20px 0;">
         <button class="btn btn-outline" type="submit">Logout (${escapeHtml(req.session.user.username)})</button>
       </form>`
    : `<a class="btn" href="/login">Login</a>`;

  res.send(renderView('hotels.html', {
    q,
    cityOptions: safeHtml(options),
    minPrice,
    maxPrice,
    sortOptions: safeHtml(sortOptions),
    sort,
    fields,
    apiUrl,
    results: safeHtml(authInfo + results)
  }));
});

app.get('/hotels/new', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'new-hotel.html'));
});

app.post('/hotels', requireAuth, async (req, res) => {
  const db = getDb();
  const {
    title,
    description = '',
    location,
    price_per_night,
    stars,
    rooms,
    amenities = '',
    contact_phone = ''
  } = req.body;

  const price = Number(price_per_night);
  const s = Number(stars);
  const r = Number(rooms);

  if (!title || !location || !Number.isFinite(price) || price <= 0 ||
      !Number.isFinite(s) || s < 1 || s > 5 ||
      !Number.isFinite(r) || r < 1) {
    return res.status(400).send('Invalid data');
  }

  const result = await db.collection('hotels').insertOne({
    title,
    description,
    location,
    price_per_night: price,
    stars: s,
    rooms: r,
    amenities,
    contact_phone,
    createdAt: new Date()
  });

  res.redirect(`/item/${result.insertedId}`);
});

app.get('/item/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(400).sendFile(path.join(__dirname, 'views', '404.html'));

  const db = getDb();
  const item = await db.collection('hotels')
    .findOne({ _id: new ObjectId(req.params.id) });

  if (!item)
    return res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));

  res.send(renderView('item.html', {
    id: item._id.toString(),
    title: item.title,
    description: item.description || '',
    location: item.location,
    availability: 'Available',
    price: `${item.price_per_night} ₸ / night`,
    stars: String(item.stars ?? ''),
    rooms: String(item.rooms ?? ''),
    amenities: String(item.amenities ?? ''),
    contact_phone: String(item.contact_phone ?? '')
  }));
});

app.get('/item/:id/edit', requireAuth, async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(400).sendFile(path.join(__dirname, 'views', '404.html'));

  const db = getDb();
  const item = await db.collection('hotels')
    .findOne({ _id: new ObjectId(req.params.id) });

  if (!item)
    return res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));

  res.send(renderView('edit-hotel.html', {
    id: item._id.toString(),
    title: item.title,
    description: item.description || '',
    location: item.location,
    price_per_night: item.price_per_night,
    stars: String(item.stars ?? ''),
    rooms: String(item.rooms ?? ''),
    amenities: String(item.amenities ?? ''),
    contact_phone: String(item.contact_phone ?? '')
  }));
});

app.post('/item/:id', requireAuth, async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(400).sendFile(path.join(__dirname, 'views', '404.html'));

  const {
    title,
    description = '',
    location,
    price_per_night,
    stars,
    rooms,
    amenities = '',
    contact_phone = ''
  } = req.body;

  const price = Number(price_per_night);
  const s = Number(stars);
  const r = Number(rooms);

  if (!title || !location || !Number.isFinite(price) || price <= 0 ||
      !Number.isFinite(s) || s < 1 || s > 5 ||
      !Number.isFinite(r) || r < 1) {
    return res.status(400).send('Invalid data');
  }

  const db = getDb();
  const result = await db.collection('hotels').updateOne(
    { _id: new ObjectId(req.params.id) },
    {
      $set: {
        title,
        description,
        location,
        price_per_night: price,
        stars: s,
        rooms: r,
        amenities,
        contact_phone
      }
    }
  );

  if (!result.matchedCount)
    return res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));

  res.redirect(`/item/${req.params.id}`);
});

app.post('/item/:id/delete', requireAuth, async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(400).sendFile(path.join(__dirname, 'views', '404.html'));

  const db = getDb();
  const result = await db.collection('hotels')
    .deleteOne({ _id: new ObjectId(req.params.id) });

  if (!result.deletedCount)
    return res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));

  res.redirect('/hotels');
});

// API
app.get('/api/hotels', async (req, res) => {
  const db = getDb();

  const filter = buildFilterFromQuery(req.query);
  const sort = buildSortFromQuery(req.query);
  const projection = buildProjectionFromQuery(req.query);
  const options = projection ? { projection } : undefined;

  const hotels = await db.collection('hotels')
    .find(filter, options)
    .sort(sort)
    .toArray();

  res.json(hotels);
});

app.get('/api/hotels/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(400).json({ error: 'Invalid ID' });

  const db = getDb();

  const projection = buildProjectionFromQuery(req.query);
  const options = projection ? { projection } : undefined;

  const hotel = await db.collection('hotels')
    .findOne({ _id: new ObjectId(req.params.id) }, options);

  if (!hotel) return res.status(404).json({ error: 'Not found' });
  res.json(hotel);
});

app.post('/api/hotels', requireAuth, async (req, res) => {
  const {
    title,
    description = '',
    location,
    price_per_night,
    stars,
    rooms,
    amenities = '',
    contact_phone = ''
  } = req.body;

  const price = Number(price_per_night);
  const s = Number(stars);
  const r = Number(rooms);

  if (!title || !location || !Number.isFinite(price) || price <= 0 ||
      !Number.isFinite(s) || s < 1 || s > 5 ||
      !Number.isFinite(r) || r < 1) {
    return res.status(400).json({ error: 'Missing/invalid fields' });
  }

  const db = getDb();
  const result = await db.collection('hotels').insertOne({
    title,
    description,
    location,
    price_per_night: price,
    stars: s,
    rooms: r,
    amenities,
    contact_phone,
    createdAt: new Date()
  });

  res.status(201).json({ _id: result.insertedId });
});

app.put('/api/hotels/:id', requireAuth, async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(400).json({ error: 'Invalid ID' });

  const {
    title,
    description = '',
    location,
    price_per_night,
    stars,
    rooms,
    amenities = '',
    contact_phone = ''
  } = req.body;

  const price = Number(price_per_night);
  const s = Number(stars);
  const r = Number(rooms);

  if (!title || !location || !Number.isFinite(price) || price <= 0 ||
      !Number.isFinite(s) || s < 1 || s > 5 ||
      !Number.isFinite(r) || r < 1) {
    return res.status(400).json({ error: 'Missing/invalid fields' });
  }

  const db = getDb();
  const result = await db.collection('hotels').updateOne(
    { _id: new ObjectId(req.params.id) },
    {
      $set: {
        title,
        description,
        location,
        price_per_night: price,
        stars: s,
        rooms: r,
        amenities,
        contact_phone
      }
    }
  );

  if (!result.matchedCount)
    return res.status(404).json({ error: 'Not found' });

  res.json({ message: 'Updated' });
});

app.delete('/api/hotels/:id', requireAuth, async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(400).json({ error: 'Invalid ID' });

  const db = getDb();
  const result = await db.collection('hotels')
    .deleteOne({ _id: new ObjectId(req.params.id) });

  if (!result.deletedCount)
    return res.status(404).json({ error: 'Not found' });

  res.json({ message: 'Deleted' });
});

app.use((req, res) => {
  if (req.path.startsWith('/api'))
    res.status(404).json({ error: 'Not found' });
  else
    res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
});

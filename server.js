const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { ObjectId } = require('mongodb');
const { connectToDb, getDb } = require('./database/db');

const app = express();

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

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

const ITEMS = [
  { title: 'Luxury Hotel Room', description: 'Premium room...', location: 'Almaty', price_per_night: 70000 },
  { title: 'Cozy Apartment', description: '2-bedroom apartment...', location: 'Astana', price_per_night: 55000 },
  { title: 'Beach Resort', description: 'All-inclusive resort...', location: 'Aktau', price_per_night: 120000 },
  { title: 'Business Hotel', description: 'Comfort stay...', location: 'Astana', price_per_night: 65000 },
  { title: 'Family Apartment', description: 'Spacious apartment...', location: 'Almaty', price_per_night: 60000 }
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
      { location: { $regex: q, $options: 'i' } }
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

    const count = await db.collection('hotels').countDocuments();
    if (count === 0) {
      await db.collection('hotels').insertMany(ITEMS);
      console.log('Hotels seeded');
    }

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

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'views', 'index.html'))
);

app.get('/about', (req, res) =>
  res.sendFile(path.join(__dirname, 'views', 'about.html'))
);

app.get('/contact', (req, res) =>
  res.sendFile(path.join(__dirname, 'views', 'contact.html'))
);

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
        <p><strong>City:</strong> ${escapeHtml(h.location || '')}<br/>
        <strong>Price:</strong> ${escapeHtml(String(h.price_per_night ?? ''))} ₸</p>

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

  res.send(renderView('hotels.html', {
    q,
    cityOptions: safeHtml(options),
    minPrice,
    maxPrice,
    sortOptions: safeHtml(sortOptions),
    sort,
    fields,
    apiUrl,
    results: safeHtml(results)
  }));
});

app.get('/hotels/new', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'new-hotel.html'));
});

app.post('/hotels', async (req, res) => {
  const db = getDb();
  const { title, description = '', location, price_per_night } = req.body;

  const price = Number(price_per_night);
  if (!title || !location || !Number.isFinite(price) || price <= 0) {
    return res.status(400).send('Invalid data');
  }

  const result = await db.collection('hotels').insertOne({
    title,
    description,
    location,
    price_per_night: price
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
    price: `${item.price_per_night} ₸ / night`
  }));
});

app.get('/item/:id/edit', async (req, res) => {
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
    price_per_night: item.price_per_night
  }));
});

app.post('/item/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(400).sendFile(path.join(__dirname, 'views', '404.html'));

  const { title, description = '', location, price_per_night } = req.body;
  const price = Number(price_per_night);

  if (!title || !location || !Number.isFinite(price) || price <= 0) {
    return res.status(400).send('Invalid data');
  }

  const db = getDb();
  const result = await db.collection('hotels').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { title, description, location, price_per_night: price } }
  );

  if (!result.matchedCount)
    return res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));

  res.redirect(`/item/${req.params.id}`);
});

app.post('/item/:id/delete', async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(400).sendFile(path.join(__dirname, 'views', '404.html'));

  const db = getDb();
  const result = await db.collection('hotels')
    .deleteOne({ _id: new ObjectId(req.params.id) });

  if (!result.deletedCount)
    return res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));

  res.redirect('/hotels');
});

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

app.post('/api/hotels', async (req, res) => {
  const { title, description = '', location, price_per_night } = req.body;
  const price = Number(price_per_night);

  if (!title || !location || !Number.isFinite(price) || price <= 0)
    return res.status(400).json({ error: 'Missing/invalid fields' });

  const db = getDb();
  const result = await db.collection('hotels').insertOne({
    title,
    description,
    location,
    price_per_night: price
  });

  res.status(201).json({ _id: result.insertedId });
});

app.put('/api/hotels/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(400).json({ error: 'Invalid ID' });

  const db = getDb();
  const result = await db.collection('hotels').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );

  if (!result.matchedCount)
    return res.status(404).json({ error: 'Not found' });

  res.json({ message: 'Updated' });
});

app.delete('/api/hotels/:id', async (req, res) => {
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

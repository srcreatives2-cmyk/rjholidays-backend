require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const enquiryRoutes = require('./routes/enquiries');
const leadRoutes = require('./routes/leads');
const quoteRoutes = require('./routes/quotes');
const catalogRoutes = require('./routes/catalog');
const whatsappRoutes = require('./routes/whatsapp');
const bookingRoutes = require('./routes/bookings');
const paymentRoutes = require('./routes/payments');
const customerPortalRoutes = require('./routes/customerPortal');
const dashboardRoutes = require('./routes/dashboard');
const insightsRoutes = require('./routes/insights');
const couponRoutes = require('./routes/coupons');
const documentRoutes = require('./routes/documents');
const reviewRoutes = require('./routes/reviews');

const app = express();

const allowedOrigins = new Set([
  process.env.FRONTEND_ORIGIN,
  'https://rjholidays.online',
  'https://www.rjholidays.online',
  'https://rjholidays-backend.onrender.com',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
].filter(Boolean));

app.use(cors({
  origin(origin, callback) {
    // Allow server-to-server requests and tools such as curl/Postman that do not send Origin.
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
}));

// The Razorpay webhook needs the raw, unparsed body to verify the signature â
// this must be registered BEFORE express.json(), and only for this one route.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

// Serve the admin panel + public quote page as static files.
// Both are single-page apps that read the token/route from the URL client-side,
// so any sub-path under /admin or /quote/:token must fall back to the same index.html.
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));
app.get(/^\/admin(\/.*)?$/, (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));

app.use('/quote', express.static(path.join(__dirname, 'public/quote')));
app.get(/^\/quote\/.*/, (req, res) => res.sendFile(path.join(__dirname, 'public/quote/index.html')));

app.use('/customer', express.static(path.join(__dirname, 'public/customer')));
app.get(/^\/customer(\/.*)?$/, (req, res) => res.sendFile(path.join(__dirname, 'public/customer/index.html')));

app.use('/review', express.static(path.join(__dirname, 'public/review')));
app.get(/^\/review\/.*/, (req, res) => res.sendFile(path.join(__dirname, 'public/review/index.html')));

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'RJ Holidays Backend', phases: ['5 - Enquiries', '6 - CRM', '7 - Quotations'] });
});
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/enquiries', enquiryRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/customer', customerPortalRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/reviews', reviewRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler â never leak stack traces to the client
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RJ Holidays backend running on port ${PORT}`));

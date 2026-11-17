require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// A transient network failure reaching Supabase surfaces as a raw Node/undici
// error ("TypeError: fetch failed", ECONNRESET, etc.) -- genuinely confusing
// shown straight to a user on a login screen. Logs the real error for
// debugging, returns something a person can actually act on.
function friendlyDbError(error) {
  console.error('DB error:', error);
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('fetch failed') || msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('enotfound')) {
    return 'Could not reach the server right now. Please try again in a moment.';
  }
  return error?.message || 'Something went wrong.';
}

// Prefer a plain env var holding the PEM contents directly (reliable on any host —
// no dependency on a platform's "secret file" mount actually being present at boot).
// Falls back to reading a local file for local dev, where JAAS_PRIVATE_KEY_PATH
// points at server/jaas-private-key.pk.
const privateKey = process.env.JAAS_PRIVATE_KEY
  ? process.env.JAAS_PRIVATE_KEY.replace(/\\n/g, '\n')
  : fs.readFileSync(path.resolve(__dirname, process.env.JAAS_PRIVATE_KEY_PATH), 'utf8');

const app = express();
const PORT = 5000;

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  console.log('A user connected');

  // Booking chat real-time delivery. The client must prove (via its JWT) that it's
  // actually one of this booking's two participants before it's allowed to join the
  // room -- otherwise anyone could guess a bookingId and eavesdrop on someone else's chat.
  socket.on('join-booking-chat', async ({ bookingId, token }) => {
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      const role = await getBookingParticipantRole(bookingId, user);
      if (!role) return socket.emit('chat-error', { error: 'Not authorized for this conversation' });
      socket.join(`booking-${bookingId}`);
      // Booking chat is now a window onto the pair's Resident Inquiries thread
      // (see /bookings/:id/messages), so it listens on that same room.
      const { data: pair } = await supabase
        .from('Booking').select('resident_id, psychologist_id').eq('booking_id', bookingId).single();
      if (pair) socket.join(`inquiry-${pair.resident_id}-${pair.psychologist_id}`);
    } catch {
      socket.emit('chat-error', { error: 'Invalid session' });
    }
  });

  // Pre-booking inquiry chat real-time delivery (same proof-of-participant
  // pattern as join-booking-chat above, just keyed by the resident/psychologist
  // pair directly since there's no booking yet).
  socket.on('join-inquiry-chat', async ({ residentId, psychologistId, token }) => {
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      // A psychologist joining never supplies their own psychologist_id from the
      // client -- it's resolved from their verified JWT instead, so this can't
      // be spoofed into joining someone else's thread.
      let resolvedPsychologistId = psychologistId;
      if (user.role === 'psychologist') {
        resolvedPsychologistId = await getOwnPsychologistId(user.user_id);
      }
      const role = await getInquiryParticipantRole(residentId, resolvedPsychologistId, user);
      if (!role || !resolvedPsychologistId) return socket.emit('chat-error', { error: 'Not authorized for this conversation' });
      socket.join(`inquiry-${residentId}-${resolvedPsychologistId}`);
    } catch {
      socket.emit('chat-error', { error: 'Invalid session' });
    }
  });

  // Lets a logged-in client receive events addressed to them specifically (e.g.
  // "your psychologist just started the call") no matter which page they're on,
  // the same way Layout mounts ReminderBanner on every resident page. Proven by
  // the same verify-the-JWT pattern as the chat rooms above -- a client can only
  // ever join its own room, never anyone else's.
  socket.on('join-user-channel', ({ token }) => {
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      socket.join(`user-${user.user_id}`);
    } catch {
      socket.emit('chat-error', { error: 'Invalid session' });
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(cors());
app.use(express.json());

// Live booking-status sync for Resident Inquiries. Every route that changes a
// Booking or Payment (request, approve, decline, pay, verify, reschedule,
// cancel) is matched here, and once it has SUCCEEDED, both participants get a
// 'booking-updated' socket event on their own user channel. The inquiry badge
// itself is still derived from the real rows on the next read -- this only
// tells open pages to re-read, so it can never disagree with the database.
const BOOKING_MUTATION_ROUTES = [
  { method: 'POST', re: /^\/bookings\/?$/, kind: 'create' },
  { method: 'POST', re: /^\/bookings\/(\d+)\/(accept|decline|cancel|psychologist-cancel)$/, kind: 'booking' },
  { method: 'PATCH', re: /^\/bookings\/(\d+)\/(reschedule|psychologist-reschedule)$/, kind: 'booking' },
  { method: 'POST', re: /^\/admin\/bookings\/(\d+)\/(cancel|reassign)$/, kind: 'booking' },
  { method: 'POST', re: /^\/bookings\/(\d+)\/complete$/, kind: 'booking' },
  { method: 'POST', re: /^\/payments\/(\d+)\/simulate$/, kind: 'payment' },
  { method: 'GET', re: /^\/payments\/(\d+)\/sync$/, kind: 'payment' },
];

async function emitBookingUpdated({ bookingId, paymentId, residentId, psychologistId }) {
  try {
    if (paymentId) {
      const { data } = await supabase.from('Payment').select('booking_id').eq('payment_id', paymentId).single();
      bookingId = data?.booking_id;
    }
    if (bookingId) {
      const { data } = await supabase.from('Booking').select('resident_id, psychologist_id').eq('booking_id', bookingId).single();
      residentId = data?.resident_id;
      psychologistId = data?.psychologist_id;
    }
    if (!residentId || !psychologistId) return;
    const { data: psych } = await supabase.from('Psychologist').select('user_id').eq('psychologist_id', psychologistId).single();
    const payload = { booking_id: bookingId ? Number(bookingId) : null, resident_id: Number(residentId) };
    io.to(`user-${residentId}`).emit('booking-updated', payload);
    if (psych?.user_id) io.to(`user-${psych.user_id}`).emit('booking-updated', payload);
  } catch {
    // best-effort notification of an already-committed change
  }
}

// A session marked completed (Booking.completed_at, see
// db/booking_completed_at.sql) is final: it can't be moved or cancelled after
// the fact by the resident, the psychologist, or an admin.
const COMPLETED_LOCKED_ROUTES = [
  { method: 'POST', re: /^\/bookings\/(\d+)\/(cancel|psychologist-cancel)$/ },
  { method: 'PATCH', re: /^\/bookings\/(\d+)\/(reschedule|psychologist-reschedule)$/ },
  { method: 'POST', re: /^\/admin\/bookings\/(\d+)\/(cancel|reassign)$/ },
];

app.use(async (req, res, next) => {
  const route = COMPLETED_LOCKED_ROUTES.find((r) => r.method === req.method && r.re.test(req.path));
  if (!route) return next();
  const { data, error } = await supabase
    .from('Booking').select('completed_at').eq('booking_id', req.path.match(route.re)[1]).maybeSingle();
  // If the column doesn't exist yet (migration not run), nothing can be completed.
  if (!error && data?.completed_at) {
    return res.status(409).json({ error: 'This session has already been completed and can no longer be changed' });
  }
  next();
});

app.use((req, res, next) => {
  const route = BOOKING_MUTATION_ROUTES.find((r) => r.method === req.method && r.re.test(req.path));
  if (!route) return next();
  const id = req.path.match(route.re)[1];
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    if (route.kind === 'create') {
      emitBookingUpdated({ residentId: req.body?.resident_id, psychologistId: req.body?.psychologist_id });
    } else if (route.kind === 'payment') {
      emitBookingUpdated({ paymentId: id });
    } else {
      emitBookingUpdated({ bookingId: id });
    }
  });
  next();
});

// Verifies the JWT /auth/login already issues and attaches its payload (user_id, role,
// name) as req.user. /auth/login has signed these tokens since day one, but nothing
// ever actually checked them on subsequent requests — every route just trusted whatever
// ids were in the request body. This is the first route to actually enforce it.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'Missing or invalid Authorization header' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Use after requireAuth. requireRole('admin', 'psychologist') etc.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that' });
    }
    next();
  };
}

// Returns 'resident' or 'psychologist' if this user is one of the two participants
// on this booking, or null otherwise. Used to gate access to that booking's chat --
// only these two people can ever see that conversation.
async function getBookingParticipantRole(bookingId, user) {
  const { data: booking, error } = await supabase
    .from('Booking')
    .select('resident_id, psychologist_id')
    .eq('booking_id', bookingId)
    .single();

  if (error || !booking) return null;

  if (user.role === 'resident' && booking.resident_id === user.user_id) return 'resident';

  if (user.role === 'psychologist') {
    const { data: psychologist } = await supabase
      .from('Psychologist')
      .select('psychologist_id')
      .eq('user_id', user.user_id)
      .single();
    if (psychologist && psychologist.psychologist_id === booking.psychologist_id) return 'psychologist';
  }

  return null;
}

// Same idea as getBookingParticipantRole, but for a pre-booking Inquiry_Message
// thread, which has no booking row to look up -- the thread's identity IS the
// (resident_id, psychologist_id) pair, so this just checks the caller is one
// of those two people (never trusting a client-supplied role).
async function getInquiryParticipantRole(residentId, psychologistId, user) {
  if (user.role === 'resident' && Number(user.user_id) === Number(residentId)) return 'resident';

  if (user.role === 'psychologist') {
    const { data: psychologist } = await supabase
      .from('Psychologist')
      .select('psychologist_id')
      .eq('user_id', user.user_id)
      .single();
    if (psychologist && Number(psychologist.psychologist_id) === Number(psychologistId)) return 'psychologist';
  }

  return null;
}

app.get('/', (req, res) => {
  res.send('Server is running');
});

app.get('/test-supabase', async (req, res) => {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: process.env.SUPABASE_KEY },
  });
  res.json({ connected: response.ok, status: response.status });
});

app.get('/barangays', async (req, res) => {
  const { data, error } = await supabase.from('Barangay').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/bookings/user/:userId', async (req, res) => {
  const { userId } = req.params;

  const { data, error } = await supabase
    .from('Booking')
    .select('*, Psychologist(psychologist_id, license_no, User(name)), Payment(payment_id, amount, status)')
    .eq('resident_id', userId)
    .order('schedule', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PayMongo Checkout Sessions: PayMongo hosts the actual payment page (card entry or
// GCash QR) so we never touch raw card details. Basic Auth with the secret key as
// username and an empty password, base64-encoded, is PayMongo's documented auth scheme.
async function paymongoRequest(method, path, body) {
  const auth = Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64');
  const res = await fetch(`https://api.paymongo.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.errors?.[0]?.detail || 'PayMongo request failed');
  return data;
}

// Verifies the caller (resident or the psychologist on the booking) actually owns
// this Payment before letting them start or check on a checkout for it.
async function getPaymentIfOwned(paymentId, user) {
  const { data: payment, error } = await supabase
    .from('Payment')
    .select('*, Booking(resident_id, psychologist_id)')
    .eq('payment_id', paymentId)
    .single();

  if (error || !payment) return null;
  if (user.role === 'resident' && payment.Booking.resident_id === user.user_id) return payment;

  if (user.role === 'psychologist') {
    const { data: psychologist } = await supabase
      .from('Psychologist')
      .select('psychologist_id')
      .eq('user_id', user.user_id)
      .single();
    if (psychologist && psychologist.psychologist_id === payment.Booking.psychologist_id) return payment;
  }

  return null;
}

// POST /payments/:id/checkout — creates a PayMongo Checkout Session for a 'pending'
// Payment and returns its checkout_url for the browser to redirect to.
app.post('/payments/:id/checkout', requireAuth, requireRole('resident'), async (req, res) => {
  const payment = await getPaymentIfOwned(req.params.id, req.user);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.status !== 'pending') return res.status(409).json({ error: 'This payment is not pending' });

  try {
    const session = await paymongoRequest('POST', '/checkout_sessions', {
      data: {
        attributes: {
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          line_items: [
            {
              currency: 'PHP',
              amount: Math.round(Number(payment.amount) * 100), // PayMongo uses centavos
              name: 'OpenUp counseling session',
              quantity: 1,
            },
          ],
          payment_method_types: ['card', 'gcash', 'paymaya'],
          success_url: `${process.env.FRONTEND_URL}/payment/result?payment_id=${payment.payment_id}&status=success`,
          cancel_url: `${process.env.FRONTEND_URL}/payment/result?payment_id=${payment.payment_id}&status=cancelled`,
        },
      },
    });

    await supabase
      .from('Payment')
      .update({ paymongo_checkout_session_id: session.data.id })
      .eq('payment_id', payment.payment_id);

    res.json({ checkout_url: session.data.attributes.checkout_url });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /payments/:id/simulate — dev-only stand-in for real checkout, for
// testing the booking flow end-to-end when PAYMONGO_SECRET_KEY isn't
// configured. Locks itself out the moment real payment processing IS
// configured, so this can never be used to dodge an actual charge in an
// environment where payments are real.
app.post('/payments/:id/simulate', requireAuth, requireRole('resident'), async (req, res) => {
  if (process.env.PAYMONGO_SECRET_KEY) {
    return res.status(403).json({ error: 'Simulated payment is not available when real payment processing is configured.' });
  }

  const payment = await getPaymentIfOwned(req.params.id, req.user);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.status !== 'pending') return res.status(409).json({ error: 'This payment is not pending' });

  const { data, error } = await supabase
    .from('Payment')
    .update({ status: 'paid' })
    .eq('payment_id', payment.payment_id)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// GET /payments/:id/sync — call after the resident returns from PayMongo's checkout
// page. Looks up the real status directly from PayMongo (source of truth) rather than
// trusting the success/cancel redirect alone, which a user could reach without paying.
app.get('/payments/:id/sync', requireAuth, async (req, res) => {
  const payment = await getPaymentIfOwned(req.params.id, req.user);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  if (payment.status !== 'pending' || !payment.paymongo_checkout_session_id) {
    return res.json({ status: payment.status });
  }

  try {
    const session = await paymongoRequest('GET', `/checkout_sessions/${payment.paymongo_checkout_session_id}`);
    const paid = (session.data.attributes.payments || []).some((p) => p.attributes.status === 'paid');

    if (paid) {
      const { data, error } = await supabase
        .from('Payment')
        .update({ status: 'paid' })
        .eq('payment_id', payment.payment_id)
        .select();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ status: data[0].status });
    }

    res.json({ status: payment.status });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/psychologists', async (req, res) => {
  const { data, error } = await supabase
    .from('Psychologist')
    .select('psychologist_id, license_no, is_verified, credentials, specialties, rating, session_price, profile_photo_url, years_experience, bio, User(name)')
    .eq('is_verified', true)
    // session_price is set on the psychologist's own profile, not at signup --
    // a verified psychologist who hasn't set one yet isn't ready to be booked,
    // so they're left out here rather than showing up as a free (₱0) session.
    .not('session_price', 'is', null);

  if (error) return res.status(500).json({ error: error.message });

  // Resolve stored storage paths to actual displayable URLs
  const withPhotoUrls = data.map((p) => ({
    ...p,
    profile_photo_url: p.profile_photo_url
      ? supabase.storage.from('psychologist-photos').getPublicUrl(p.profile_photo_url).data.publicUrl
      : null,
  }));

  res.json(withPhotoUrls);
});

// GET /resources?search=... — public read (residents view/search); file_url resolves
// the storage path the same way psychologist photos do. Only published resources --
// a draft an admin hasn't published yet never reaches residents.
app.get('/resources', async (req, res) => {
  let query = supabase.from('Resource').select('*').eq('is_published', true).order('created_at', { ascending: false });

  const { search } = req.query;
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json(data.map((r) => ({
    ...r,
    file_url: supabase.storage.from('resources').getPublicUrl(r.file_path).data.publicUrl,
  })));
});

// GET /admin/resources — every resource, published or draft (the admin-facing
// list; residents only ever see published ones via GET /resources above).
app.get('/admin/resources', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase.from('Resource').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  res.json(data.map((r) => ({
    ...r,
    file_url: supabase.storage.from('resources').getPublicUrl(r.file_path).data.publicUrl,
  })));
});

// POST /admin/resources — multipart: file + title, description, category.
// New resources default to unpublished (is_published=false) so "Publish
// Resource" is a real, distinct action from "Add Resource", not a no-op.
app.post('/admin/resources', requireAuth, requireRole('admin'), upload.single('file'), async (req, res) => {
  const { title, description, category } = req.body;
  if (!title || !req.file) return res.status(400).json({ error: 'title and file are required' });

  const filePath = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
  const { error: uploadError } = await supabase.storage
    .from('resources')
    .upload(filePath, req.file.buffer, { contentType: req.file.mimetype });
  if (uploadError) return res.status(500).json({ error: uploadError.message });

  const { data, error } = await supabase
    .from('Resource')
    .insert([{ title, description: description || null, category: category || null, file_path: filePath, is_published: false }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

// PATCH /admin/resources/:id — body: any of { title, description, category,
// is_published }. Used for both editing metadata and the Publish/Unpublish toggle.
app.patch('/admin/resources/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, description, category, is_published } = req.body;
  const updates = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (category !== undefined) updates.category = category;
  if (is_published !== undefined) updates.is_published = is_published;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const { data, error } = await supabase.from('Resource').update(updates).eq('resource_id', req.params.id).select();
  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'Resource not found' });
  res.json(data[0]);
});

// DELETE /admin/resources/:id — removes the row and its storage file.
app.delete('/admin/resources/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { data: existing, error: findError } = await supabase
    .from('Resource').select('file_path').eq('resource_id', req.params.id).single();
  if (findError || !existing) return res.status(404).json({ error: 'Resource not found' });

  const { error } = await supabase.from('Resource').delete().eq('resource_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });

  try {
    await supabase.storage.from('resources').remove([existing.file_path]);
  } catch {
    // best-effort -- the row is already gone either way
  }
  res.json({ deleted: true });
});

// Community Testimonials: public read, resident-authored, ownership-checked edit/delete.
app.get('/testimonials', async (req, res) => {
  const { data, error } = await supabase
    .from('Testimonial')
    .select('*, User(name)')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/testimonials', requireAuth, requireRole('resident'), async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });

  const { data, error } = await supabase
    .from('Testimonial')
    .insert([{ user_id: req.user.user_id, body: body.trim() }])
    .select('*, User(name)');

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.patch('/testimonials/:id', requireAuth, async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });

  const { data: existing, error: findError } = await supabase
    .from('Testimonial').select('user_id').eq('testimonial_id', req.params.id).single();
  if (findError || !existing) return res.status(404).json({ error: 'Testimonial not found' });
  if (existing.user_id !== req.user.user_id) return res.status(403).json({ error: 'This is not your post' });

  const { data, error } = await supabase
    .from('Testimonial')
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq('testimonial_id', req.params.id)
    .select('*, User(name)');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// Owner can delete their own post; an admin can delete ANY post (the
// "Remove Content" moderation action) regardless of who wrote it.
app.delete('/testimonials/:id', requireAuth, async (req, res) => {
  const { data: existing, error: findError } = await supabase
    .from('Testimonial').select('user_id').eq('testimonial_id', req.params.id).single();
  if (findError || !existing) return res.status(404).json({ error: 'Testimonial not found' });
  if (existing.user_id !== req.user.user_id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'This is not your post' });
  }

  const { error } = await supabase.from('Testimonial').delete().eq('testimonial_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: true });
});

// POST /testimonials/:id/report — any signed-in user flags a post for admin
// review. body: { reason } optional. Re-reporting an already-flagged post
// just updates the reason rather than erroring.
app.post('/testimonials/:id/report', requireAuth, async (req, res) => {
  const { reason } = req.body;

  const { data: existing, error: findError } = await supabase
    .from('Testimonial').select('testimonial_id').eq('testimonial_id', req.params.id).single();
  if (findError || !existing) return res.status(404).json({ error: 'Testimonial not found' });

  const { data, error } = await supabase
    .from('Testimonial')
    .update({ flagged: true, flag_reason: reason || null })
    .eq('testimonial_id', req.params.id)
    .select('*, User(name)');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// GET /admin/testimonials?flagged=true — "Review Flagged Content". Omit the
// query param for every post (useful for a general moderation sweep).
app.get('/admin/testimonials', requireAuth, requireRole('admin'), async (req, res) => {
  let query = supabase.from('Testimonial').select('*, User(name)').order('created_at', { ascending: false });
  if (req.query.flagged === 'true') query = query.eq('flagged', true);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /admin/testimonials/:id/keep — "Keep Content": clears the flag,
// leaves the post itself untouched.
app.post('/admin/testimonials/:id/keep', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('Testimonial')
    .update({ flagged: false, flag_reason: null })
    .eq('testimonial_id', req.params.id)
    .select('*, User(name)');

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'Testimonial not found' });
  res.json(data[0]);
});

app.get('/testimonials/:id/comments', async (req, res) => {
  const { data, error } = await supabase
    .from('Testimonial_Comment')
    .select('*, User(name)')
    .eq('testimonial_id', req.params.id)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/testimonials/:id/comments', requireAuth, requireRole('resident'), async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });

  const { data, error } = await supabase
    .from('Testimonial_Comment')
    .insert([{ testimonial_id: req.params.id, user_id: req.user.user_id, body: body.trim() }])
    .select('*, User(name)');

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.patch('/testimonials/:id/comments/:commentId', requireAuth, async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });

  const { data: existing, error: findError } = await supabase
    .from('Testimonial_Comment').select('user_id').eq('comment_id', req.params.commentId).single();
  if (findError || !existing) return res.status(404).json({ error: 'Comment not found' });
  if (existing.user_id !== req.user.user_id) return res.status(403).json({ error: 'This is not your comment' });

  const { data, error } = await supabase
    .from('Testimonial_Comment')
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq('comment_id', req.params.commentId)
    .select('*, User(name)');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.delete('/testimonials/:id/comments/:commentId', requireAuth, async (req, res) => {
  const { data: existing, error: findError } = await supabase
    .from('Testimonial_Comment').select('user_id').eq('comment_id', req.params.commentId).single();
  if (findError || !existing) return res.status(404).json({ error: 'Comment not found' });
  if (existing.user_id !== req.user.user_id) return res.status(403).json({ error: 'This is not your comment' });

  const { error } = await supabase.from('Testimonial_Comment').delete().eq('comment_id', req.params.commentId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: true });
});

// GET /notifications — merges real stored rows (message alerts, system announcements)
// with session reminders computed live from upcoming confirmed bookings. Reminders are
// deliberately not stored: there's no background scheduler in this app, so computing
// them at read time from real Booking rows is the only way they're guaranteed correct.
app.get('/notifications', requireAuth, async (req, res) => {
  const { data: stored, error } = await supabase
    .from('Notification')
    .select('*')
    .eq('user_id', req.user.user_id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });

  let reminders = [];
  if (req.user.role === 'resident' || req.user.role === 'psychologist') {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    let bookingQuery = supabase
      .from('Booking')
      .select('booking_id, schedule, Psychologist(User(name)), User(name)')
      .eq('status', 'confirmed')
      .gte('schedule', now.toISOString())
      .lte('schedule', in24h.toISOString());

    if (req.user.role === 'resident') {
      bookingQuery = bookingQuery.eq('resident_id', req.user.user_id);
    } else {
      const { data: psychologist } = await supabase
        .from('Psychologist')
        .select('psychologist_id')
        .eq('user_id', req.user.user_id)
        .single();
      bookingQuery = psychologist ? bookingQuery.eq('psychologist_id', psychologist.psychologist_id) : null;
    }

    if (bookingQuery) {
      const { data: upcoming } = await bookingQuery;
      reminders = (upcoming || []).map((b) => ({
        notification_id: `reminder-${b.booking_id}`,
        type: 'reminder',
        title: 'Upcoming session',
        body: `Your session is at ${new Date(b.schedule).toLocaleString()}`,
        link: req.user.role === 'resident' ? `/session/${b.booking_id}` : `/session/${b.booking_id}`,
        read: false,
        created_at: b.schedule,
      }));
    }
  }

  const combined = [...reminders, ...stored].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(combined);
});

// POST /notifications/:id/read — only for real stored notifications; a synthetic
// "reminder-<id>" id from the computed list has nothing to mark, so this only
// ever receives a real numeric notification_id from the frontend.
app.post('/notifications/:id/read', requireAuth, async (req, res) => {
  const { data: existing, error: findError } = await supabase
    .from('Notification').select('user_id').eq('notification_id', req.params.id).single();
  if (findError || !existing) return res.status(404).json({ error: 'Notification not found' });
  if (existing.user_id !== req.user.user_id) return res.status(403).json({ error: 'This is not your notification' });

  const { error } = await supabase.from('Notification').update({ read: true }).eq('notification_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ read: true });
});

// POST /admin/announcements — body: { title, body }. Fans out a Notification row
// (type: 'system') to every user so System Updates has a real way to get content,
// same judgment call as seeding Wellness Resources: without this the feature would
// be permanently empty.
app.post('/admin/announcements', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' });

  const { data: announcement, error: annError } = await supabase
    .from('System_Announcement')
    .insert([{ title, body, created_by: req.user.user_id }])
    .select();

  if (annError) return res.status(500).json({ error: annError.message });

  const { data: users, error: usersError } = await supabase.from('User').select('user_id');
  if (usersError) return res.status(500).json({ error: usersError.message });

  if (users.length > 0) {
    const notifRows = users.map((u) => ({ user_id: u.user_id, type: 'system', title, body, link: null, read: false }));
    const { error: notifError } = await supabase.from('Notification').insert(notifRows);
    if (notifError) return res.status(500).json({ error: notifError.message });
  }

  res.status(201).json(announcement[0]);
});

// GET /platform-status — public, used to decide whether to show the
// maintenance banner. Deliberately tiny and unauthenticated: every page
// needs this before anyone has logged in.
app.get('/platform-status', async (req, res) => {
  const { data, error } = await supabase.from('Platform_Setting').select('key, value');
  if (error) return res.status(500).json({ error: error.message });
  const byKey = Object.fromEntries(data.map((s) => [s.key, s.value]));
  res.json({
    maintenance_mode: byKey.maintenance_mode === 'true',
    platform_name: byKey.platform_name || 'OpenUp',
  });
});

// System Settings / "Manage Configurations" -- a generic key-value store.
app.get('/admin/settings', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase.from('Platform_Setting').select('*').order('key', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.patch('/admin/settings/:key', requireAuth, requireRole('admin'), async (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'value is required' });

  const { data, error } = await supabase
    .from('Platform_Setting')
    .update({ value: String(value), updated_at: new Date().toISOString() })
    .eq('key', req.params.key)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'Setting not found' });
  res.json(data[0]);
});

// System Settings / "Backup & Maintenance" -- a real export of platform-wide
// AGGREGATE counts (never raw resident records) for the admin's own
// record-keeping. Not a substitute for Supabase's own infrastructure-level
// backups, which this app doesn't control and shouldn't claim to replace.
app.get('/admin/backup-snapshot', requireAuth, requireRole('admin'), async (req, res) => {
  const [users, bookings, payments, barangays, resources] = await Promise.all([
    supabase.from('User').select('role', { count: 'exact', head: true }),
    supabase.from('Booking').select('status', { count: 'exact', head: true }),
    supabase.from('Payment').select('amount, platform_fee, psychologist_payout, status'),
    supabase.from('Barangay').select('barangay_id', { count: 'exact', head: true }),
    supabase.from('Resource').select('resource_id', { count: 'exact', head: true }),
  ]);

  const paidPayments = (payments.data || []).filter((p) => p.status === 'paid');

  res.json({
    generated_at: new Date().toISOString(),
    total_users: users.count || 0,
    total_bookings: bookings.count || 0,
    total_barangays: barangays.count || 0,
    total_resources: resources.count || 0,
    payments_collected: paidPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0),
    platform_fees_collected: paidPayments.reduce((sum, p) => sum + Number(p.platform_fee || 0), 0),
  });
});

// GET /psychologists/me — the logged-in psychologist's own profile, regardless of
// verification status (the public /psychologists list above only shows is_verified=true,
// which is exactly the status a psychologist waiting on approval needs to see).
app.get('/psychologists/me', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data, error } = await supabase
    .from('Psychologist')
    .select('*')
    .eq('user_id', req.user.user_id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'No psychologist profile found for this account' });
  const { data: account } = await supabase.from('User').select('name, email').eq('user_id', req.user.user_id).maybeSingle();
  res.json({
    ...data,
    name: account?.name || null,
    email: account?.email || null,
    profile_photo_url: data.profile_photo_url
      ? supabase.storage.from('psychologist-photos').getPublicUrl(data.profile_photo_url).data.publicUrl
      : null,
  });
});

// PATCH /psychologists/me — ordinary, self-editable profile fields. None of
// these affect verification, so a verified psychologist keeps their status.
// Regulated fields (license_no, license_expiry, credentials) go through
// PATCH /psychologists/me/credentials + a reviewed submission instead, and
// is_verified / is_available stay admin-controlled. The full name is tied to
// the PRC license, so it can only be changed before verification.
const CONSULTATION_TYPES = ['online', 'face_to_face'];
const SESSION_DURATIONS = [30, 45, 60, 90, 120];

function cleanList(value, max = 20, maxLen = 60) {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.map((v) => String(v).trim()).filter(Boolean))].slice(0, max).map((v) => v.slice(0, maxLen));
}

app.patch('/psychologists/me', requireAuth, requireRole('psychologist'), async (req, res) => {
  const b = req.body || {};
  const updates = {};

  for (const key of ['specialties', 'languages', 'expertise', 'services']) {
    if (b[key] !== undefined) {
      const list = cleanList(b[key]);
      if (!list) return res.status(400).json({ error: `${key} must be a list` });
      updates[key] = list;
    }
  }
  for (const [key, max] of [['bio', 600], ['availability', 120], ['professional_title', 100], ['education', 1000], ['contact_number', 30]]) {
    if (b[key] !== undefined) {
      const v = b[key] === null ? '' : String(b[key]).trim();
      if (v.length > max) return res.status(400).json({ error: `${key.replace('_', ' ')} must be ${max} characters or fewer` });
      updates[key] = v === '' ? null : v;
    }
  }
  if (updates.contact_number && !/^[0-9+()-s]{7,30}$/.test(updates.contact_number)) {
    return res.status(400).json({ error: 'Enter a valid contact number' });
  }
  if (b.consultation_types !== undefined) {
    const list = cleanList(b.consultation_types, 2);
    if (!list || list.some((t) => !CONSULTATION_TYPES.includes(t))) {
      return res.status(400).json({ error: 'consultation_types can only include online and face_to_face' });
    }
    updates.consultation_types = list;
  }
  if (b.session_duration_minutes !== undefined) {
    if (b.session_duration_minutes === '' || b.session_duration_minutes === null) updates.session_duration_minutes = null;
    else {
      const d = Number(b.session_duration_minutes);
      if (!SESSION_DURATIONS.includes(d)) return res.status(400).json({ error: `Session duration must be one of ${SESSION_DURATIONS.join(', ')} minutes` });
      updates.session_duration_minutes = d;
    }
  }
  if (b.years_experience !== undefined) {
    if (b.years_experience === '' || b.years_experience === null) updates.years_experience = null;
    else {
      const y = Number(b.years_experience);
      if (!Number.isInteger(y) || y < 0 || y > 70) return res.status(400).json({ error: 'Years of experience must be a whole number from 0 to 70' });
      updates.years_experience = y;
    }
  }
  if (b.session_price !== undefined) {
    const price = Number(b.session_price);
    if (!price || price <= 0) return res.status(400).json({ error: 'session_price must be a positive number' });
    updates.session_price = price;
  }

  let newName;
  if (b.name !== undefined) {
    newName = String(b.name).trim();
    if (newName.length < 2 || newName.length > 100) return res.status(400).json({ error: 'Full name must be 2-100 characters' });
  }

  if (Object.keys(updates).length === 0 && newName === undefined) return res.status(400).json({ error: 'Nothing to update' });

  const { data: current, error: findError } = await supabase
    .from('Psychologist').select('psychologist_id, is_verified').eq('user_id', req.user.user_id).maybeSingle();
  if (findError) return res.status(500).json({ error: findError.message });
  if (!current) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  if (newName !== undefined) {
    const { data: user } = await supabase.from('User').select('name').eq('user_id', req.user.user_id).single();
    if (user && user.name !== newName) {
      if (current.is_verified) {
        return res.status(403).json({ error: 'Your name is tied to your verified PRC license. Contact an admin to change it.' });
      }
      const { error: nameError } = await supabase.from('User').update({ name: newName }).eq('user_id', req.user.user_id);
      if (nameError) return res.status(500).json({ error: nameError.message });
    }
  }

  let row = null;
  if (Object.keys(updates).length) {
    const { data, error } = await supabase
      .from('Psychologist').update(updates).eq('user_id', req.user.user_id).select();
    if (error) {
      const msg = /professional_title|education|contact_number|expertise|services|consultation_types|session_duration/i.test(error.message)
        ? 'The profile migration has not been run yet (db/psychologist_verification.sql).' : error.message;
      return res.status(500).json({ error: msg });
    }
    row = data[0];
  } else {
    const { data } = await supabase.from('Psychologist').select('*').eq('user_id', req.user.user_id).single();
    row = data;
  }

  res.json({
    ...row,
    name: newName,
    profile_photo_url: row.profile_photo_url
      ? supabase.storage.from('psychologist-photos').getPublicUrl(row.profile_photo_url).data.publicUrl
      : null,
  });
});

const uploadPhoto = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// POST /psychologists/me/photo — multipart: photo. Replaces any existing photo
// (old file removed from storage, best-effort -- a cleanup failure shouldn't
// block the new photo from being saved). Stored in the same public
// psychologist-photos bucket the directory/booking pages already resolve
// profile_photo_url against.
app.post('/psychologists/me/photo', requireAuth, requireRole('psychologist'), uploadPhoto.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A photo file is required' });
  if (!req.file.mimetype.startsWith('image/')) {
    return res.status(400).json({ error: 'File must be an image' });
  }

  const { data: existing } = await supabase
    .from('Psychologist')
    .select('profile_photo_url')
    .eq('user_id', req.user.user_id)
    .single();

  const ext = (req.file.originalname.match(/\.[a-zA-Z0-9]+$/)?.[0] || '.jpg').toLowerCase();
  const filePath = `${req.user.user_id}/${Date.now()}${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('psychologist-photos')
    .upload(filePath, req.file.buffer, { contentType: req.file.mimetype });
  if (uploadError) return res.status(500).json({ error: uploadError.message });

  const { data, error } = await supabase
    .from('Psychologist')
    .update({ profile_photo_url: filePath })
    .eq('user_id', req.user.user_id)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  if (existing?.profile_photo_url) {
    try {
      await supabase.storage.from('psychologist-photos').remove([existing.profile_photo_url]);
    } catch {
      // best-effort -- the new photo is already saved either way
    }
  }

  res.json({
    ...data[0],
    profile_photo_url: supabase.storage.from('psychologist-photos').getPublicUrl(filePath).data.publicUrl,
  });
});

// DELETE /psychologists/me/photo — removes the photo and reverts to the
// initials avatar used everywhere a psychologist is shown.
app.delete('/psychologists/me/photo', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data: existing } = await supabase
    .from('Psychologist')
    .select('profile_photo_url')
    .eq('user_id', req.user.user_id)
    .single();

  const { error } = await supabase
    .from('Psychologist')
    .update({ profile_photo_url: null })
    .eq('user_id', req.user.user_id);
  if (error) return res.status(500).json({ error: error.message });

  if (existing?.profile_photo_url) {
    try {
      await supabase.storage.from('psychologist-photos').remove([existing.profile_photo_url]);
    } catch {
      // best-effort
    }
  }

  res.json({ removed: true });
});

// Weekly recurring availability windows. Distinct from Psychologist.availability
// (a free-text display string on the profile) -- this table is the real,
// structured schedule that actually drives which slots a resident can book.
async function getOwnPsychologistId(userId) {
  const { data } = await supabase.from('Psychologist').select('psychologist_id').eq('user_id', userId).single();
  return data?.psychologist_id || null;
}

async function getOwnBarangayId(userId) {
  const { data } = await supabase.from('User').select('barangay_id').eq('user_id', userId).single();
  return data?.barangay_id || null;
}

// Shared by both the admin "assign"/"renew" actions and the barangay's own
// "Subscribe Now" -- puts a barangay on a plan (snapshotting its terms onto the
// Subscription row so later catalog edits never rewrite what that barangay is
// shown as being on) and logs it to Subscription_History. A renewal extends from
// whichever is later: now, or the current expiry, so renewing early never wastes
// time left on the existing term.
async function applySubscriptionPlan(barangayId, planId, actorRole, { isRenewal = false } = {}) {
  const { data: plan, error: planError } = await supabase
    .from('Subscription_Plan')
    .select('*')
    .eq('plan_id', planId)
    .eq('is_active', true)
    .single();
  if (planError || !plan) throw new Error('PLAN_NOT_FOUND');

  const { data: existing } = await supabase
    .from('Subscription')
    .select('*')
    .eq('barangay_id', barangayId)
    .maybeSingle();

  const now = new Date();
  const renewBase = isRenewal && existing?.expires_at && new Date(existing.expires_at) > now
    ? new Date(existing.expires_at)
    : now;
  const expiresAt = new Date(renewBase);
  expiresAt.setMonth(expiresAt.getMonth() + plan.validity_months);

  const row = {
    barangay_id: barangayId,
    plan_id: plan.plan_id,
    plan_name: plan.name,
    plan: plan.name,
    price: plan.price,
    care_credits: plan.care_credits,
    validity_months: plan.validity_months,
    status: 'active',
    started_at: isRenewal && existing?.started_at ? existing.started_at : now.toISOString(),
    expires_at: expiresAt.toISOString(),
    renewed_at: now.toISOString(),
  };

  const { data, error } = await supabase
    .from('Subscription')
    .upsert([row], { onConflict: 'barangay_id' })
    .select();
  if (error) throw error;

  await supabase.from('Subscription_History').insert([{
    barangay_id: barangayId,
    plan_id: plan.plan_id,
    plan_name: plan.name,
    action: isRenewal ? 'renewed' : (existing ? 'plan_changed' : 'subscribed'),
    status: 'active',
    price: plan.price,
    actor_role: actorRole,
  }]);

  return data[0];
}

// A barangay may not have an LGU account provisioned yet -- callers that
// notify one must handle null and simply skip, not fail the real action
// (an assessment, an escalation, a subscription change) that triggered it.
async function getLguUserIdForBarangay(barangayId) {
  if (!barangayId) return null;
  const { data } = await supabase
    .from('User')
    .select('user_id')
    .eq('role', 'lgu')
    .eq('barangay_id', barangayId)
    .maybeSingle();
  return data?.user_id || null;
}

// Same masking scheme the Dashboard's frontend already uses for its
// today's-sessions table -- kept here too for the Reports endpoint, which is
// a bulk/exportable view rather than a specific-client lookup (My Clients
// already shows real names for that).
function anonymizeResidentId(residentId) {
  return `Anonymous #${1000 + Number(residentId)}`;
}

app.get('/psychologists/me/availability', requireAuth, requireRole('psychologist'), async (req, res) => {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data, error } = await supabase
    .from('Psychologist_Availability')
    .select('*')
    .eq('psychologist_id', psychologistId)
    .order('day_of_week', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/psychologists/me/availability', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { day_of_week, start_time, end_time } = req.body;

  if (day_of_week === undefined || day_of_week === null || !start_time || !end_time) {
    return res.status(400).json({ error: 'day_of_week, start_time, and end_time are required' });
  }
  if (day_of_week < 0 || day_of_week > 6) return res.status(400).json({ error: 'day_of_week must be 0-6' });
  if (start_time >= end_time) return res.status(400).json({ error: 'start_time must be before end_time' });

  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data, error } = await supabase
    .from('Psychologist_Availability')
    .insert([{ psychologist_id: psychologistId, day_of_week, start_time, end_time }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.delete('/psychologists/me/availability/:id', requireAuth, requireRole('psychologist'), async (req, res) => {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data: existing, error: findError } = await supabase
    .from('Psychologist_Availability')
    .select('psychologist_id')
    .eq('availability_id', req.params.id)
    .single();

  if (findError || !existing) return res.status(404).json({ error: 'Availability window not found' });
  if (existing.psychologist_id !== psychologistId) return res.status(403).json({ error: 'This is not your availability window' });

  const { error } = await supabase.from('Psychologist_Availability').delete().eq('availability_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: true });
});

// Date-specific overrides on top of the weekly pattern above -- a psychologist
// picks an actual calendar date (not just a weekday) to add one-off hours or
// mark a day off. Any override row for a date makes the weekly pattern for
// that date irrelevant (see db/psychologist_date_overrides.sql).
app.get('/psychologists/me/date-overrides', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { month } = req.query;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month must be in YYYY-MM format' });
  }
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const [year, monthNum] = month.split('-').map(Number);
  const lastDay = String(new Date(Date.UTC(year, monthNum, 0)).getUTCDate()).padStart(2, '0');

  const { data, error } = await supabase
    .from('Psychologist_Date_Override')
    .select('*')
    .eq('psychologist_id', psychologistId)
    .gte('date', `${month}-01`)
    .lte('date', `${month}-${lastDay}`)
    .order('date', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/psychologists/me/date-overrides', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { date, start_time, end_time } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !start_time || !end_time) {
    return res.status(400).json({ error: 'date, start_time, and end_time are required' });
  }
  if (start_time >= end_time) return res.status(400).json({ error: 'start_time must be before end_time' });

  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  // A date marked closed can't also gain a window -- clear the closed marker first.
  await supabase
    .from('Psychologist_Date_Override')
    .delete()
    .eq('psychologist_id', psychologistId)
    .eq('date', date)
    .eq('is_closed', true);

  const { data, error } = await supabase
    .from('Psychologist_Date_Override')
    .insert([{ psychologist_id: psychologistId, date, start_time, end_time, is_closed: false }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.post('/psychologists/me/date-overrides/close', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { date } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date is required' });
  }

  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  // Closed replaces any custom windows already set for that date.
  await supabase.from('Psychologist_Date_Override').delete().eq('psychologist_id', psychologistId).eq('date', date);

  const { data, error } = await supabase
    .from('Psychologist_Date_Override')
    .insert([{ psychologist_id: psychologistId, date, is_closed: true }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.delete('/psychologists/me/date-overrides/:id', requireAuth, requireRole('psychologist'), async (req, res) => {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data: existing, error: findError } = await supabase
    .from('Psychologist_Date_Override')
    .select('psychologist_id')
    .eq('override_id', req.params.id)
    .single();

  if (findError || !existing) return res.status(404).json({ error: 'Override not found' });
  if (existing.psychologist_id !== psychologistId) return res.status(403).json({ error: 'This is not your override' });

  const { error } = await supabase.from('Psychologist_Date_Override').delete().eq('override_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: true });
});

// Clears every override for one date at once, i.e. "reset this date back to my weekly default".
app.delete('/psychologists/me/date-overrides', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date is required' });
  }

  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { error } = await supabase
    .from('Psychologist_Date_Override')
    .delete()
    .eq('psychologist_id', psychologistId)
    .eq('date', date);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: true });
});

// Availability windows are defined in Philippines local time (Asia/Manila, UTC+8)
// by convention -- the app has no users outside that timezone, and Booking.schedule
// is stored as a real UTC instant, so an explicit +08:00 offset here is what
// correctly converts one to the other in both directions.
function phLocalInstant(dateStr, hour) {
  return new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00+08:00`);
}

// GET /psychologists/:id/availability?month=YYYY-MM — for the resident's booking
// calendar: which dates have any free slot, and exactly which hour slots are free,
// after subtracting existing (non-cancelled/declined) bookings and past times.
app.get('/psychologists/:id/availability', async (req, res) => {
  const { month } = req.query;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month must be in YYYY-MM format' });
  }

  const { data: windows, error: windowsError } = await supabase
    .from('Psychologist_Availability')
    .select('day_of_week, start_time, end_time')
    .eq('psychologist_id', req.params.id);

  if (windowsError) return res.status(500).json({ error: windowsError.message });

  const [year, monthNum] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const lastDay = String(daysInMonth).padStart(2, '0');

  const { data: overrides, error: overridesError } = await supabase
    .from('Psychologist_Date_Override')
    .select('date, is_closed, start_time, end_time')
    .eq('psychologist_id', req.params.id)
    .gte('date', `${month}-01`)
    .lte('date', `${month}-${lastDay}`);

  if (overridesError) return res.status(500).json({ error: overridesError.message });

  const { data: bookings, error: bookingsError } = await supabase
    .from('Booking')
    .select('schedule')
    .eq('psychologist_id', req.params.id)
    .not('status', 'in', '(cancelled,declined)')
    .gte('schedule', phLocalInstant(`${month}-01`, 0).toISOString())
    .lte('schedule', phLocalInstant(`${month}-${lastDay}`, 23).toISOString());

  if (bookingsError) return res.status(500).json({ error: bookingsError.message });

  const takenInstants = new Set(bookings.map((b) => new Date(b.schedule).getTime()));

  const windowsByDay = {};
  for (const w of windows) {
    (windowsByDay[w.day_of_week] ||= []).push(w);
  }

  const overridesByDate = {};
  for (const o of overrides) {
    (overridesByDate[o.date] ||= []).push(o);
  }

  const now = new Date();
  const result = {};

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${month}-${String(day).padStart(2, '0')}`;
    const dateOverrides = overridesByDate[dateStr];

    // A date with any override row ignores the weekly pattern entirely --
    // either it's a day off (is_closed), or its own custom window list.
    let dayWindows;
    if (dateOverrides) {
      dayWindows = dateOverrides[0].is_closed ? [] : dateOverrides;
    } else {
      const dow = phLocalInstant(dateStr, 12).getUTCDay(); // midday sidesteps any offset edge case
      dayWindows = windowsByDay[dow] || [];
    }

    const slotSet = new Set();
    const allSlotSet = new Set();
    for (const w of dayWindows) {
      const startH = Number(w.start_time.split(':')[0]);
      const endH = Number(w.end_time.split(':')[0]);
      for (let h = startH; h < endH; h++) {
        const label = `${String(h).padStart(2, '0')}:00`;
        allSlotSet.add(label);
        const instant = phLocalInstant(dateStr, h);
        if (instant > now && !takenInstants.has(instant.getTime())) {
          slotSet.add(label);
        }
      }
    }

    const slots = [...slotSet].sort();
    const allSlots = [...allSlotSet].sort();
    // all_slots is every hour in the window whether or not it's actually
    // bookable, so the resident calendar can show taken/past hours in red
    // instead of just omitting them -- slots (the free subset) is unchanged
    // for anything already relying on it.
    result[dateStr] = { available: slots.length > 0, slots, all_slots: allSlots, customized: !!dateOverrides };
  }

  res.json(result);
});

// A resident only counts as this psychologist's client once they've actually
// had a booking together that wasn't cancelled/declined -- matches the same
// "qualifying booking" filter used for slot-taken checks above.
async function getClientResidentIds(psychologistId) {
  // "Client" means the psychologist has actually accepted a request from them --
  // a still-pending request (or one that was cancelled/declined) doesn't count yet.
  const { data, error } = await supabase
    .from('Booking')
    .select('resident_id')
    .eq('psychologist_id', psychologistId)
    .eq('status', 'confirmed');
  if (error) return { error };
  return { ids: [...new Set((data || []).map((b) => b.resident_id))] };
}

// GET /psychologists/me/clients — roster for the "My Clients" page: every
// resident who has (or had) a real booking with this psychologist, so they can
// review wellness check-ins before a session.
app.get('/psychologists/me/clients', requireAuth, requireRole('psychologist'), async (req, res) => {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { ids: residentIds, error: idsError } = await getClientResidentIds(psychologistId);
  if (idsError) return res.status(500).json({ error: idsError.message });
  if (residentIds.length === 0) return res.json([]);

  const { data: bookings, error: bookingsError } = await supabase
    .from('Booking')
    .select('resident_id, schedule, status')
    .eq('psychologist_id', psychologistId)
    .in('resident_id', residentIds)
    .order('schedule', { ascending: false });
  if (bookingsError) return res.status(500).json({ error: bookingsError.message });

  const { data: users, error: usersError } = await supabase
    .from('User')
    .select('user_id, name, email')
    .in('user_id', residentIds);
  if (usersError) return res.status(500).json({ error: usersError.message });

  const now = new Date();
  const clients = users.map((u) => {
    const theirBookings = bookings.filter((b) => b.resident_id === u.user_id);
    // "Active" means they have a real upcoming session -- not just any
    // history -- so it reflects who actually needs attention right now.
    const hasUpcoming = theirBookings.some(
      (b) => new Date(b.schedule) >= now && b.status !== 'cancelled' && b.status !== 'declined'
    );
    return {
      user_id: u.user_id,
      name: u.name,
      email: u.email,
      total_sessions: theirBookings.length,
      last_session: theirBookings[0]?.schedule || null,
      is_active: hasUpcoming,
    };
  });

  clients.sort((a, b) => new Date(b.last_session || 0) - new Date(a.last_session || 0));
  res.json(clients);
});

// GET /psychologists/me/clients/:residentId/wellness — mood + wellness-check
// history for one client, gated on that resident actually being this
// psychologist's client (see getClientResidentIds above).
app.get('/psychologists/me/clients/:residentId/wellness', requireAuth, requireRole('psychologist'), async (req, res) => {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const residentId = Number(req.params.residentId);
  const { ids: residentIds, error: idsError } = await getClientResidentIds(psychologistId);
  if (idsError) return res.status(500).json({ error: idsError.message });
  if (!residentIds.includes(residentId)) {
    return res.status(403).json({ error: 'This resident is not one of your clients' });
  }

  const { data: moodEntries, error: moodError } = await supabase
    .from('Mood_Entry')
    .select('mood_level, mood_label, entry_date')
    .eq('user_id', residentId)
    .order('entry_date', { ascending: false })
    .limit(30);
  if (moodError) return res.status(500).json({ error: moodError.message });

  const { data: assessments, error: assessmentError } = await supabase
    .from('Assessment_Result')
    .select('*')
    .eq('user_id', residentId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (assessmentError) return res.status(500).json({ error: assessmentError.message });

  // Session history: this client's bookings specifically with this
  // psychologist -- the "View Session History" half of Client Management.
  const { data: sessions, error: sessionsError } = await supabase
    .from('Booking')
    .select('booking_id, schedule, status')
    .eq('resident_id', residentId)
    .eq('psychologist_id', psychologistId)
    .order('schedule', { ascending: false });
  if (sessionsError) return res.status(500).json({ error: sessionsError.message });

  const { data: residentUser, error: residentError } = await supabase
    .from('User')
    .select('user_id, name')
    .eq('user_id', residentId)
    .single();
  if (residentError || !residentUser) return res.status(404).json({ error: 'Resident not found' });

  const now = new Date();
  const hasUpcoming = sessions.some(
    (s) => new Date(s.schedule) >= now && s.status !== 'cancelled' && s.status !== 'declined'
  );

  res.json({
    client: {
      user_id: residentUser.user_id,
      name: residentUser.name,
      total_sessions: sessions.length,
      last_session: sessions[0]?.schedule || null,
      is_active: hasUpcoming,
    },
    mood_entries: moodEntries,
    assessments,
    sessions,
  });
});

// ---------------------------------------------------------------------------
// Psychologist credentials & license verification (Psychologist > Profile and
// Admin > Verification). See db/psychologist_verification.sql.
//
// Psychologist.is_verified stays the single gate every verified-only feature
// checks. verification_status is the state of the LATEST credential
// submission. Regulated credentials (license number / expiry / credentials and
// every credential document) only ever change through a submission an admin
// reviews:
//   - edits go to pending_credentials, uploads start as 'draft' documents;
//   - "Submit for verification" snapshots them into
//     Psychologist_Credential_Submission and moves the status to pending;
//   - for an ALREADY verified psychologist the approved values stay live (and
//     is_verified stays true) until an admin approves the update -- denying it
//     keeps the old approval unless the admin explicitly revokes it.
// Every admin decision needs confirm:true, is conditional on the current
// status (so double-clicks / two admins can't race), is logged, and notifies
// the psychologist through the existing Notification table.
// ---------------------------------------------------------------------------
const VERIFICATION_STATUSES = ['not_submitted', 'pending', 'info_requested', 'approved', 'denied'];
const DOCUMENT_TYPES = ['prc_id_front', 'prc_id_back', 'certificate_of_registration', 'diploma', 'certificate', 'other'];
const PRC_ID_TYPES = ['prc_id_front', 'prc_license']; // prc_license = legacy uploads
const MIN_REASON_LENGTH = 10;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_ACTIVE_DOCUMENTS = 20;
const LICENSE_NO_RE = /^[A-Za-z0-9-]{4,20}$/;

const uploadDocument = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } });

// Type is decided by the file's actual bytes, not by the client-supplied
// mimetype or extension (both trivially spoofed), and the extension must agree.
function sniffDocumentType(buffer, originalName) {
  const ext = (String(originalName).match(/\.([a-zA-Z0-9]+)$/)?.[1] || '').toLowerCase();
  if (!buffer || buffer.length < 8) return null;
  if (buffer.slice(0, 5).toString('latin1') === '%PDF-') return ext === 'pdf' ? { mime: 'application/pdf', ext: 'pdf' } : null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ['jpg', 'jpeg'].includes(ext) ? { mime: 'image/jpeg', ext: 'jpg' } : null;
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ext === 'png' ? { mime: 'image/png', ext: 'png' } : null;
  return null;
}

// multer's own errors (file too large, etc.) as JSON instead of an HTML 500.
function handleDocumentUpload(req, res, next) {
  uploadDocument.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Files must be 10 MB or smaller.' });
    return res.status(400).json({ error: err.message || 'Upload failed.' });
  });
}

function verificationMigrationError(error) {
  return /verification_status|pending_credentials|professional_title|Psychologist_Document|Psychologist_Verification_Event|Psychologist_Credential_Submission|license_expiry/i.test(error?.message || '')
    ? 'The verification migration has not been run yet (db/psychologist_verification.sql).'
    : error?.message;
}

// Back-compat for rows read before the migration ran: derive from is_verified.
function verificationStatusOf(p) {
  if (p.verification_status) return p.verification_status;
  return p.is_verified ? 'approved' : 'pending';
}

async function logVerificationEvent(psychologistId, action, note, actorUserId) {
  const { error } = await supabase.from('Psychologist_Verification_Event').insert([{
    psychologist_id: psychologistId,
    action,
    note: note || null,
    actor_user_id: actorUserId || null,
  }]);
  if (error) console.error('[verification] could not log event:', error.message);
}

async function notifyUser(userId, title, body, link) {
  const { error } = await supabase.from('Notification').insert([{
    user_id: userId, type: 'system', title, body, link: link || null, read: false,
  }]);
  if (error) console.error('[verification] could not notify:', error.message);
}

async function notifyAdmins(title, body) {
  const { data: admins } = await supabase.from('User').select('user_id').eq('role', 'admin');
  if (!admins?.length) return;
  const { error } = await supabase.from('Notification').insert(admins.map((a) => ({
    user_id: a.user_id, type: 'system', title, body, link: '/admin/verification', read: false,
  })));
  if (error) console.error('[verification] could not notify admins:', error.message);
}

async function signDocuments(documents) {
  return Promise.all((documents || []).map(async (d) => {
    const { data } = await supabase.storage.from('psychologist-documents').createSignedUrl(d.file_path, 600);
    return {
      document_id: d.document_id,
      doc_type: d.doc_type,
      file_name: d.file_name,
      mime_type: d.mime_type,
      size_bytes: d.size_bytes,
      uploaded_at: d.uploaded_at,
      status: d.status || 'submitted',
      replaces_document_id: d.replaces_document_id || null,
      submission_id: d.submission_id || null,
      url: data?.signedUrl || null,
    };
  }));
}

function photoUrlOf(path) {
  return path ? supabase.storage.from('psychologist-photos').getPublicUrl(path).data.publicUrl : null;
}

function approvedCredentialsOf(p) {
  return { license_no: p.license_no || null, license_expiry: p.license_expiry || null, credentials: p.credentials || null };
}

// What the psychologist is currently proposing (pending edits over approved values).
function effectiveCredentialsOf(p) {
  return { ...approvedCredentialsOf(p), ...(p.pending_credentials || {}) };
}

function sameCredentials(a, b) {
  return (a.license_no || null) === (b.license_no || null)
    && (a.license_expiry || null) === (b.license_expiry || null)
    && (a.credentials || null) === (b.credentials || null);
}

// "Active" documents = the current set (not replaced, not rejected).
function activeDocuments(docs) {
  return (docs || []).filter((d) => !['superseded', 'rejected'].includes(d.status));
}

function submissionRequirements(p, docs) {
  const eff = effectiveCredentialsOf(p);
  const active = activeDocuments(docs);
  const missing = [];
  if (!eff.license_no) missing.push('PRC license number');
  if (!active.some((d) => PRC_ID_TYPES.includes(d.doc_type))) missing.push('PRC ID (front)');
  return missing;
}

function hasUnsubmittedChanges(p, docs) {
  return (docs || []).some((d) => d.status === 'draft')
    || (p.pending_credentials && !sameCredentials(effectiveCredentialsOf(p), approvedCredentialsOf(p)));
}

// "Under review" = an admin has an open pending submission to look at.
// Applications that predate submissions (status pending, no rows) are NOT
// locked, so those psychologists can still add documents and submit.
async function isUnderReview(p) {
  if (verificationStatusOf(p) !== 'pending') return false;
  const { count } = await supabase
    .from('Psychologist_Credential_Submission')
    .select('submission_id', { count: 'exact', head: true })
    .eq('psychologist_id', p.psychologist_id)
    .eq('status', 'pending');
  return (count || 0) > 0;
}

async function loadOwnPsychologist(userId) {
  return supabase.from('Psychologist').select('*').eq('user_id', userId).maybeSingle();
}

// GET /admin/psychologists?status=not_submitted|pending|info_requested|approved|denied|verified|all
// (default: pending). 'verified' is kept as an alias of is_verified for existing callers.
app.get('/admin/psychologists', requireAuth, requireRole('admin'), async (req, res) => {
  const status = req.query.status || 'pending';

  const runQuery = (withVerification) => {
    let query = supabase
      .from('Psychologist')
      .select(withVerification
        ? 'psychologist_id, user_id, license_no, credentials, professional_title, specialties, session_price, is_verified, is_available, profile_photo_url, verification_status, verification_note, verification_decided_at, verification_submitted_at, pending_credentials, User(name, email, status, created_at), Psychologist_Document(document_id, status)'
        : 'psychologist_id, user_id, license_no, credentials, specialties, session_price, is_verified, is_available, profile_photo_url, User(name, email, status, created_at)');

    if (status === 'verified') query = query.eq('is_verified', true);
    else if (!withVerification) {
      if (status === 'pending') query = query.eq('is_verified', false);
      if (status === 'approved') query = query.eq('is_verified', true);
    } else if (VERIFICATION_STATUSES.includes(status)) {
      query = query.eq('verification_status', status);
    }
    return query;
  };

  let { data, error } = await runQuery(true);
  // Before the migration runs, keep the original behaviour working.
  if (error && verificationMigrationError(error) !== error.message) {
    ({ data, error } = await runQuery(false));
  }
  if (error) return res.status(500).json({ error: error.message });

  res.json((data || []).map((p) => {
    const st = verificationStatusOf(p);
    return {
      ...p,
      verification_status: st,
      is_update: Boolean(p.is_verified && (st === 'pending' || st === 'info_requested')),
      profile_photo_url: photoUrlOf(p.profile_photo_url),
      document_count: activeDocuments(p.Psychologist_Document).length,
      pending_credentials: undefined,
      Psychologist_Document: undefined,
    };
  }).sort((a, b) => new Date(b.verification_submitted_at || b.User?.created_at || 0) - new Date(a.verification_submitted_at || a.User?.created_at || 0)));
});

// GET /admin/psychologists/:id/application — everything the psychologist
// actually submitted (no derived or placeholder values), the approved vs newly
// submitted credentials side by side, every document as a 10-minute signed
// URL, and the full submission + decision history.
app.get('/admin/psychologists/:id/application', requireAuth, requireRole('admin'), async (req, res) => {
  const { data: p, error } = await supabase
    .from('Psychologist')
    .select('*, User(user_id, name, email, status, created_at, Barangay(name, city))')
    .eq('psychologist_id', req.params.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: verificationMigrationError(error) });
  if (!p) return res.status(404).json({ error: 'Psychologist not found' });

  const [docsRes, eventsRes, subsRes] = await Promise.all([
    supabase.from('Psychologist_Document').select('*').eq('psychologist_id', p.psychologist_id).order('uploaded_at', { ascending: false }),
    supabase.from('Psychologist_Verification_Event').select('*').eq('psychologist_id', p.psychologist_id).order('created_at', { ascending: false }),
    supabase.from('Psychologist_Credential_Submission').select('*').eq('psychologist_id', p.psychologist_id).order('submitted_at', { ascending: false }),
  ]);
  for (const r of [docsRes, eventsRes, subsRes]) {
    if (r.error) return res.status(500).json({ error: verificationMigrationError(r.error) });
  }

  // Actor ids are plain columns (no FK), so resolve names in one lookup.
  const actorIds = [...new Set([
    p.verification_decided_by,
    ...(eventsRes.data || []).map((e) => e.actor_user_id),
    ...(subsRes.data || []).map((s) => s.decided_by),
  ].filter(Boolean))];
  const actorNames = {};
  if (actorIds.length) {
    const { data: actors } = await supabase.from('User').select('user_id, name').in('user_id', actorIds);
    (actors || []).forEach((a) => { actorNames[a.user_id] = a.name; });
  }

  const status = verificationStatusOf(p);
  const latest = (subsRes.data || [])[0] || null;
  const documents = await signDocuments(docsRes.data);

  res.json({
    psychologist_id: p.psychologist_id,
    personal: {
      name: p.User?.name || null,
      email: p.User?.email || null,
      contact_number: p.contact_number || null,
      barangay: p.User?.Barangay ? [p.User.Barangay.name, p.User.Barangay.city].filter(Boolean).join(', ') : null,
      profile_photo_url: photoUrlOf(p.profile_photo_url),
      account_status: p.User?.status || null,
      registered_at: p.User?.created_at || null,
    },
    professional: {
      license_no: p.license_no,
      license_expiry: p.license_expiry || null,
      credentials: p.credentials,
      professional_title: p.professional_title || null,
      specialties: p.specialties || [],
      expertise: p.expertise || [],
      years_experience: p.years_experience ?? null,
      languages: p.languages || [],
      education: p.education || null,
      bio: p.bio || null,
      consultation_types: p.consultation_types || [],
      session_duration_minutes: p.session_duration_minutes ?? null,
      services: p.services || [],
      session_price: p.session_price ?? null,
    },
    verification: {
      status,
      is_verified: p.is_verified,
      is_update: Boolean(p.is_verified && (status === 'pending' || status === 'info_requested')),
      note: p.verification_note || null,
      decided_at: p.verification_decided_at || null,
      decided_by_name: actorNames[p.verification_decided_by] || null,
      submitted_at: p.verification_submitted_at || latest?.submitted_at || null,
      previous_status: latest?.previous?.status || null,
      response: latest?.response || p.info_response || null,
    },
    // Approved values (live) vs what the latest open submission proposes.
    comparison: latest && ['pending', 'info_requested'].includes(latest.status) ? {
      kind: latest.kind,
      approved: latest.previous?.approved || approvedCredentialsOf(p),
      submitted: { license_no: latest.license_no, license_expiry: latest.license_expiry, credentials: latest.credentials },
      approved_document_ids: latest.previous?.document_ids || [],
      submitted_document_ids: latest.document_ids || [],
    } : null,
    documents,
    submissions: (subsRes.data || []).map((s) => ({
      submission_id: s.submission_id,
      kind: s.kind,
      status: s.status,
      license_no: s.license_no,
      license_expiry: s.license_expiry,
      credentials: s.credentials,
      response: s.response,
      decision_note: s.decision_note,
      submitted_at: s.submitted_at,
      decided_at: s.decided_at,
      decided_by_name: actorNames[s.decided_by] || null,
      document_count: (s.document_ids || []).length,
    })),
    history: (eventsRes.data || []).map((e) => ({
      event_id: e.event_id,
      action: e.action,
      note: e.note,
      actor_name: actorNames[e.actor_user_id] || null,
      created_at: e.created_at,
    })),
  });
});

// Shared start of every admin decision: confirmation, current row, status
// guard, and the latest open submission (absent for applications that predate
// the submission table -- those are still decidable).
async function loadDecisionContext(req, res, fromStatuses) {
  if (req.body?.confirm !== true) {
    res.status(400).json({ error: 'This decision must be explicitly confirmed.' });
    return null;
  }
  const { data: p, error } = await supabase.from('Psychologist').select('*').eq('psychologist_id', req.params.id).maybeSingle();
  if (error) { res.status(500).json({ error: verificationMigrationError(error) }); return null; }
  if (!p) { res.status(404).json({ error: 'Psychologist not found' }); return null; }
  const status = verificationStatusOf(p);
  if (!fromStatuses.includes(status)) {
    res.status(409).json({ error: `This application is ${status.replace('_', ' ')}, so it can't be changed that way.` });
    return null;
  }
  const { data: subs, error: subError } = await supabase
    .from('Psychologist_Credential_Submission')
    .select('*')
    .eq('psychologist_id', p.psychologist_id)
    .in('status', ['pending', 'info_requested'])
    .order('submitted_at', { ascending: false })
    .limit(1);
  if (subError) { res.status(500).json({ error: verificationMigrationError(subError) }); return null; }
  return { p, status, submission: subs?.[0] || null };
}

// Conditional on the status we read, so a concurrent decision can't be overwritten.
async function updatePsychologistIfStatus(p, status, updates) {
  const { data, error } = await supabase
    .from('Psychologist')
    .update(updates)
    .eq('psychologist_id', p.psychologist_id)
    .eq('verification_status', status)
    .select('psychologist_id, verification_status, verification_note, verification_decided_at, is_verified');
  if (error) return { error: verificationMigrationError(error) };
  if (!data || data.length === 0) return { conflict: true };
  return { row: data[0] };
}

async function closeSubmission(submission, status, note, adminId) {
  if (!submission) return;
  await supabase.from('Psychologist_Credential_Submission')
    .update({ status, decision_note: note || null, decided_at: new Date().toISOString(), decided_by: adminId })
    .eq('submission_id', submission.submission_id);
}

// POST /admin/psychologists/:id/verify — body: { confirm: true }. Approves a
// PENDING submission (never one still waiting on requested info): applies the
// submitted credentials, marks its documents verified (and the ones they
// replace superseded), and sets is_verified.
app.post('/admin/psychologists/:id/verify', requireAuth, requireRole('admin'), async (req, res) => {
  const ctx = await loadDecisionContext(req, res, ['pending']);
  if (!ctx) return;
  const { p, status, submission } = ctx;
  const wasVerified = Boolean(p.is_verified);
  const now = new Date().toISOString();

  const updates = {
    verification_status: 'approved',
    verification_note: null,
    verification_decided_at: now,
    verification_decided_by: req.user.user_id,
    pending_credentials: null,
    is_verified: true,
  };
  if (!wasVerified) updates.is_available = true;
  if (submission) {
    updates.license_no = submission.license_no || p.license_no;
    updates.license_expiry = submission.license_expiry || null;
    updates.credentials = submission.credentials || p.credentials;
  }

  const result = await updatePsychologistIfStatus(p, status, updates);
  if (result.error) return res.status(500).json({ error: result.error });
  if (result.conflict) return res.status(409).json({ error: 'This application changed while you were reviewing it. Reload and try again.' });

  if (submission) {
    await closeSubmission(submission, 'approved', null, req.user.user_id);
    const ids = submission.document_ids || [];
    if (ids.length) {
      const { data: approvedDocs } = await supabase.from('Psychologist_Document')
        .update({ status: 'verified' }).in('document_id', ids).in('status', ['submitted', 'draft'])
        .select('replaces_document_id');
      const replaced = (approvedDocs || []).map((d) => d.replaces_document_id).filter(Boolean);
      if (replaced.length) {
        await supabase.from('Psychologist_Document').update({ status: 'superseded' }).in('document_id', replaced);
      }
    }
  }

  await logVerificationEvent(p.psychologist_id, wasVerified ? 'update_approved' : 'approved', null, req.user.user_id);
  await notifyUser(p.user_id,
    wasVerified ? 'Credential update approved' : 'Verification approved',
    wasVerified
      ? 'Your updated professional credentials have been reviewed and approved.'
      : 'Your professional credentials have been approved. Your profile is now verified and visible to residents.',
    '/psychologist/profile');
  res.json(result.row);
});

// POST /admin/psychologists/:id/reject — body: { confirm: true, reason, revoke? }.
// Denies the open submission with a required reason. For an already verified
// psychologist this only rejects the UPDATE (previous approval stays) unless
// revoke:true, which also removes verified status. Never-verified psychologists
// stay unverified. The account can still log in to read the decision.
app.post('/admin/psychologists/:id/reject', requireAuth, requireRole('admin'), async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < MIN_REASON_LENGTH) {
    return res.status(400).json({ error: `A reason for denial is required (at least ${MIN_REASON_LENGTH} characters).` });
  }
  const ctx = await loadDecisionContext(req, res, ['pending', 'info_requested']);
  if (!ctx) return;
  const { p, status, submission } = ctx;
  const keepApproval = Boolean(p.is_verified) && req.body.revoke !== true;
  const now = new Date().toISOString();

  const updates = {
    verification_note: reason,
    verification_decided_at: now,
    verification_decided_by: req.user.user_id,
    pending_credentials: null,
  };
  if (keepApproval) {
    updates.verification_status = 'approved';
  } else {
    updates.verification_status = 'denied';
    updates.is_verified = false;
    updates.is_available = false;
  }

  const result = await updatePsychologistIfStatus(p, status, updates);
  if (result.error) return res.status(500).json({ error: result.error });
  if (result.conflict) return res.status(409).json({ error: 'This application changed while you were reviewing it. Reload and try again.' });

  await closeSubmission(submission, 'denied', reason, req.user.user_id);
  if (submission?.document_ids?.length) {
    // Only the new (unapproved) documents are rejected; previously verified
    // ones stay verified when the old approval is kept.
    await supabase.from('Psychologist_Document')
      .update({ status: 'rejected' }).in('document_id', submission.document_ids).in('status', ['submitted', 'draft']);
  }

  let action = 'denied';
  let title = 'Verification denied';
  let body = `Your professional credentials were not approved. Reason: ${reason}`;
  if (keepApproval) {
    action = 'update_denied';
    title = 'Credential update not approved';
    body = `Your credential update was not approved, so your previously verified credentials remain in effect. Reason: ${reason}`;
  } else if (p.is_verified) {
    action = 'verification_revoked';
    title = 'Verification revoked';
    body = `Your verified status has been removed after reviewing your updated credentials. Reason: ${reason}`;
  }
  await logVerificationEvent(p.psychologist_id, action, reason, req.user.user_id);
  await notifyUser(p.user_id, title, body, '/psychologist/profile');
  res.json(result.row);
});

// POST /admin/psychologists/:id/request-info — body: { confirm: true, note }.
// Sends a pending submission back for missing / corrected information. Verified
// status (if any) is unchanged; it returns to pending once they resubmit.
app.post('/admin/psychologists/:id/request-info', requireAuth, requireRole('admin'), async (req, res) => {
  const note = String(req.body?.note || '').trim();
  if (note.length < MIN_REASON_LENGTH) {
    return res.status(400).json({ error: `Describe the missing information (at least ${MIN_REASON_LENGTH} characters).` });
  }
  const ctx = await loadDecisionContext(req, res, ['pending']);
  if (!ctx) return;
  const { p, status, submission } = ctx;

  const result = await updatePsychologistIfStatus(p, status, {
    verification_status: 'info_requested',
    verification_note: note,
    verification_decided_at: new Date().toISOString(),
    verification_decided_by: req.user.user_id,
  });
  if (result.error) return res.status(500).json({ error: result.error });
  if (result.conflict) return res.status(409).json({ error: 'This application changed while you were reviewing it. Reload and try again.' });

  await closeSubmission(submission, 'info_requested', note, req.user.user_id);
  await logVerificationEvent(p.psychologist_id, 'info_requested', note, req.user.user_id);
  await notifyUser(p.user_id, 'Additional information required',
    `An admin needs more information to verify your credentials: ${note}`, '/psychologist/profile');
  res.json(result.row);
});

// GET /admin/psychologists/:id/documents/:documentId/url — fresh signed URL
// (the ones in the application payload expire after 10 minutes).
app.get('/admin/psychologists/:id/documents/:documentId/url', requireAuth, requireRole('admin'), async (req, res) => {
  const { data: doc, error } = await supabase
    .from('Psychologist_Document')
    .select('file_path')
    .eq('document_id', req.params.documentId)
    .eq('psychologist_id', req.params.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: verificationMigrationError(error) });
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const { data, error: signError } = await supabase.storage.from('psychologist-documents').createSignedUrl(doc.file_path, 600);
  if (signError) return res.status(500).json({ error: signError.message });
  res.json({ url: data.signedUrl });
});

// GET /psychologists/me/verification — the psychologist's own credentials:
// approved vs pending values, documents (with their review status), what's
// still missing, the admin's latest message and the submission history.
// Admin identities are not exposed.
app.get('/psychologists/me/verification', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data: p, error } = await loadOwnPsychologist(req.user.user_id);
  if (error) return res.status(500).json({ error: verificationMigrationError(error) });
  if (!p) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const [docsRes, eventsRes, subsRes] = await Promise.all([
    supabase.from('Psychologist_Document').select('*').eq('psychologist_id', p.psychologist_id).order('uploaded_at', { ascending: false }),
    supabase.from('Psychologist_Verification_Event').select('action, note, created_at').eq('psychologist_id', p.psychologist_id).order('created_at', { ascending: false }),
    supabase.from('Psychologist_Credential_Submission').select('submission_id, kind, status, decision_note, response, submitted_at, decided_at').eq('psychologist_id', p.psychologist_id).order('submitted_at', { ascending: false }),
  ]);
  for (const r of [docsRes, eventsRes, subsRes]) {
    if (r.error) return res.status(500).json({ error: verificationMigrationError(r.error) });
  }

  const status = verificationStatusOf(p);
  const missing = submissionRequirements(p, docsRes.data);
  const unsubmitted = hasUnsubmittedChanges(p, docsRes.data);
  // A verified psychologist only needs to submit when something changed; an
  // unverified one can submit (or resubmit) whenever the requirements are met.
  const underReview = status === 'pending' && (subsRes.data || []).some((s) => s.status === 'pending');
  const canSubmit = missing.length === 0 && !underReview
    && (p.is_verified ? unsubmitted || status === 'info_requested' : true);

  res.json({
    status,
    is_verified: p.is_verified,
    note: p.verification_note || null,
    decided_at: p.verification_decided_at || null,
    submitted_at: p.verification_submitted_at || null,
    approved: approvedCredentialsOf(p),
    pending_credentials: p.pending_credentials || null,
    effective: effectiveCredentialsOf(p),
    documents: await signDocuments(docsRes.data),
    missing_requirements: missing,
    has_unsubmitted_changes: unsubmitted,
    can_submit: canSubmit,
    under_review: underReview,
    submissions: subsRes.data || [],
    history: eventsRes.data || [],
  });
});

// PATCH /psychologists/me/credentials — body: { license_no?, license_expiry?, credentials? }.
// Regulated fields never change the approved record directly: they're held in
// pending_credentials until submitted (and, for a verified psychologist, until
// an admin approves them).
app.patch('/psychologists/me/credentials', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data: p, error } = await loadOwnPsychologist(req.user.user_id);
  if (error) return res.status(500).json({ error: verificationMigrationError(error) });
  if (!p) return res.status(404).json({ error: 'No psychologist profile found for this account' });
  if (await isUnderReview(p)) {
    return res.status(409).json({ error: 'Your credentials are under review. You can change them after the admin responds.' });
  }

  const next = effectiveCredentialsOf(p);
  if (req.body.license_no !== undefined) {
    const v = String(req.body.license_no).trim();
    if (!LICENSE_NO_RE.test(v)) return res.status(400).json({ error: 'Enter a valid PRC license number (4-20 letters, digits or dashes).' });
    next.license_no = v;
  }
  if (req.body.license_expiry !== undefined) {
    const v = req.body.license_expiry ? String(req.body.license_expiry) : null;
    if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))) {
      return res.status(400).json({ error: 'Enter a valid license expiry date.' });
    }
    next.license_expiry = v;
  }
  if (req.body.credentials !== undefined) {
    const v = String(req.body.credentials).trim();
    if (!v || v.length > 150) return res.status(400).json({ error: 'Credentials are required (up to 150 characters).' });
    next.credentials = v;
  }

  const pending = sameCredentials(next, approvedCredentialsOf(p)) ? null : next;
  const { error: updateError } = await supabase
    .from('Psychologist').update({ pending_credentials: pending }).eq('psychologist_id', p.psychologist_id);
  if (updateError) return res.status(500).json({ error: verificationMigrationError(updateError) });

  if (pending) {
    await logVerificationEvent(p.psychologist_id, 'credentials_changed',
      `License ${pending.license_no || '—'}${pending.license_expiry ? `, expires ${pending.license_expiry}` : ''}; ${pending.credentials || ''}`,
      req.user.user_id);
  }
  res.json({ approved: approvedCredentialsOf(p), pending_credentials: pending, effective: next });
});

// POST /psychologists/me/documents — multipart: file, doc_type, replaces_document_id?.
// PDF / JPG / PNG up to 10 MB, checked by content. New uploads are drafts --
// never verified until an admin approves the submission they're part of.
app.post('/psychologists/me/documents', requireAuth, requireRole('psychologist'), handleDocumentUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A file is required' });
  const sniffed = sniffDocumentType(req.file.buffer, req.file.originalname);
  if (!sniffed) return res.status(400).json({ error: 'Upload a PDF, JPG, JPEG or PNG file (the file contents must match its extension).' });
  if (!DOCUMENT_TYPES.includes(req.body.doc_type)) return res.status(400).json({ error: 'Choose a document type.' });
  const docType = req.body.doc_type;

  const { data: p, error: findError } = await loadOwnPsychologist(req.user.user_id);
  if (findError) return res.status(500).json({ error: verificationMigrationError(findError) });
  if (!p) return res.status(404).json({ error: 'No psychologist profile found for this account' });
  if (await isUnderReview(p)) {
    return res.status(409).json({ error: 'Your documents are under review. You can add or replace documents after the admin responds.' });
  }

  const { data: existing, error: docsError } = await supabase
    .from('Psychologist_Document').select('document_id, status, file_path, replaces_document_id').eq('psychologist_id', p.psychologist_id);
  if (docsError) return res.status(500).json({ error: verificationMigrationError(docsError) });
  if (activeDocuments(existing).length >= MAX_ACTIVE_DOCUMENTS) {
    return res.status(400).json({ error: `You can keep up to ${MAX_ACTIVE_DOCUMENTS} documents. Remove a draft first.` });
  }

  let replaces = null;
  if (req.body.replaces_document_id) {
    replaces = (existing || []).find((d) => String(d.document_id) === String(req.body.replaces_document_id));
    if (!replaces) return res.status(404).json({ error: 'The document you are replacing was not found.' });
    if (replaces.status === 'superseded') return res.status(409).json({ error: 'That document was already replaced.' });
  }

  const filePath = `${p.psychologist_id}/${Date.now()}-${docType}.${sniffed.ext}`;
  const { error: uploadError } = await supabase.storage
    .from('psychologist-documents')
    .upload(filePath, req.file.buffer, { contentType: sniffed.mime });
  if (uploadError) return res.status(500).json({ error: uploadError.message });

  // Replacing a draft simply swaps it out; replacing a submitted/verified/
  // rejected document keeps the original until an admin approves the new one.
  let replacesId = null;
  if (replaces?.status === 'draft') replacesId = replaces.replaces_document_id || null; // inherit what the draft was replacing
  else if (replaces && replaces.status !== 'rejected') replacesId = replaces.document_id;

  const { data, error } = await supabase
    .from('Psychologist_Document')
    .insert([{
      psychologist_id: p.psychologist_id,
      doc_type: docType,
      file_path: filePath,
      file_name: req.file.originalname.replace(/[^\w.\- ()]/g, '_').slice(0, 200),
      mime_type: sniffed.mime,
      size_bytes: req.file.size,
      status: 'draft',
      replaces_document_id: replacesId,
    }])
    .select();
  if (error) {
    await supabase.storage.from('psychologist-documents').remove([filePath]).catch(() => {});
    return res.status(500).json({ error: verificationMigrationError(error) });
  }

  if (replaces?.status === 'draft') {
    await supabase.from('Psychologist_Document').delete().eq('document_id', replaces.document_id);
    await supabase.storage.from('psychologist-documents').remove([replaces.file_path]).catch(() => {});
  }

  await logVerificationEvent(p.psychologist_id, 'document_uploaded', `${docType}: ${data[0].file_name}`, req.user.user_id);
  const [signed] = await signDocuments(data);
  res.status(201).json(signed);
});

// DELETE /psychologists/me/documents/:id — only drafts (never-submitted
// uploads) can be removed; anything an admin has seen is kept for the record
// and can only be replaced.
app.delete('/psychologists/me/documents/:id', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data: p, error: findError } = await loadOwnPsychologist(req.user.user_id);
  if (findError) return res.status(500).json({ error: verificationMigrationError(findError) });
  if (!p) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data: doc, error } = await supabase
    .from('Psychologist_Document').select('document_id, status, file_path, file_name')
    .eq('document_id', req.params.id).eq('psychologist_id', p.psychologist_id).maybeSingle();
  if (error) return res.status(500).json({ error: verificationMigrationError(error) });
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (doc.status !== 'draft') {
    return res.status(409).json({ error: 'Submitted documents are kept on record. Upload a replacement instead.' });
  }

  const { error: delError } = await supabase.from('Psychologist_Document').delete().eq('document_id', doc.document_id);
  if (delError) return res.status(500).json({ error: delError.message });
  await supabase.storage.from('psychologist-documents').remove([doc.file_path]).catch(() => {});
  await logVerificationEvent(p.psychologist_id, 'document_removed', doc.file_name, req.user.user_id);
  res.json({ removed: true });
});

// POST /psychologists/me/verification/submit — body: { confirm: true, response? }.
// Snapshots the current credentials + documents into a new submission and
// moves the status to pending. Never approves anything by itself.
app.post('/psychologists/me/verification/submit', requireAuth, requireRole('psychologist'), async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: 'Please confirm the submission.' });
  const response = req.body.response ? String(req.body.response).trim().slice(0, 1000) : null;

  const { data: p, error } = await loadOwnPsychologist(req.user.user_id);
  if (error) return res.status(500).json({ error: verificationMigrationError(error) });
  if (!p) return res.status(404).json({ error: 'No psychologist profile found for this account' });
  const status = verificationStatusOf(p);
  if (await isUnderReview(p)) return res.status(409).json({ error: 'Your credentials are already awaiting review.' });

  const { data: docs, error: docsError } = await supabase
    .from('Psychologist_Document').select('*').eq('psychologist_id', p.psychologist_id);
  if (docsError) return res.status(500).json({ error: verificationMigrationError(docsError) });

  const missing = submissionRequirements(p, docs);
  if (missing.length) return res.status(400).json({ error: `Before submitting, add: ${missing.join(', ')}.` });
  if (p.is_verified && status !== 'info_requested' && !hasUnsubmittedChanges(p, docs)) {
    return res.status(400).json({ error: 'There are no new credentials or documents to submit.' });
  }

  const { count: priorCount } = await supabase
    .from('Psychologist_Credential_Submission').select('submission_id', { count: 'exact', head: true }).eq('psychologist_id', p.psychologist_id);
  const kind = p.is_verified ? 'update' : (priorCount > 0 || status === 'info_requested' || status === 'denied' ? 'resubmission' : 'initial');

  const eff = effectiveCredentialsOf(p);
  const active = activeDocuments(docs);
  const verifiedIds = (docs || []).filter((d) => d.status === 'verified').map((d) => d.document_id);
  const now = new Date().toISOString();

  const { data: sub, error: subError } = await supabase
    .from('Psychologist_Credential_Submission')
    .insert([{
      psychologist_id: p.psychologist_id,
      kind,
      license_no: eff.license_no,
      license_expiry: eff.license_expiry,
      credentials: eff.credentials,
      document_ids: active.map((d) => d.document_id),
      previous: { status, approved: approvedCredentialsOf(p), document_ids: verifiedIds },
      response,
    }])
    .select()
    .single();
  if (subError) return res.status(500).json({ error: verificationMigrationError(subError) });

  const updates = {
    verification_status: 'pending',
    verification_submitted_at: now,
    info_response: response,
    info_responded_at: response ? now : null,
  };
  // Nothing approved to protect yet: the submitted values become the record
  // the admin reviews. A verified psychologist keeps their approved values.
  if (!p.is_verified) {
    updates.license_no = eff.license_no;
    updates.license_expiry = eff.license_expiry;
    updates.credentials = eff.credentials;
    updates.pending_credentials = null;
  }
  const { data: updated, error: updError } = await supabase
    .from('Psychologist').update(updates)
    .eq('psychologist_id', p.psychologist_id).eq('verification_status', status)
    .select('verification_status');
  if (updError || !updated?.length) {
    await supabase.from('Psychologist_Credential_Submission').delete().eq('submission_id', sub.submission_id);
    return res.status(updError ? 500 : 409).json({ error: updError ? verificationMigrationError(updError) : 'Your status changed. Reload and try again.' });
  }

  // Close any earlier open submission and attach the documents to this one.
  await supabase.from('Psychologist_Credential_Submission')
    .update({ status: 'superseded' })
    .eq('psychologist_id', p.psychologist_id).neq('submission_id', sub.submission_id).eq('status', 'pending');
  const draftIds = active.filter((d) => d.status === 'draft' || d.status === 'submitted').map((d) => d.document_id);
  if (draftIds.length) {
    await supabase.from('Psychologist_Document')
      .update({ status: 'submitted', submission_id: sub.submission_id }).in('document_id', draftIds);
  }

  const name = req.user.name || 'A psychologist';
  if (kind === 'update') {
    await logVerificationEvent(p.psychologist_id, 'update_submitted', response, req.user.user_id);
    await notifyUser(p.user_id, 'Updated credentials awaiting review',
      'Your updated credentials were submitted. Your current verified status stays active while an admin reviews them.', '/psychologist/profile');
    await notifyAdmins('Verified psychologist updated credentials', `${name} submitted updated license information or documents for review.`);
  } else if (kind === 'resubmission') {
    await logVerificationEvent(p.psychologist_id, status === 'info_requested' ? 'info_submitted' : 'resubmitted', response, req.user.user_id);
    await notifyUser(p.user_id, 'Documents submitted', 'Your documents were resubmitted and are awaiting admin review.', '/psychologist/profile');
    await notifyAdmins('Corrected documents resubmitted', `${name} resubmitted their credentials and is back in Pending Review.`);
  } else {
    await logVerificationEvent(p.psychologist_id, 'submitted', response, req.user.user_id);
    await notifyUser(p.user_id, 'Documents submitted', 'Your professional credentials were submitted and are awaiting admin review.', '/psychologist/profile');
    await notifyAdmins('New credential submission', `${name} submitted professional credentials for verification.`);
  }

  res.status(201).json({ status: 'pending', submission_id: sub.submission_id, kind });
});

// Use after requireAuth + requireRole('psychologist'): blocks verified-only
// actions for not-submitted / pending / info-requested / denied accounts.
async function requireVerifiedPsychologist(req, res, next) {
  const { data } = await supabase
    .from('Psychologist')
    .select('is_verified')
    .eq('user_id', req.user.user_id)
    .maybeSingle();
  if (!data?.is_verified) {
    return res.status(403).json({ error: 'Your license must be verified by an admin before you can do this.' });
  }
  next();
}

// GET /admin/users?search=&role=&status= — the account roster behind Manage
// Users: search by name/email, filter by role/status. Password is never selected.
app.get('/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  const { search, role, status } = req.query;

  let query = supabase
    .from('User')
    .select('user_id, name, email, role, barangay_id, status, created_at')
    .order('created_at', { ascending: false });

  if (role) query = query.eq('role', role);
  if (status) query = query.eq('status', status);
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /admin/users/:id/status — general activate/suspend, distinct from the
// psychologist-application-only status change above. An admin can't act on
// their own account through this route (avoids accidentally locking themselves out).
app.patch('/admin/users/:id/status', requireAuth, requireRole('admin'), async (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: "status must be 'active' or 'suspended'" });
  }
  if (Number(req.params.id) === req.user.user_id) {
    return res.status(400).json({ error: 'You cannot change the status of your own account' });
  }

  const { data, error } = await supabase
    .from('User')
    .update({ status })
    .eq('user_id', req.params.id)
    .select('user_id, name, email, role, status');

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(data[0]);
});

// PATCH /admin/users/:id/profile — lets an admin correct a name or reassign a
// barangay from the Manage Users/Residents/Psychologists tables' Edit action.
// Separate from /status above so the two concerns (who can log in vs. what
// their record says) stay independent edits.
app.patch('/admin/users/:id/profile', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, barangay_id } = req.body;
  const updates = {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
    updates.name = name.trim();
  }
  if (barangay_id !== undefined) updates.barangay_id = barangay_id;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const { data, error } = await supabase
    .from('User')
    .update(updates)
    .eq('user_id', req.params.id)
    .select('user_id, name, email, role, barangay_id, status, created_at');

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(data[0]);
});

// DELETE /admin/users/:id — permanent hard delete via delete_user_account (see
// db/delete_user_account.sql): wipes every row referencing this account, in one
// transaction. Voice journal audio files are removed from storage first
// (best-effort -- the DB delete already succeeded either way, so a storage
// cleanup failure shouldn't block the response).
app.delete('/admin/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.user_id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const { data: journalEntries } = await supabase
    .from('Voice_Journal')
    .select('audio_path')
    .eq('user_id', targetId);

  if (journalEntries && journalEntries.length > 0) {
    const paths = journalEntries.map((j) => j.audio_path).filter(Boolean);
    if (paths.length > 0) {
      try {
        await supabase.storage.from('voice-journal-audio').remove(paths);
      } catch {
        // best-effort cleanup -- the account delete proceeds regardless
      }
    }
  }

  const { data, error } = await supabase.rpc('delete_user_account', { p_user_id: targetId });

  if (error) {
    if (error.message?.includes('not found')) return res.status(404).json({ error: 'User not found' });
    return res.status(500).json({ error: error.message });
  }

  res.json({ deleted: true, ...data[0] });
});

// PATCH /admin/lgu-accounts/:id/status — body: { status: 'active' | 'deactivated' }.
// Deactivating sets User.status = 'suspended' -- the value /auth/login and
// /auth/me already refuse -- so the barangay office is signed out and can't log
// back in, while its data (residents, credits, subscription) is kept intact.
app.patch('/admin/lgu-accounts/:id/status', requireAuth, requireRole('admin'), async (req, res) => {
  const { status } = req.body;
  if (!['active', 'deactivated'].includes(status)) {
    return res.status(400).json({ error: "status must be 'active' or 'deactivated'" });
  }
  const { data: target, error: targetError } = await supabase
    .from('User').select('user_id, role, status').eq('user_id', req.params.id).maybeSingle();
  if (targetError) return res.status(500).json({ error: targetError.message });
  if (!target) return res.status(404).json({ error: 'LGU account not found' });
  if (target.role !== 'lgu') return res.status(400).json({ error: 'This account is not an LGU account' });

  const next = status === 'deactivated' ? 'suspended' : 'active';
  if (target.status === next) {
    return res.status(409).json({ error: `This account is already ${status === 'deactivated' ? 'deactivated' : 'active'}` });
  }
  const { data, error } = await supabase
    .from('User').update({ status: next }).eq('user_id', req.params.id)
    .select('user_id, name, email, barangay_id, status');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// GET /admin/lgu-accounts — every barangay's LGU login, if it has one. Suspend/
// reactivate/delete reuse the generic /admin/users/:id routes above -- they
// already work for any role.
app.get('/admin/lgu-accounts', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('User')
    .select('user_id, name, email, barangay_id, status, created_at, Barangay(name, city)')
    .eq('role', 'lgu')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /admin/lgu-accounts — provisions a barangay's LGU login. One LGU account
// per barangay: an admin creates it, hands the credentials to that barangay's
// office, and they log in as themselves from then on (mirrors real municipal
// accounts -- no public self-signup for this role).
const LGU_EMAIL_RE = /^[^s@]+@[^s@]+.[^s@]+$/;
const LGU_MIN_PASSWORD = 8;

app.post('/admin/lgu-accounts', requireAuth, requireRole('admin'), async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const { password, barangay_id } = req.body;
  if (!name || !email || !password || !barangay_id) {
    return res.status(400).json({ error: 'name, email, password, and barangay_id are required' });
  }
  if (!LGU_EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (String(password).length < LGU_MIN_PASSWORD) {
    return res.status(400).json({ error: `Password must be at least ${LGU_MIN_PASSWORD} characters` });
  }

  const { data: barangay, error: barangayError } = await supabase
    .from('Barangay')
    .select('barangay_id')
    .eq('barangay_id', barangay_id)
    .single();
  if (barangayError || !barangay) return res.status(404).json({ error: 'Barangay not found' });

  const { data: existingForBarangay } = await supabase
    .from('User')
    .select('user_id')
    .eq('role', 'lgu')
    .eq('barangay_id', barangay_id)
    .limit(1);
  if (existingForBarangay && existingForBarangay.length > 0) {
    return res.status(409).json({ error: 'This barangay already has an LGU account' });
  }

  const { data: existingEmail } = await supabase.from('User').select('user_id').eq('email', email).limit(1);
  if (existingEmail && existingEmail.length > 0) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('User')
    .insert([{ name, email, password: hashedPassword, role: 'lgu', barangay_id, status: 'active' }])
    .select('user_id, name, email, barangay_id, status');

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

// PATCH /admin/lgu-accounts/:id — body: { name?, email?, password? }. Contact
// name, login email and an optional password reset; the account stays tied to
// whichever barangay it was created for.
app.patch('/admin/lgu-accounts/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const name = req.body.name === undefined ? undefined : String(req.body.name).trim();
  const email = req.body.email === undefined ? undefined : String(req.body.email).trim().toLowerCase();
  const { password } = req.body;
  if (name === '') return res.status(400).json({ error: 'Contact name cannot be empty' });
  if (email !== undefined && !LGU_EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (password && String(password).length < LGU_MIN_PASSWORD) {
    return res.status(400).json({ error: `Password must be at least ${LGU_MIN_PASSWORD} characters` });
  }
  if (!name && !email && !password) return res.status(400).json({ error: 'Nothing to update' });

  const { data: target, error: targetError } = await supabase
    .from('User')
    .select('user_id, role')
    .eq('user_id', req.params.id)
    .single();
  if (targetError || !target) return res.status(404).json({ error: 'LGU account not found' });
  if (target.role !== 'lgu') return res.status(400).json({ error: 'This account is not an LGU account' });

  if (email) {
    const { data: existingEmail } = await supabase
      .from('User')
      .select('user_id')
      .eq('email', email)
      .neq('user_id', req.params.id)
      .limit(1);
    if (existingEmail && existingEmail.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
  }

  const updates = {};
  if (name) updates.name = name;
  if (email) updates.email = email;
  if (password) updates.password = await bcrypt.hash(String(password), 10);

  const { data, error } = await supabase
    .from('User')
    .update(updates)
    .eq('user_id', req.params.id)
    .select('user_id, name, email, barangay_id, status');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// Shared by the LGU's own dashboard and the citywide overview. "Risk" here is
// a plain, honestly-computed ratio -- NOT a clinical or AI-driven score --
// based on whether each resident's MOST RECENT Assessment_Result flagged a
// safety concern. A resident with no assessment at all is simply excluded,
// never counted as either flagged or clear.
async function getLatestSafetyFlagByResident() {
  const { data: assessments, error } = await supabase
    .from('Assessment_Result')
    .select('user_id, created_at, safety_flag')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const latestByUser = new Map();
  for (const a of assessments) {
    if (!latestByUser.has(a.user_id)) latestByUser.set(a.user_id, a.safety_flag);
  }
  return latestByUser;
}

// "Flag High-Risk Cases": a human judgment call an LGU office makes (see
// db/lgu_risk_flags.sql), separate from the automatic safety_flag above. A
// resident counts as high-risk if EITHER signal is present -- their own
// check-in flagged a concern, or their barangay flagged them directly.
async function getActiveManualFlagsByResident() {
  const { data, error } = await supabase
    .from('LGU_Risk_Flag')
    .select('resident_id, reason, created_at, flagged_by')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const byResident = new Map();
  for (const f of data) {
    if (!byResident.has(f.resident_id)) byResident.set(f.resident_id, f);
  }
  return byResident;
}

// Same idea for mood: each resident's most recent Mood_Entry within the last
// 30 days, used for the wellness index and "who's actively checking in."
async function getRecentMoodByResident() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const { data: moods, error } = await supabase
    .from('Mood_Entry')
    .select('user_id, entry_date, mood_level')
    .gte('entry_date', cutoff.toISOString().slice(0, 10))
    .order('entry_date', { ascending: false });
  if (error) throw error;

  const latestByUser = new Map();
  for (const m of moods) {
    if (!latestByUser.has(m.user_id)) latestByUser.set(m.user_id, m.mood_level);
  }
  return latestByUser;
}

// Generalized version of the above for an arbitrary [start, end) window, so
// the monthly report can compare "this period" against "the period before
// it" using the same latest-entry-per-resident logic.
async function getMoodInWindowByResident(start, end) {
  const { data: moods, error } = await supabase
    .from('Mood_Entry')
    .select('user_id, entry_date, mood_level')
    .gte('entry_date', start.toISOString().slice(0, 10))
    .lt('entry_date', end.toISOString().slice(0, 10))
    .order('entry_date', { ascending: false });
  if (error) throw error;

  const latestByUser = new Map();
  for (const m of moods) {
    if (!latestByUser.has(m.user_id)) latestByUser.set(m.user_id, m.mood_level);
  }
  return latestByUser;
}

function wellnessIndexFrom(residentIds, moodByResident) {
  const values = residentIds.map((id) => moodByResident.get(id)).filter((v) => v !== undefined);
  return values.length > 0 ? Math.round((values.filter((v) => v >= 3).length / values.length) * 100) : null;
}

// 0 flagged -> Low. Otherwise the flagged share of residents buckets into
// Mild/Moderate/High/Critical. A barangay with no residents at all gets its
// own "No data" band rather than being misread as "Low" (safe).
function riskBandFor(flaggedCount, residentCount) {
  if (residentCount === 0) return 'no_data';
  if (flaggedCount === 0) return 'low';
  const ratio = flaggedCount / residentCount;
  if (ratio <= 0.1) return 'mild';
  if (ratio <= 0.25) return 'moderate';
  if (ratio <= 0.5) return 'high';
  return 'critical';
}

// GET /lgu/me/dashboard — the logged-in LGU account's own barangay at a glance:
// residents, sessions, care credits, budget, flagged residents, a wellness
// index, and weekly engagement. Always scoped to their own barangay_id
// (looked up server-side, never taken from a query param), unlike the Admin
// accomplishment report which can see every barangay.
app.get('/lgu/me/dashboard', requireAuth, requireRole('lgu'), async (req, res) => {
  const { data: me, error: meError } = await supabase
    .from('User')
    .select('barangay_id')
    .eq('user_id', req.user.user_id)
    .single();
  if (meError || !me) return res.status(404).json({ error: 'Account not found' });

  const { data: barangay, error: barangayError } = await supabase
    .from('Barangay')
    .select('barangay_id, name, city')
    .eq('barangay_id', me.barangay_id)
    .single();
  if (barangayError || !barangay) return res.status(404).json({ error: 'Barangay not found' });

  const { data: residents, error: residentsError } = await supabase
    .from('User')
    .select('user_id')
    .eq('role', 'resident')
    .eq('barangay_id', me.barangay_id);
  if (residentsError) return res.status(500).json({ error: residentsError.message });
  const residentIds = residents.map((r) => r.user_id);

  const { data: allBookings, error: bookingsError } = await supabase
    .from('Booking')
    .select('care_credit_id, created_at, status, User(barangay_id)');
  if (bookingsError) return res.status(500).json({ error: bookingsError.message });
  const bookings = allBookings.filter((b) => b.User?.barangay_id === me.barangay_id);

  const { data: credits, error: creditsError } = await supabase
    .from('Care_Credit')
    .select('credit_id, amount, status')
    .eq('barangay_id', me.barangay_id);
  if (creditsError) return res.status(500).json({ error: creditsError.message });

  const { data: budget } = await supabase
    .from('Budget')
    .select('total_funded, total_spent')
    .eq('barangay_id', me.barangay_id)
    .maybeSingle();

  const { data: subscription } = await supabase
    .from('Subscription')
    .select('status, plan, renewed_at')
    .eq('barangay_id', me.barangay_id)
    .maybeSingle();

  let safetyFlagByResident, moodByResident, manualFlagByResident;
  try {
    [safetyFlagByResident, moodByResident, manualFlagByResident] = await Promise.all([
      getLatestSafetyFlagByResident(),
      getRecentMoodByResident(),
      getActiveManualFlagsByResident(),
    ]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const highRiskCount = residentIds.filter(
    (id) => safetyFlagByResident.get(id) === true || manualFlagByResident.has(id)
  ).length;

  const moodValues = residentIds.map((id) => moodByResident.get(id)).filter((v) => v !== undefined);
  const wellnessIndex = moodValues.length > 0
    ? Math.round((moodValues.filter((v) => v >= 3).length / moodValues.length) * 100)
    : null;

  // "Used this month" is approximated from the Booking that consumed the
  // credit (the status flip to 'used' happens on accept, which has no
  // separate timestamp of its own) -- the booking's created_at is the
  // closest real signal available.
  const now = new Date();
  const usedCreditIds = new Set(credits.filter((c) => c.status === 'used').map((c) => c.credit_id));
  const usedThisMonthCreditIds = new Set(
    bookings
      .filter((b) => b.care_credit_id && usedCreditIds.has(b.care_credit_id))
      .filter((b) => {
        const d = new Date(b.created_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .map((b) => b.care_credit_id)
  );
  const creditsUsedThisMonth = credits
    .filter((c) => usedThisMonthCreditIds.has(c.credit_id))
    .reduce((sum, c) => sum + Number(c.amount), 0);

  // Weekly active residents + weekly wellness index, last 8 weeks: distinct
  // residents who logged a mood entry that week, and what share of them
  // logged "Okay" or better -- the same formula as the current wellness
  // index above, just bucketed by week instead of a single 30-day window.
  const { data: weeklyMoods, error: weeklyMoodsError } = await supabase
    .from('Mood_Entry')
    .select('user_id, entry_date, mood_level')
    .in('user_id', residentIds.length ? residentIds : [0]);
  if (weeklyMoodsError) return res.status(500).json({ error: weeklyMoodsError.message });

  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date();
    start.setDate(start.getDate() - start.getDay() - i * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    weeks.push({ start, end, label: start.toLocaleDateString('en-PH', { month: 'short' }), residents: new Map() });
  }
  for (const m of weeklyMoods) {
    const d = new Date(m.entry_date);
    const week = weeks.find((w) => d >= w.start && d < w.end);
    // Last entry seen per resident per week wins (closest to "current" for that week).
    if (week) week.residents.set(m.user_id, m.mood_level);
  }

  const budgetFunded = budget ? Number(budget.total_funded) : 0;
  const budgetSpent = budget ? Number(budget.total_spent) : 0;

  res.json({
    barangay,
    resident_count: residentIds.length,
    session_count: bookings.length,
    confirmed_session_count: bookings.filter((b) => b.status === 'confirmed').length,
    high_risk_count: highRiskCount,
    wellness_index: wellnessIndex,
    care_credits_issued: credits.reduce((sum, c) => sum + Number(c.amount), 0),
    care_credits_used: credits.filter((c) => c.status === 'used').reduce((sum, c) => sum + Number(c.amount), 0),
    care_credits_used_this_month: creditsUsedThisMonth,
    budget_funded: budgetFunded,
    budget_spent: budgetSpent,
    budget_remaining: budgetFunded - budgetSpent,
    subscription_status: subscription?.status || 'inactive',
    weekly_engagement: weeks.map((w) => ({ label: w.label, active_residents: w.residents.size })),
    wellness_trend: weeks.map((w) => {
      const levels = [...w.residents.values()];
      return {
        label: w.label,
        index: levels.length > 0 ? Math.round((levels.filter((v) => v >= 3).length / levels.length) * 100) : null,
      };
    }),
  });
});

// GET /lgu/me/care-credits — the logged-in LGU's own barangay's Care Credit
// ledger (who received what, and whether it's been used), plus summary
// totals -- backs both the OpenUp Care Credits and Resource Allocation pages.
app.get('/lgu/me/care-credits', requireAuth, requireRole('lgu'), async (req, res) => {
  const { data: me, error: meError } = await supabase
    .from('User')
    .select('barangay_id')
    .eq('user_id', req.user.user_id)
    .single();
  if (meError || !me) return res.status(404).json({ error: 'Account not found' });

  const { data: credits, error: creditsError } = await supabase
    .from('Care_Credit')
    .select('credit_id, resident_id, amount, status, created_at, User(name)')
    .eq('barangay_id', me.barangay_id)
    .order('created_at', { ascending: false });
  if (creditsError) return res.status(500).json({ error: creditsError.message });

  res.json(credits.map((c) => ({
    credit_id: c.credit_id,
    resident_id: c.resident_id,
    resident_name: c.User?.name || `Resident #${c.resident_id}`,
    amount: Number(c.amount),
    status: c.status,
    created_at: c.created_at,
  })));
});

// GET /lgu/me/monthly-report?month=YYYY-MM (defaults to the current month) --
// the narrative "Auto-Generated Accomplishment Report": real counts for the
// selected calendar month, not a static all-time snapshot. Every figure here
// is directly queryable; there's deliberately no "AI Companion interactions"
// line, since /crisis-companion/chat never persists a row anywhere -- nothing
// backs that number honestly. Crisis escalations ARE real: a Crisis
// Companion / Voice Journal escalation creates a Booking with
// session_type = 'crisis' (see escalateCrisis()), so that's counted instead.
app.get('/lgu/me/monthly-report', requireAuth, requireRole('lgu'), async (req, res) => {
  const { data: me, error: meError } = await supabase
    .from('User')
    .select('barangay_id')
    .eq('user_id', req.user.user_id)
    .single();
  if (meError || !me) return res.status(404).json({ error: 'Account not found' });

  const { data: barangay, error: barangayError } = await supabase
    .from('Barangay')
    .select('barangay_id, name, city')
    .eq('barangay_id', me.barangay_id)
    .single();
  if (barangayError || !barangay) return res.status(404).json({ error: 'Barangay not found' });

  const monthParam = req.query.month; // 'YYYY-MM'
  const periodStart = monthParam ? new Date(`${monthParam}-01T00:00:00Z`) : new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);
  if (Number.isNaN(periodStart.getTime())) return res.status(400).json({ error: 'Invalid month' });
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const previousPeriodStart = new Date(periodStart);
  previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1);

  const { data: residents, error: residentsError } = await supabase
    .from('User')
    .select('user_id')
    .eq('role', 'resident')
    .eq('barangay_id', me.barangay_id);
  if (residentsError) return res.status(500).json({ error: residentsError.message });
  const residentIds = residents.map((r) => r.user_id);

  const { data: allBookings, error: bookingsError } = await supabase
    .from('Booking')
    .select('status, session_type, schedule, User(barangay_id)');
  if (bookingsError) return res.status(500).json({ error: bookingsError.message });
  const periodBookings = allBookings.filter((b) => {
    if (b.User?.barangay_id !== me.barangay_id) return false;
    const d = new Date(b.schedule);
    return d >= periodStart && d < periodEnd;
  });

  const { data: periodCredits, error: creditsError } = await supabase
    .from('Care_Credit')
    .select('amount, created_at')
    .eq('barangay_id', me.barangay_id)
    .gte('created_at', periodStart.toISOString())
    .lt('created_at', periodEnd.toISOString());
  if (creditsError) return res.status(500).json({ error: creditsError.message });

  let currentMoodByResident, previousMoodByResident;
  try {
    [currentMoodByResident, previousMoodByResident] = await Promise.all([
      getMoodInWindowByResident(periodStart, periodEnd),
      getMoodInWindowByResident(previousPeriodStart, periodStart),
    ]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const wellnessIndex = wellnessIndexFrom(residentIds, currentMoodByResident);
  const wellnessIndexPrevious = wellnessIndexFrom(residentIds, previousMoodByResident);

  res.json({
    barangay,
    period_label: periodStart.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
    resident_count: residentIds.length,
    sessions_requested: periodBookings.length,
    sessions_confirmed: periodBookings.filter((b) => b.status === 'confirmed').length,
    crisis_escalations: periodBookings.filter((b) => b.session_type === 'crisis').length,
    wellness_index: wellnessIndex,
    wellness_index_previous: wellnessIndexPrevious,
    wellness_index_delta: wellnessIndex != null && wellnessIndexPrevious != null ? wellnessIndex - wellnessIndexPrevious : null,
    care_credits_distributed: periodCredits.reduce((sum, c) => sum + Number(c.amount), 0),
  });
});

// GET /lgu/me/ai-effectiveness — real data behind the AI Effectiveness
// Tracker, scoped to this barangay's own residents:
//   - Detection: Voice Journal's risk_flag + the AI Crisis Companion's
//     AI_Detection_Log, combined. Labeled "detection rate", not "accuracy" --
//     there's no human-confirmed ground truth anywhere in this app to measure
//     true accuracy against, so claiming one would be fabricated.
//   - Escalation outcomes: real Booking rows with session_type = 'crisis'
//     (matched immediately), by status, plus Crisis_Requests rows (queued --
//     nobody was available) -- see escalateCrisis().
//   - Ratings: real AI_Rating rows residents submitted themselves.
app.get('/lgu/me/ai-effectiveness', requireAuth, requireRole('lgu'), async (req, res) => {
  const { data: me, error: meError } = await supabase
    .from('User')
    .select('barangay_id')
    .eq('user_id', req.user.user_id)
    .single();
  if (meError || !me) return res.status(404).json({ error: 'Account not found' });

  const { data: residents, error: residentsError } = await supabase
    .from('User')
    .select('user_id')
    .eq('role', 'resident')
    .eq('barangay_id', me.barangay_id);
  if (residentsError) return res.status(500).json({ error: residentsError.message });
  const residentIds = residents.map((r) => r.user_id);
  const idFilter = residentIds.length ? residentIds : [0];

  const [journalRes, chatLogRes, ratingRes, bookingRes, queueRes] = await Promise.all([
    supabase.from('Voice_Journal').select('risk_flag').in('user_id', idFilter),
    supabase.from('AI_Detection_Log').select('crisis_detected').in('user_id', idFilter),
    supabase.from('AI_Rating').select('rating').in('user_id', idFilter),
    supabase.from('Booking').select('status').in('resident_id', idFilter).eq('session_type', 'crisis'),
    supabase.from('Crisis_Requests').select('status').in('user_id', idFilter),
  ]);
  for (const r of [journalRes, chatLogRes, ratingRes, bookingRes, queueRes]) {
    if (r.error) return res.status(500).json({ error: r.error.message });
  }

  const journalEntries = journalRes.data;
  const chatTurns = chatLogRes.data;
  const ratings = ratingRes.data;
  const crisisBookings = bookingRes.data;
  const queuedRequests = queueRes.data;

  const journalFlagged = journalEntries.filter((j) => j.risk_flag).length;
  const chatFlagged = chatTurns.filter((c) => c.crisis_detected).length;
  const totalChecked = journalEntries.length + chatTurns.length;
  const totalFlagged = journalFlagged + chatFlagged;

  const ratingCount = ratings.length;
  const ratingAverage = ratingCount > 0
    ? Math.round((ratings.reduce((sum, r) => sum + r.rating, 0) / ratingCount) * 10) / 10
    : null;
  const ratingDistribution = [1, 2, 3, 4, 5].map((star) => ({
    star,
    count: ratings.filter((r) => r.rating === star).length,
  }));

  res.json({
    detection: {
      voice_journal: { total: journalEntries.length, flagged: journalFlagged },
      companion_chat: { total: chatTurns.length, flagged: chatFlagged },
      total_checked: totalChecked,
      total_flagged: totalFlagged,
      flag_rate: totalChecked > 0 ? Math.round((totalFlagged / totalChecked) * 100) : null,
    },
    escalations: {
      matched: crisisBookings.length,
      matched_by_status: {
        confirmed: crisisBookings.filter((b) => b.status === 'confirmed').length,
        pending: crisisBookings.filter((b) => b.status === 'pending').length,
        cancelled: crisisBookings.filter((b) => b.status === 'cancelled').length,
        declined: crisisBookings.filter((b) => b.status === 'declined').length,
      },
      queued: queuedRequests.length,
      total: crisisBookings.length + queuedRequests.length,
    },
    ratings: {
      count: ratingCount,
      average: ratingAverage,
      distribution: ratingDistribution,
    },
  });
});

// GET /lgu/me/data-governance — real data behind Data Governance & Consent,
// scoped to this barangay's own residents:
//   - Consent: coverage from Consent_Record (consent_type='assessment'),
//     tied to the one real consent gate in the app (see POST /assessment).
//     Residents who haven't taken an assessment yet simply have no record --
//     that's accurate, not a bug, and the page says so.
//   - Data access: which psychologists currently have a confirmed-booking
//     relationship with a resident here, and which Admin accounts exist
//     (Admin has platform-wide access by design). A real access OVERVIEW,
//     not a permission-editing tool -- there's no access-control system in
//     this app to toggle, so "manage" here means "see who can see this."
//   - Compliance: real, verifiable facts about this schema (RLS posture,
//     note-privacy guarantees already enforced elsewhere), not an invented
//     percentage against a compliance framework this app was never scored
//     against.
app.get('/lgu/me/data-governance', requireAuth, requireRole('lgu'), async (req, res) => {
  const { data: me, error: meError } = await supabase
    .from('User')
    .select('barangay_id')
    .eq('user_id', req.user.user_id)
    .single();
  if (meError || !me) return res.status(404).json({ error: 'Account not found' });

  const { data: residents, error: residentsError } = await supabase
    .from('User')
    .select('user_id')
    .eq('role', 'resident')
    .eq('barangay_id', me.barangay_id);
  if (residentsError) return res.status(500).json({ error: residentsError.message });
  const residentIds = residents.map((r) => r.user_id);
  const idFilter = residentIds.length ? residentIds : [0];

  const { data: consents, error: consentsError } = await supabase
    .from('Consent_Record')
    .select('user_id, consent_type, granted_at')
    .in('user_id', idFilter)
    .order('granted_at', { ascending: false });
  if (consentsError) return res.status(500).json({ error: consentsError.message });
  const consentedResidentIds = new Set(consents.map((c) => c.user_id));

  const { data: confirmedBookings, error: bookingsError } = await supabase
    .from('Booking')
    .select('resident_id, Psychologist(psychologist_id, User(name))')
    .in('resident_id', idFilter)
    .eq('status', 'confirmed');
  if (bookingsError) return res.status(500).json({ error: bookingsError.message });

  const residentsByPsychologist = new Map();
  for (const b of confirmedBookings) {
    const psychId = b.Psychologist?.psychologist_id;
    if (!psychId) continue;
    if (!residentsByPsychologist.has(psychId)) {
      residentsByPsychologist.set(psychId, { name: b.Psychologist.User?.name || `Psychologist #${psychId}`, residentIds: new Set() });
    }
    residentsByPsychologist.get(psychId).residentIds.add(b.resident_id);
  }
  const psychologistsWithAccess = [...residentsByPsychologist.values()].map((p) => ({
    name: p.name,
    resident_count: p.residentIds.size,
  }));

  const { data: adminAccounts, error: adminError } = await supabase
    .from('User')
    .select('name')
    .eq('role', 'admin');
  if (adminError) return res.status(500).json({ error: adminError.message });

  const consentCoverage = residentIds.length > 0
    ? Math.round((consentedResidentIds.size / residentIds.length) * 100)
    : null;

  res.json({
    consent: {
      resident_count: residentIds.length,
      residents_with_consent: consentedResidentIds.size,
      coverage_percent: consentCoverage,
      total_records: consents.length,
      recent: consents.slice(0, 10),
    },
    data_access: {
      psychologists: psychologistsWithAccess,
      admin_account_count: adminAccounts.length,
    },
    compliance: {
      consent_coverage_percent: consentCoverage,
      facts: [
        'Every database table is protected by Row Level Security; only the backend service role can read or write data directly.',
        'Psychologist session notes are private to the psychologist who wrote them -- never visible to the resident, other psychologists, or LGU/Admin accounts.',
        'An LGU account only ever sees aggregated, anonymized figures for barangays other than its own -- never another barangay\'s individual residents.',
        'Resident Inquiries are private to the resident and the one psychologist they contacted -- no other resident, psychologist, or LGU/Admin account can read them.',
      ],
    },
  });
});

// GET /lgu/me/residents — the logged-in LGU's own barangay residents, with
// their latest check-in date and flag status. Real names are shown here
// (unlike the psychologist-facing anonymization) since this IS the local
// government responsible for these specific named residents.
app.get('/lgu/me/residents', requireAuth, requireRole('lgu'), async (req, res) => {
  const { data: me, error: meError } = await supabase
    .from('User')
    .select('barangay_id')
    .eq('user_id', req.user.user_id)
    .single();
  if (meError || !me) return res.status(404).json({ error: 'Account not found' });

  const { data: residents, error: residentsError } = await supabase
    .from('User')
    .select('user_id, name, email, status, created_at')
    .eq('role', 'resident')
    .eq('barangay_id', me.barangay_id)
    .order('name', { ascending: true });
  if (residentsError) return res.status(500).json({ error: residentsError.message });

  let safetyFlagByResident, moodByResident, manualFlagByResident;
  try {
    [safetyFlagByResident, moodByResident, manualFlagByResident] = await Promise.all([
      getLatestSafetyFlagByResident(),
      getRecentMoodByResident(),
      getActiveManualFlagsByResident(),
    ]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const residentIds = residents.map((r) => r.user_id);
  const { data: lastMoodDates, error: moodDatesError } = await supabase
    .from('Mood_Entry')
    .select('user_id, entry_date')
    .in('user_id', residentIds.length ? residentIds : [0])
    .order('entry_date', { ascending: false });
  if (moodDatesError) return res.status(500).json({ error: moodDatesError.message });
  const lastCheckInByUser = new Map();
  for (const m of lastMoodDates) {
    if (!lastCheckInByUser.has(m.user_id)) lastCheckInByUser.set(m.user_id, m.entry_date);
  }

  res.json(residents.map((r) => {
    const manualFlag = manualFlagByResident.get(r.user_id);
    const autoFlagged = safetyFlagByResident.get(r.user_id) === true;
    return {
      user_id: r.user_id,
      name: r.name,
      email: r.email,
      status: r.status,
      created_at: r.created_at,
      last_check_in: lastCheckInByUser.get(r.user_id) || null,
      recent_mood_level: moodByResident.get(r.user_id) ?? null,
      auto_flagged: autoFlagged,
      manually_flagged: !!manualFlag,
      manual_flag_reason: manualFlag?.reason || null,
      flagged: autoFlagged || !!manualFlag,
    };
  }));
});

// POST /lgu/me/residents/:residentId/flag — "Flag High-Risk Cases": a manual
// flag the LGU raises itself (a field report, a home visit), independent of
// the resident's own check-in. body: { reason } optional. Upserts: raising a
// flag on an already-actively-flagged resident just updates the reason.
app.post('/lgu/me/residents/:residentId/flag', requireAuth, requireRole('lgu'), async (req, res) => {
  const { reason } = req.body;
  const residentId = Number(req.params.residentId);

  const { data: me, error: meError } = await supabase
    .from('User')
    .select('barangay_id')
    .eq('user_id', req.user.user_id)
    .single();
  if (meError || !me) return res.status(404).json({ error: 'Account not found' });

  const { data: resident, error: residentError } = await supabase
    .from('User')
    .select('user_id, barangay_id')
    .eq('user_id', residentId)
    .eq('role', 'resident')
    .single();
  if (residentError || !resident) return res.status(404).json({ error: 'Resident not found' });
  if (resident.barangay_id !== me.barangay_id) {
    return res.status(403).json({ error: 'This resident is not registered under your barangay' });
  }

  const { data: existing } = await supabase
    .from('LGU_Risk_Flag')
    .select('flag_id')
    .eq('resident_id', residentId)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('LGU_Risk_Flag')
      .update({ reason: reason || null })
      .eq('flag_id', existing.flag_id)
      .select();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data[0]);
  }

  const { data, error } = await supabase
    .from('LGU_Risk_Flag')
    .insert([{ resident_id: residentId, barangay_id: me.barangay_id, flagged_by: req.user.user_id, reason: reason || null }])
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

// DELETE /lgu/me/residents/:residentId/flag — resolves the active manual
// flag (if any). The automatic safety_flag signal, if present, is untouched
// -- this only clears the LGU's own manual judgment call.
app.delete('/lgu/me/residents/:residentId/flag', requireAuth, requireRole('lgu'), async (req, res) => {
  const residentId = Number(req.params.residentId);

  const { data: me, error: meError } = await supabase
    .from('User')
    .select('barangay_id')
    .eq('user_id', req.user.user_id)
    .single();
  if (meError || !me) return res.status(404).json({ error: 'Account not found' });

  const { data: existing, error: existingError } = await supabase
    .from('LGU_Risk_Flag')
    .select('flag_id, barangay_id')
    .eq('resident_id', residentId)
    .eq('status', 'active')
    .maybeSingle();
  if (existingError) return res.status(500).json({ error: existingError.message });
  if (!existing) return res.status(404).json({ error: 'No active flag for this resident' });
  if (existing.barangay_id !== me.barangay_id) {
    return res.status(403).json({ error: 'This resident is not registered under your barangay' });
  }

  const { error } = await supabase
    .from('LGU_Risk_Flag')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('flag_id', existing.flag_id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ resolved: true });
});

// POST /lgu/me/care-credits/issue — like /care-credits/allocate, but for the
// LGU role: always scoped to the caller's own barangay, never a barangay_id
// from the request body. body: { resident_id } to fund just one (must belong
// to this barangay), or {} / { all: true } to fund every resident here.
app.post('/lgu/me/care-credits/issue', requireAuth, requireRole('lgu'), async (req, res) => {
  const { resident_id, amount } = req.body;

  const numericAmount = Number(amount);
  if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const { data: me, error: meError } = await supabase
    .from('User')
    .select('barangay_id')
    .eq('user_id', req.user.user_id)
    .single();
  if (meError || !me) return res.status(404).json({ error: 'Account not found' });

  const handleAllocationError = (error, res) => {
    if (error.message === 'RESIDENT_NOT_FOUND') return res.status(404).json({ error: 'Resident not found' });
    if (error.message === 'SUBSCRIPTION_INACTIVE') return res.status(400).json({ error: "Your barangay's subscription is not active" });
    if (error.message === 'NO_BUDGET_FOR_BARANGAY') return res.status(400).json({ error: 'Your barangay has no funded budget yet' });
    if (error.message === 'INSUFFICIENT_BUDGET') return res.status(400).json({ error: 'Insufficient remaining budget' });
    return res.status(500).json({ error: error.message });
  };

  if (resident_id) {
    const { data: resident, error: residentError } = await supabase
      .from('User')
      .select('user_id, barangay_id')
      .eq('user_id', resident_id)
      .eq('role', 'resident')
      .single();
    if (residentError || !resident) return res.status(404).json({ error: 'Resident not found' });
    if (resident.barangay_id !== me.barangay_id) {
      return res.status(403).json({ error: 'This resident is not registered under your barangay' });
    }

    const { data, error } = await supabase.rpc('allocate_care_credit_single', {
      p_resident_id: resident_id,
      p_amount: numericAmount,
    });
    if (error) return handleAllocationError(error, res);
    return res.status(201).json({ credits_issued: 1, total_amount: numericAmount, credits: [data] });
  }

  const { data, error } = await supabase.rpc('allocate_care_credits_bulk', {
    p_barangay_id: me.barangay_id,
    p_amount: numericAmount,
  });
  if (error) return handleAllocationError(error, res);
  res.status(201).json(data);
});

const HEATMAP_RANGE_DAYS = { week: 7, month: 30, quarter: 90 };

// Shared by the LGU citywide overview and the Admin full heatmap: every
// barangay's risk band for a given lookback window, based on DISTINCT
// residents who raised >=1 safety flag within that window, UNION any
// resident the barangay has manually flagged (an ongoing status, not a
// dated event, so it counts regardless of the selected window) -- so "This
// Week" vs "This Month" vs "This Quarter" change the check-in side, not the
// manual side. recent_flag_count is the raw count of flagged
// Assessment_Result rows in the window (a density signal; can exceed
// resident_count if the same resident flags more than once).
async function computeCitywideOverview(rangeDays) {
  const { data: barangays, error: barangaysError } = await supabase
    .from('Barangay')
    .select('barangay_id, name, city');
  if (barangaysError) throw barangaysError;

  const { data: residents, error: residentsError } = await supabase
    .from('User')
    .select('user_id, barangay_id')
    .eq('role', 'resident');
  if (residentsError) throw residentsError;

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - rangeDays);
  const { data: windowFlags, error: windowFlagsError } = await supabase
    .from('Assessment_Result')
    .select('user_id, created_at')
    .eq('safety_flag', true)
    .gte('created_at', windowStart.toISOString());
  if (windowFlagsError) throw windowFlagsError;

  const manualFlagByResident = await getActiveManualFlagsByResident();

  const residentsByBarangay = new Map();
  for (const r of residents) {
    if (!residentsByBarangay.has(r.barangay_id)) residentsByBarangay.set(r.barangay_id, []);
    residentsByBarangay.get(r.barangay_id).push(r.user_id);
  }
  const flaggedUserIdsInWindow = new Set(windowFlags.map((f) => f.user_id));
  const flagEventCountByUser = new Map();
  for (const f of windowFlags) {
    flagEventCountByUser.set(f.user_id, (flagEventCountByUser.get(f.user_id) || 0) + 1);
  }

  return barangays.map((b) => {
    const ids = residentsByBarangay.get(b.barangay_id) || [];
    const flaggedCount = ids.filter((id) => flaggedUserIdsInWindow.has(id) || manualFlagByResident.has(id)).length;
    const recentFlagCount = ids.reduce((sum, id) => sum + (flagEventCountByUser.get(id) || 0), 0);
    return {
      barangay_id: b.barangay_id,
      name: b.name,
      city: b.city,
      resident_count: ids.length,
      high_risk_count: flaggedCount,
      recent_flag_count: recentFlagCount,
      risk_band: riskBandFor(flaggedCount, ids.length),
    };
  });
}

// ===========================================================================
// Subscription lifecycle: manual renewal with admin approval.
// See db/subscription_renewals.sql.
//
//   Barangay picks a plan -> request (pending)
//   Admin approves        -> approved (payment still required) | scheduled (free plan)
//   Barangay submits payment details (optional) -> admin verifies -> scheduled
//   Current term ends     -> activate_subscription_request(): new term + plan
//                            Care Credits added to the Budget exactly once
//   No scheduled renewal  -> expire_subscription(): status 'expired', no new
//                            funding / Care Credit issuance (the existing
//                            SUBSCRIPTION_INACTIVE checks), nothing deleted.
// Nothing is ever auto-charged or auto-renewed. The lifecycle runs on a server
// timer and again (scoped) before every subscription read, so status is
// always computed from real server-side dates.
// ===========================================================================
const SUB_REMINDER_DAYS = [30, 15, 7];
const SUB_EXPIRING_SOON_DAYS = 30;
const OPEN_REQUEST_STATUSES = ['pending', 'approved', 'scheduled'];
const SUB_MIN_REASON = 5;
const DAY_MS = 86400000;

const fmtSubDate = (d) => (d ? new Date(d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : '');

function subscriptionMigrationError(error) {
  return /Subscription_Request|Subscription_Credit_Issuance|Subscription_Reminder|activate_subscription_request|expire_subscription|features/i.test(error?.message || '')
    ? 'The subscription renewal migration has not been run yet (db/subscription_renewals.sql).'
    : error?.message;
}

async function logSubscriptionHistory(row) {
  const { error } = await supabase.from('Subscription_History').insert([row]);
  if (error) console.error('[subscription] history log failed:', error.message);
}

async function notifyBarangay(barangayId, title, body) {
  const lguUserId = await getLguUserIdForBarangay(barangayId);
  if (!lguUserId) return;
  const { error } = await supabase.from('Notification').insert([{
    user_id: lguUserId, type: 'system', title, body, link: '/lgu/subscription', read: false,
  }]);
  if (error) console.error('[subscription] notify barangay failed:', error.message);
}

async function notifySubscriptionAdmins(title, body) {
  const { data: admins } = await supabase.from('User').select('user_id').eq('role', 'admin');
  if (!admins?.length) return;
  const { error } = await supabase.from('Notification').insert(admins.map((a) => ({
    user_id: a.user_id, type: 'system', title, body, link: '/admin/subscriptions', read: false,
  })));
  if (error) console.error('[subscription] notify admins failed:', error.message);
}

async function barangayNameOf(barangayId) {
  const { data } = await supabase.from('Barangay').select('name').eq('barangay_id', barangayId).maybeSingle();
  return data?.name ? `Barangay ${String(data.name).replace(/^Barangay\s+/i, '')}` : `Barangay #${barangayId}`;
}

function daysUntil(date, now = new Date()) {
  return Math.ceil((new Date(date) - now) / DAY_MS);
}

// The status a person should see. Stored statuses are active / expired /
// cancelled / inactive; "Expiring Soon" and "Pending Renewal" are derived.
function subscriptionDisplayStatus(sub, openRequest, now = new Date()) {
  if (!sub || !sub.status || sub.status === 'inactive') return 'none';
  if (sub.status === 'cancelled') return 'cancelled';
  if (sub.status === 'expired' || sub.status === 'past_due') return 'expired';
  if (sub.expires_at && daysUntil(sub.expires_at, now) <= SUB_EXPIRING_SOON_DAYS) {
    return openRequest ? 'pending_renewal' : 'expiring_soon';
  }
  return 'active';
}

async function activateRequest(requestId) {
  const { data, error } = await supabase.rpc('activate_subscription_request', { p_request_id: requestId });
  if (error) {
    // Expected races / not-yet states are not failures.
    if (!/REQUEST_NOT_SCHEDULED|CURRENT_STILL_ACTIVE|PAYMENT_NOT_VERIFIED|duplicate key/i.test(error.message)) {
      console.error('[subscription] activation failed:', error.message);
    }
    return null;
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) return null;
  const name = await barangayNameOf(result.barangay_id);
  await notifyBarangay(result.barangay_id, 'Subscription activated',
    `Your ${result.plan_name} subscription is now active until ${fmtSubDate(result.period_end)}. `
    + `${Number(result.care_credits).toLocaleString()} Care Credits have been added to your barangay's budget.`);
  await notifySubscriptionAdmins('Subscription activation completed',
    `${name}'s ${result.plan_name} subscription is now active (${fmtSubDate(result.period_start)} – ${fmtSubDate(result.period_end)}). `
    + `${Number(result.care_credits).toLocaleString()} Care Credits issued.`);
  return result;
}

let lifecycleRunning = null;
let lifecycleMigrationWarned = false;

// Expire / activate / remind. Every write is conditional (or a UNIQUE insert),
// so overlapping runs and repeated runs are harmless.
async function runSubscriptionLifecycle({ barangayId } = {}) {
  if (lifecycleRunning) {
    await lifecycleRunning.catch(() => {});
    if (!barangayId) return;
  }
  const run = (async () => {
    const now = new Date();

    let subsQuery = supabase.from('Subscription').select('*');
    let reqQuery = supabase.from('Subscription_Request').select('*').in('status', OPEN_REQUEST_STATUSES);
    if (barangayId) {
      subsQuery = subsQuery.eq('barangay_id', barangayId);
      reqQuery = reqQuery.eq('barangay_id', barangayId);
    }
    const [{ data: subs, error: subsError }, { data: openReqs, error: reqError }] = await Promise.all([subsQuery, reqQuery]);
    if (subsError) throw subsError;
    if (reqError) {
      if (!lifecycleMigrationWarned) {
        console.warn('[subscription] lifecycle skipped:', subscriptionMigrationError(reqError));
        lifecycleMigrationWarned = true;
      }
      return;
    }

    const subByBarangay = new Map((subs || []).map((s) => [String(s.barangay_id), s]));
    const reqByBarangay = new Map((openReqs || []).map((r) => [String(r.barangay_id), r]));

    // 1. Terms that have ended: activate the scheduled renewal, or expire.
    for (const sub of subs || []) {
      if (sub.status !== 'active' || !sub.expires_at || new Date(sub.expires_at) > now) continue;
      const req = reqByBarangay.get(String(sub.barangay_id));
      if (req?.status === 'scheduled') {
        const activated = await activateRequest(req.request_id);
        if (activated) { reqByBarangay.delete(String(sub.barangay_id)); continue; }
      }
      const { data: expired, error } = await supabase.rpc('expire_subscription', { p_subscription_id: sub.subscription_id });
      if (error) { console.error('[subscription] expire failed:', error.message); continue; }
      if (expired === true) {
        const name = await barangayNameOf(sub.barangay_id);
        const pending = req && req.status !== 'scheduled';
        await notifyBarangay(sub.barangay_id, 'Subscription expired',
          `Your ${sub.plan_name || 'OpenUp'} subscription expired on ${fmtSubDate(sub.expires_at)}. New funding and Care Credit issuance are paused. `
          + (pending
            ? 'Your renewal request is still being processed and will activate once it is approved and payment is verified.'
            : 'Visit the Subscription page to request a new subscription.'));
        await notifySubscriptionAdmins('Barangay subscription expired',
          `${name}'s ${sub.plan_name || ''} subscription expired on ${fmtSubDate(sub.expires_at)}${pending ? ' (a renewal request is still open)' : ' with no scheduled renewal'}.`);
      }
    }

    // 2. Scheduled requests for barangays with no running term start now.
    for (const req of reqByBarangay.values()) {
      if (req.status !== 'scheduled') continue;
      const sub = subByBarangay.get(String(req.barangay_id));
      const running = sub && sub.status === 'active' && sub.expires_at && new Date(sub.expires_at) > now;
      if (!running) await activateRequest(req.request_id);
    }

    // 3. 30 / 15 / 7-day reminders -- once per term per interval, and not at
    //    all once a renewal has been approved.
    for (const sub of subs || []) {
      if (sub.status !== 'active' || !sub.expires_at) continue;
      const left = daysUntil(sub.expires_at, now);
      if (left <= 0 || left > SUB_REMINDER_DAYS[0]) continue;
      const req = reqByBarangay.get(String(sub.barangay_id));
      if (req && (req.status === 'approved' || req.status === 'scheduled')) continue;

      const threshold = Math.min(...SUB_REMINDER_DAYS.filter((d) => left <= d));
      const { data: sent } = await supabase
        .from('Subscription_Reminder').select('days_before')
        .eq('subscription_id', sub.subscription_id).eq('term_expires_at', sub.expires_at);
      if ((sent || []).some((r) => r.days_before <= threshold)) continue;

      const { error: insError } = await supabase.from('Subscription_Reminder').insert([{
        barangay_id: sub.barangay_id, subscription_id: sub.subscription_id,
        term_expires_at: sub.expires_at, days_before: threshold,
      }]);
      if (insError) continue; // UNIQUE: another run already sent it

      const planLabel = sub.plan_name ? sub.plan_name.replace(/\s*plan$/i, '') : 'OpenUp';
      await notifyBarangay(sub.barangay_id, `Subscription expires in ${left} day${left === 1 ? '' : 's'}`,
        `Your ${planLabel} Subscription will expire in ${left} day${left === 1 ? '' : 's'} (on ${fmtSubDate(sub.expires_at)}). `
        + (req
          ? 'Your renewal request is still awaiting approval.'
          : 'Please review the available subscription plans and submit your renewal request to continue enjoying OpenUp services.'));
      if (threshold === 7) {
        const name = await barangayNameOf(sub.barangay_id);
        await notifySubscriptionAdmins('Barangay subscription nearing expiration',
          `${name}'s ${sub.plan_name || ''} subscription expires on ${fmtSubDate(sub.expires_at)}`
          + `${req ? ` (renewal request ${req.status === 'pending' ? 'awaiting your approval' : req.status})` : ' and no renewal has been requested'}.`);
      }
    }
  })();

  if (!barangayId) lifecycleRunning = run;
  try {
    await run;
  } finally {
    if (!barangayId) lifecycleRunning = null;
  }
}

// Reads call this first; a lifecycle failure must never break the page.
async function syncSubscriptions(barangayId) {
  try { await runSubscriptionLifecycle(barangayId ? { barangayId } : {}); } catch (err) {
    console.error('[subscription] lifecycle error:', err.message);
  }
}

// Server-side scheduler. Render's free tier can sleep, so the read-time sync
// above is the backstop; whichever runs first does the work, exactly once.
setTimeout(() => syncSubscriptions(), 15 * 1000);
setInterval(() => syncSubscriptions(), 15 * 60 * 1000);

async function remainingCreditsOf(barangayId) {
  const { data } = await supabase.from('Budget').select('total_funded, total_spent').eq('barangay_id', barangayId).maybeSingle();
  if (!data) return { total_funded: 0, total_spent: 0, remaining: 0 };
  const funded = Number(data.total_funded || 0);
  const spent = Number(data.total_spent || 0);
  return { total_funded: funded, total_spent: spent, remaining: funded - spent };
}

function serializeSubscription(sub, openRequest, credits, now = new Date()) {
  const display = subscriptionDisplayStatus(sub, openRequest, now);
  return {
    subscription_id: sub?.subscription_id || null,
    plan_id: sub?.plan_id || null,
    plan_name: sub?.plan_name || sub?.plan || null,
    price: sub?.price ?? null,
    care_credits: sub?.care_credits ?? null,
    validity_months: sub?.validity_months ?? null,
    status: sub?.status === 'past_due' ? 'expired' : (sub?.status || 'inactive'),
    display_status: display,
    started_at: sub?.started_at || null,
    expires_at: sub?.expires_at || null,
    renewed_at: sub?.renewed_at || null,
    days_remaining: sub?.status === 'active' && sub?.expires_at ? Math.max(0, daysUntil(sub.expires_at, now)) : null,
    term_days: sub?.started_at && sub?.expires_at ? Math.max(1, Math.round((new Date(sub.expires_at) - new Date(sub.started_at)) / DAY_MS)) : null,
    renewal_due: display === 'expiring_soon' || display === 'pending_renewal',
    remaining_credits: credits ? credits.remaining : null,
    credits_funded: credits ? credits.total_funded : null,
    credits_spent: credits ? credits.total_spent : null,
  };
}

// --------------------------- Barangay (LGU) --------------------------------

// GET /lgu/me/subscription-plans — the active catalog a barangay can browse.
app.get('/lgu/me/subscription-plans', requireAuth, requireRole('lgu'), async (req, res) => {
  const { data, error } = await supabase
    .from('Subscription_Plan')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /lgu/me/subscription — current term (with derived status, days left and
// remaining Care Credits) plus the open upcoming request, if any.
app.get('/lgu/me/subscription', requireAuth, requireRole('lgu'), async (req, res) => {
  const barangayId = await getOwnBarangayId(req.user.user_id);
  if (!barangayId) return res.status(404).json({ error: 'Account not found' });
  await syncSubscriptions(barangayId);

  const [{ data: sub, error }, { data: requests, error: reqError }, credits] = await Promise.all([
    supabase.from('Subscription').select('*').eq('barangay_id', barangayId).maybeSingle(),
    supabase.from('Subscription_Request').select('*').eq('barangay_id', barangayId).order('requested_at', { ascending: false }).limit(5),
    remainingCreditsOf(barangayId),
  ]);
  if (error) return res.status(500).json({ error: error.message });

  const open = (requests || []).find((r) => OPEN_REQUEST_STATUSES.includes(r.status)) || null;
  // Most recent closed request, so a rejection reason stays visible until the
  // barangay submits a new one.
  const lastClosed = !open ? (requests || []).find((r) => ['rejected', 'cancelled'].includes(r.status)) || null : null;

  res.json({
    ...serializeSubscription(sub, open, credits),
    upcoming: open,
    last_closed_request: lastClosed,
    // Before db/subscription_renewals.sql runs, the page still shows the
    // current subscription and explains why renewals are unavailable.
    setup_error: reqError ? subscriptionMigrationError(reqError) : null,
  });
});

// GET /lgu/me/subscription/requests — every request this barangay ever made.
app.get('/lgu/me/subscription/requests', requireAuth, requireRole('lgu'), async (req, res) => {
  const barangayId = await getOwnBarangayId(req.user.user_id);
  if (!barangayId) return res.status(404).json({ error: 'Account not found' });
  const { data, error } = await supabase
    .from('Subscription_Request').select('*').eq('barangay_id', barangayId).order('requested_at', { ascending: false });
  if (error) return res.status(500).json({ error: subscriptionMigrationError(error) });
  res.json(data);
});

// GET /lgu/me/subscription/credit-issuances — Care Credits issued per term.
app.get('/lgu/me/subscription/credit-issuances', requireAuth, requireRole('lgu'), async (req, res) => {
  const barangayId = await getOwnBarangayId(req.user.user_id);
  if (!barangayId) return res.status(404).json({ error: 'Account not found' });
  const { data, error } = await supabase
    .from('Subscription_Credit_Issuance').select('*').eq('barangay_id', barangayId).order('issued_at', { ascending: false });
  if (error) return res.status(500).json({ error: subscriptionMigrationError(error) });
  res.json(data);
});

// POST /lgu/me/subscription/requests — body: { plan_id, confirm: true }.
// Submits a request for the barangay's next (or first) plan. Never activates
// anything and never touches the current term.
app.post('/lgu/me/subscription/requests', requireAuth, requireRole('lgu'), async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: 'Please confirm the request.' });
  const planId = Number(req.body.plan_id);
  if (!planId) return res.status(400).json({ error: 'plan_id is required' });

  const barangayId = await getOwnBarangayId(req.user.user_id);
  if (!barangayId) return res.status(404).json({ error: 'Account not found' });
  await syncSubscriptions(barangayId);

  const { data: plan } = await supabase.from('Subscription_Plan').select('*').eq('plan_id', planId).eq('is_active', true).maybeSingle();
  if (!plan) return res.status(404).json({ error: 'Plan not found or no longer available' });

  const { data: existingOpen, error: openError } = await supabase
    .from('Subscription_Request').select('request_id, status').eq('barangay_id', barangayId).in('status', OPEN_REQUEST_STATUSES).limit(1);
  if (openError) return res.status(500).json({ error: subscriptionMigrationError(openError) });
  if (existingOpen?.length) {
    return res.status(409).json({ error: 'You already have an upcoming subscription request. Cancel it first to choose a different plan.' });
  }

  const { data: sub } = await supabase.from('Subscription').select('*').eq('barangay_id', barangayId).maybeSingle();
  const running = sub?.status === 'active' && sub.expires_at && new Date(sub.expires_at) > new Date();

  const { data, error } = await supabase.from('Subscription_Request').insert([{
    barangay_id: barangayId,
    plan_id: plan.plan_id,
    plan_name: plan.name,
    price: plan.price,
    care_credits: plan.care_credits,
    validity_months: plan.validity_months,
    kind: sub?.plan_id || sub?.plan_name ? 'renewal' : 'new',
    requested_by: req.user.user_id,
    expected_activation_at: running ? sub.expires_at : null,
  }]).select().single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'You already have an upcoming subscription request.' });
    return res.status(500).json({ error: subscriptionMigrationError(error) });
  }

  await logSubscriptionHistory({
    barangay_id: barangayId, plan_id: plan.plan_id, plan_name: plan.name, action: 'request_submitted',
    status: 'pending', price: plan.price, actor_role: 'lgu', actor_user_id: req.user.user_id,
    request_id: data.request_id, care_credits: plan.care_credits,
  });
  const name = await barangayNameOf(barangayId);
  await notifyBarangay(barangayId, 'Renewal request submitted',
    `Your request for the ${plan.name} was submitted and is awaiting admin review.`
    + (running ? ` Your current subscription stays active until ${fmtSubDate(sub.expires_at)}.` : ''));
  await notifySubscriptionAdmins('New subscription renewal request',
    `${name} requested the ${plan.name} (₱${Number(plan.price).toLocaleString()}, ${Number(plan.care_credits).toLocaleString()} Care Credits).`);
  res.status(201).json(data);
});

async function loadOwnRequest(req, res) {
  const barangayId = await getOwnBarangayId(req.user.user_id);
  if (!barangayId) { res.status(404).json({ error: 'Account not found' }); return null; }
  const { data, error } = await supabase
    .from('Subscription_Request').select('*').eq('request_id', req.params.id).eq('barangay_id', barangayId).maybeSingle();
  if (error) { res.status(500).json({ error: subscriptionMigrationError(error) }); return null; }
  if (!data) { res.status(404).json({ error: 'Request not found' }); return null; }
  return data;
}

// POST /lgu/me/subscription/requests/:id/cancel — body: { confirm: true }.
// Allowed while pending, or approved but not yet paid. Once payment is
// verified (scheduled) only an admin can cancel. The current term is never touched.
app.post('/lgu/me/subscription/requests/:id/cancel', requireAuth, requireRole('lgu'), async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: 'Please confirm the cancellation.' });
  const request = await loadOwnRequest(req, res);
  if (!request) return;
  if (request.status === 'scheduled') {
    return res.status(409).json({ error: 'Payment for this request has already been verified. Contact the OpenUp admin to cancel it.' });
  }
  if (!['pending', 'approved'].includes(request.status)) {
    return res.status(409).json({ error: `This request is already ${request.status}.` });
  }

  const { data, error } = await supabase.from('Subscription_Request')
    .update({ status: 'cancelled', cancelled_by: req.user.user_id, cancelled_by_role: 'lgu', cancelled_at: new Date().toISOString() })
    .eq('request_id', request.request_id).eq('status', request.status).select().single();
  if (error || !data) return res.status(409).json({ error: 'This request changed. Reload and try again.' });

  await logSubscriptionHistory({
    barangay_id: request.barangay_id, plan_id: request.plan_id, plan_name: request.plan_name, action: 'request_cancelled',
    status: 'cancelled', price: request.price, actor_role: 'lgu', actor_user_id: req.user.user_id, request_id: request.request_id,
  });
  const name = await barangayNameOf(request.barangay_id);
  await notifyBarangay(request.barangay_id, 'Upcoming subscription cancelled',
    `Your request for the ${request.plan_name} was cancelled. Your current subscription is unchanged.`);
  await notifySubscriptionAdmins('Subscription request cancelled', `${name} cancelled their request for the ${request.plan_name}.`);
  res.json(data);
});

// POST /lgu/me/subscription/requests/:id/payment — body: { reference, note? }.
// The barangay records how it paid (OR / bank / transfer reference) so an
// admin can verify it. Recording a reference never activates anything.
app.post('/lgu/me/subscription/requests/:id/payment', requireAuth, requireRole('lgu'), async (req, res) => {
  const reference = String(req.body?.reference || '').trim();
  const note = req.body?.note ? String(req.body.note).trim().slice(0, 500) : null;
  if (reference.length < 3 || reference.length > 100) return res.status(400).json({ error: 'Enter the payment reference number (3-100 characters).' });

  const request = await loadOwnRequest(req, res);
  if (!request) return;
  if (request.status !== 'approved' || !['unpaid', 'submitted'].includes(request.payment_status)) {
    return res.status(409).json({ error: 'Payment details can only be sent for an approved request that is awaiting payment.' });
  }

  const { data, error } = await supabase.from('Subscription_Request')
    .update({ payment_status: 'submitted', payment_reference: reference, payment_note: note, payment_submitted_at: new Date().toISOString() })
    .eq('request_id', request.request_id).eq('status', 'approved').select().single();
  if (error || !data) return res.status(409).json({ error: 'This request changed. Reload and try again.' });

  await logSubscriptionHistory({
    barangay_id: request.barangay_id, plan_id: request.plan_id, plan_name: request.plan_name, action: 'payment_submitted',
    status: 'approved', price: request.price, actor_role: 'lgu', actor_user_id: req.user.user_id, request_id: request.request_id,
    note: `Reference ${reference}`,
  });
  const name = await barangayNameOf(request.barangay_id);
  await notifySubscriptionAdmins('Payment awaiting verification',
    `${name} submitted payment details (ref. ${reference}) for the ${request.plan_name} — ₱${Number(request.price).toLocaleString()}.`);
  res.json(data);
});

// ------------------------------- Admin -------------------------------------

// GET /admin/subscription-requests — every request with barangay + current term.
app.get('/admin/subscription-requests', requireAuth, requireRole('admin'), async (req, res) => {
  await syncSubscriptions();
  const [{ data: requests, error }, { data: barangays }, { data: subs }] = await Promise.all([
    supabase.from('Subscription_Request').select('*').order('requested_at', { ascending: false }),
    supabase.from('Barangay').select('barangay_id, name, city'),
    supabase.from('Subscription').select('barangay_id, plan_name, plan, status, expires_at'),
  ]);
  if (error) return res.status(500).json({ error: subscriptionMigrationError(error) });
  const bById = new Map((barangays || []).map((b) => [String(b.barangay_id), b]));
  const sById = new Map((subs || []).map((s) => [String(s.barangay_id), s]));
  res.json((requests || []).map((r) => {
    const s = sById.get(String(r.barangay_id));
    return {
      ...r,
      barangay_name: bById.get(String(r.barangay_id))?.name || `#${r.barangay_id}`,
      barangay_city: bById.get(String(r.barangay_id))?.city || null,
      current_plan: s?.plan_name || s?.plan || null,
      current_status: s ? (s.status === 'past_due' ? 'expired' : s.status) : 'inactive',
      current_expires_at: s?.expires_at || null,
    };
  }));
});

// GET /admin/subscription-requests/:id — full review payload.
app.get('/admin/subscription-requests/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { data: request, error } = await supabase.from('Subscription_Request').select('*').eq('request_id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: subscriptionMigrationError(error) });
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const [{ data: barangay }, { data: sub }, { data: lgu }, credits, { data: history }] = await Promise.all([
    supabase.from('Barangay').select('barangay_id, name, city').eq('barangay_id', request.barangay_id).maybeSingle(),
    supabase.from('Subscription').select('*').eq('barangay_id', request.barangay_id).maybeSingle(),
    supabase.from('User').select('user_id, name, email, status, created_at').eq('role', 'lgu').eq('barangay_id', request.barangay_id).maybeSingle(),
    remainingCreditsOf(request.barangay_id),
    supabase.from('Subscription_History').select('*').eq('request_id', request.request_id).order('created_at', { ascending: true }),
  ]);

  const actorIds = [...new Set([request.requested_by, request.approved_by, request.rejected_by, request.cancelled_by, request.payment_verified_by].filter(Boolean))];
  const names = {};
  if (actorIds.length) {
    const { data: actors } = await supabase.from('User').select('user_id, name').in('user_id', actorIds);
    (actors || []).forEach((a) => { names[a.user_id] = a.name; });
  }

  res.json({
    request: {
      ...request,
      requested_by_name: names[request.requested_by] || null,
      approved_by_name: names[request.approved_by] || null,
      rejected_by_name: names[request.rejected_by] || null,
      cancelled_by_name: names[request.cancelled_by] || null,
      payment_verified_by_name: names[request.payment_verified_by] || null,
    },
    barangay,
    lgu_account: lgu || null,
    current: serializeSubscription(sub, null, credits),
    history: history || [],
  });
});

async function loadRequestForDecision(req, res, allowed) {
  if (req.body?.confirm !== true) { res.status(400).json({ error: 'This action must be explicitly confirmed.' }); return null; }
  const { data, error } = await supabase.from('Subscription_Request').select('*').eq('request_id', req.params.id).maybeSingle();
  if (error) { res.status(500).json({ error: subscriptionMigrationError(error) }); return null; }
  if (!data) { res.status(404).json({ error: 'Request not found' }); return null; }
  if (!allowed.includes(data.status)) {
    res.status(409).json({ error: `This request is already ${data.status}.` });
    return null;
  }
  return data;
}

async function updateRequestIfStatus(request, updates) {
  const { data, error } = await supabase.from('Subscription_Request')
    .update(updates).eq('request_id', request.request_id).eq('status', request.status).select().single();
  if (error || !data) return null;
  return data;
}

// Expected start once the request is scheduled: end of the running term, or now.
async function expectedActivationFor(barangayId) {
  const { data: sub } = await supabase.from('Subscription').select('status, expires_at').eq('barangay_id', barangayId).maybeSingle();
  return sub?.status === 'active' && sub.expires_at && new Date(sub.expires_at) > new Date() ? sub.expires_at : null;
}

// POST /admin/subscription-requests/:id/approve — body: { confirm: true }.
// Approval alone never activates or issues credits: a paid plan waits for
// payment verification; a free (₱0) plan is scheduled straight away.
app.post('/admin/subscription-requests/:id/approve', requireAuth, requireRole('admin'), async (req, res) => {
  const request = await loadRequestForDecision(req, res, ['pending']);
  if (!request) return;
  const free = Number(request.price) <= 0;
  const expected = await expectedActivationFor(request.barangay_id);

  const updated = await updateRequestIfStatus(request, {
    status: free ? 'scheduled' : 'approved',
    approved_by: req.user.user_id,
    approved_at: new Date().toISOString(),
    expected_activation_at: expected,
    ...(free ? { payment_status: 'not_required' } : {}),
  });
  if (!updated) return res.status(409).json({ error: 'This request changed while you were reviewing it. Reload and try again.' });

  await logSubscriptionHistory({
    barangay_id: request.barangay_id, plan_id: request.plan_id, plan_name: request.plan_name, action: 'request_approved',
    status: updated.status, price: request.price, actor_role: 'admin', actor_user_id: req.user.user_id, request_id: request.request_id,
  });
  await notifyBarangay(request.barangay_id, 'Renewal request approved',
    free
      ? `Your request for the ${request.plan_name} was approved and is scheduled to activate ${expected ? `on ${fmtSubDate(expected)}` : 'now'}.`
      : `Your request for the ${request.plan_name} was approved. Please pay ₱${Number(request.price).toLocaleString()} and send the payment reference from the Subscription page so it can be verified.`);
  if (free) await syncSubscriptions(request.barangay_id);
  res.json(updated);
});

// POST /admin/subscription-requests/:id/reject — body: { confirm, reason, remarks? }.
app.post('/admin/subscription-requests/:id/reject', requireAuth, requireRole('admin'), async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  const remarks = req.body?.remarks ? String(req.body.remarks).trim().slice(0, 1000) : null;
  if (reason.length < SUB_MIN_REASON) return res.status(400).json({ error: 'A rejection reason is required.' });
  const request = await loadRequestForDecision(req, res, ['pending', 'approved']);
  if (!request) return;

  const updated = await updateRequestIfStatus(request, {
    status: 'rejected', rejected_by: req.user.user_id, rejected_at: new Date().toISOString(),
    rejection_reason: reason.slice(0, 300), rejection_remarks: remarks,
  });
  if (!updated) return res.status(409).json({ error: 'This request changed while you were reviewing it. Reload and try again.' });

  await logSubscriptionHistory({
    barangay_id: request.barangay_id, plan_id: request.plan_id, plan_name: request.plan_name, action: 'request_rejected',
    status: 'rejected', price: request.price, actor_role: 'admin', actor_user_id: req.user.user_id, request_id: request.request_id,
    note: remarks ? `${reason} — ${remarks}` : reason,
  });
  await notifyBarangay(request.barangay_id, 'Renewal request rejected',
    `Your request for the ${request.plan_name} was rejected. Reason: ${reason}${remarks ? ` (${remarks})` : ''}. Your current subscription is unchanged.`);
  res.json(updated);
});

// POST /admin/subscription-requests/:id/verify-payment — body: { confirm, reference, amount }.
// Moves an approved request to scheduled. It activates when the current term
// ends (or right away if the barangay has no running term).
app.post('/admin/subscription-requests/:id/verify-payment', requireAuth, requireRole('admin'), async (req, res) => {
  const reference = String(req.body?.reference || '').trim();
  const amount = Number(req.body?.amount);
  if (reference.length < 3) return res.status(400).json({ error: 'Enter the payment reference number.' });
  const request = await loadRequestForDecision(req, res, ['approved']);
  if (!request) return;
  if (!amount || Math.abs(amount - Number(request.price)) > 0.009) {
    return res.status(400).json({ error: `The verified amount must match the plan price (₱${Number(request.price).toLocaleString()}).` });
  }
  const expected = await expectedActivationFor(request.barangay_id);

  const updated = await updateRequestIfStatus(request, {
    status: 'scheduled', payment_status: 'verified', payment_reference: reference, payment_amount: amount,
    payment_verified_by: req.user.user_id, payment_verified_at: new Date().toISOString(),
    expected_activation_at: expected,
  });
  if (!updated) return res.status(409).json({ error: 'This request changed while you were reviewing it. Reload and try again.' });

  await logSubscriptionHistory({
    barangay_id: request.barangay_id, plan_id: request.plan_id, plan_name: request.plan_name, action: 'payment_verified',
    status: 'scheduled', price: request.price, actor_role: 'admin', actor_user_id: req.user.user_id, request_id: request.request_id,
    note: `₱${amount.toLocaleString()} · ref. ${reference}`,
  });
  const name = await barangayNameOf(request.barangay_id);
  await notifyBarangay(request.barangay_id, 'Upcoming subscription scheduled',
    `Payment for the ${request.plan_name} was verified. It will activate ${expected ? `on ${fmtSubDate(expected)}, when your current subscription ends` : 'now'}.`);
  await notifySubscriptionAdmins('Upcoming subscription ready for activation',
    `${name}'s ${request.plan_name} is paid and scheduled${expected ? ` to activate on ${fmtSubDate(expected)}` : ' to activate now'}.`);
  await syncSubscriptions(request.barangay_id);

  const { data: fresh } = await supabase.from('Subscription_Request').select('*').eq('request_id', request.request_id).single();
  res.json(fresh || updated);
});

// POST /admin/subscription-requests/:id/cancel — body: { confirm, reason }.
// Admin-side cancellation of an approved or scheduled (paid) request before it
// activates -- refunds are handled outside the app; the record is kept.
app.post('/admin/subscription-requests/:id/cancel', requireAuth, requireRole('admin'), async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < SUB_MIN_REASON) return res.status(400).json({ error: 'A cancellation reason is required.' });
  const request = await loadRequestForDecision(req, res, ['approved', 'scheduled']);
  if (!request) return;

  const updated = await updateRequestIfStatus(request, {
    status: 'cancelled', cancelled_by: req.user.user_id, cancelled_by_role: 'admin',
    cancelled_at: new Date().toISOString(), cancellation_reason: reason.slice(0, 500),
  });
  if (!updated) return res.status(409).json({ error: 'This request changed while you were reviewing it. Reload and try again.' });

  await logSubscriptionHistory({
    barangay_id: request.barangay_id, plan_id: request.plan_id, plan_name: request.plan_name, action: 'request_cancelled',
    status: 'cancelled', price: request.price, actor_role: 'admin', actor_user_id: req.user.user_id, request_id: request.request_id, note: reason,
  });
  await notifyBarangay(request.barangay_id, 'Upcoming subscription cancelled',
    `Your upcoming ${request.plan_name} subscription was cancelled by the OpenUp admin. Reason: ${reason}. Your current subscription is unchanged.`);
  res.json(updated);
});

// GET /admin/subscription-credit-issuances?barangay_id= — every plan Care
// Credit issuance (one per activated term).
app.get('/admin/subscription-credit-issuances', requireAuth, requireRole('admin'), async (req, res) => {
  let query = supabase.from('Subscription_Credit_Issuance').select('*').order('issued_at', { ascending: false });
  if (req.query.barangay_id) query = query.eq('barangay_id', req.query.barangay_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: subscriptionMigrationError(error) });
  res.json(data);
});

// GET /lgu/me/subscription/history — this barangay's own audit trail.
app.get('/lgu/me/subscription/history', requireAuth, requireRole('lgu'), async (req, res) => {
  const barangayId = await getOwnBarangayId(req.user.user_id);
  if (!barangayId) return res.status(404).json({ error: 'Account not found' });

  const { data, error } = await supabase
    .from('Subscription_History')
    .select('*')
    .eq('barangay_id', barangayId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /lgu/citywide-overview?range=week|month|quarter (default week) — every
// barangay's risk band, visible to ANY LGU account (not scoped to their own
// barangay) so a barangay office has city-wide situational awareness
// without ever seeing another barangay's individual residents.
app.get('/lgu/citywide-overview', requireAuth, requireRole('lgu'), async (req, res) => {
  const rangeDays = HEATMAP_RANGE_DAYS[req.query.range] || HEATMAP_RANGE_DAYS.week;
  try {
    res.json(await computeCitywideOverview(rangeDays));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/heatmap-overview?range=week|month|quarter (default week) — the
// Admin-facing "View All-Barangay Heatmap (Full)": same aggregated risk-band
// data as the LGU view, not a different (e.g. raw resident-level) dataset --
// a heatmap is an aggregate visualization by nature; Admin already has raw
// resident data elsewhere (Manage Users, etc.) if it's ever needed.
app.get('/admin/heatmap-overview', requireAuth, requireRole('admin'), async (req, res) => {
  const rangeDays = HEATMAP_RANGE_DAYS[req.query.range] || HEATMAP_RANGE_DAYS.week;
  try {
    res.json(await computeCitywideOverview(rangeDays));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/escalations — every emergency flag a psychologist has raised, most
// recent first, so the Notification sent alongside it has somewhere real to lead.
app.get('/admin/escalations', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('Emergency_Escalation')
    .select('*, Psychologist(User(name)), Booking(resident_id, schedule, User(name))')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /admin/system-health — real, checkable signals only. No fabricated
// "99.98% uptime" or invented error rate -- there's no monitoring/APM
// infrastructure in this app to source that from. What IS real:
//   - database: a live query against Supabase just succeeded or it didn't.
//   - integrations_configured: whether each external service's credentials
//     are actually present in this environment (not whether the service is
//     currently reachable -- a cheap, honest proxy).
//   - care_credit_ledger: reuses the same reconciliation check /care-credits/
//     reconciliation already does, platform-wide -- a genuine data-integrity
//     signal, not a vanity metric.
//   - process_uptime_seconds: this Node process's own uptime (process.uptime()),
//     labeled as exactly that -- not a platform-wide SLA claim, since Render's
//     free tier can restart this process at any time.
app.get('/admin/system-health', requireAuth, requireRole('admin'), async (req, res) => {
  const { error: dbError } = await supabase.from('Barangay').select('barangay_id').limit(1);

  const { data: credits, error: creditsError } = await supabase
    .from('Care_Credit')
    .select('credit_id, status');
  let ledger = { reconciled: null, total_issued: 0, orphaned_used_credits: 0 };
  if (!creditsError) {
    const usedCreditIds = credits.filter((c) => c.status === 'used').map((c) => c.credit_id);
    let linkedIds = new Set();
    if (usedCreditIds.length > 0) {
      const { data: linkedBookings } = await supabase
        .from('Booking')
        .select('care_credit_id')
        .in('care_credit_id', usedCreditIds);
      linkedIds = new Set((linkedBookings || []).map((b) => b.care_credit_id));
    }
    const orphaned = usedCreditIds.filter((id) => !linkedIds.has(id)).length;
    ledger = { reconciled: orphaned === 0, total_issued: credits.length, orphaned_used_credits: orphaned };
  }

  res.json({
    database: dbError ? 'offline' : 'online',
    process_uptime_seconds: Math.round(process.uptime()),
    integrations_configured: {
      ai_companion: !!process.env.GROQ_API_KEY,
      payments: !!process.env.PAYMONGO_SECRET_KEY,
      video_sessions: !!(process.env.JAAS_APP_ID && process.env.JAAS_KEY_ID),
    },
    care_credit_ledger: ledger,
  });
});

// GET /admin/bookings?status=pending|confirmed|all (default: all except cancelled/declined)
app.get('/admin/bookings', requireAuth, requireRole('admin'), async (req, res) => {
  const status = req.query.status;

  let query = supabase
    .from('Booking')
    .select('*, User(name), Psychologist(psychologist_id, User(name))')
    .order('schedule', { ascending: true });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  } else if (!status) {
    query = query.not('status', 'in', '(cancelled,declined)');
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /admin/bookings/:id/cancel — see db/admin_booking_management.sql. Releases any
// reserved/used credit and marks the Payment refunded or cancelled as appropriate.
app.post('/admin/bookings/:id/cancel', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase.rpc('admin_cancel_booking', { p_booking_id: req.params.id });

  if (error) {
    if (error.message === 'BOOKING_NOT_FOUND') return res.status(404).json({ error: 'Booking not found' });
    if (error.message === 'ALREADY_TERMINAL') return res.status(409).json({ error: 'This booking is already cancelled or declined' });
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// POST /admin/bookings/:id/reassign — body: { psychologist_id }. Recomputes the
// Payment against the new psychologist's own session_price if already confirmed.
app.post('/admin/bookings/:id/reassign', requireAuth, requireRole('admin'), async (req, res) => {
  const { psychologist_id } = req.body;
  if (!psychologist_id) return res.status(400).json({ error: 'psychologist_id is required' });

  const { data, error } = await supabase.rpc('admin_reassign_booking', {
    p_booking_id: req.params.id,
    p_new_psychologist_id: psychologist_id,
  });

  if (error) {
    if (error.message === 'BOOKING_NOT_FOUND') return res.status(404).json({ error: 'Booking not found' });
    if (error.message === 'ALREADY_TERMINAL') return res.status(409).json({ error: 'This booking is already cancelled or declined' });
    if (error.message === 'NEW_PSYCHOLOGIST_NOT_FOUND_OR_UNVERIFIED') {
      return res.status(404).json({ error: 'That psychologist was not found or is not verified' });
    }
    if (error.code === '23505') {
      return res.status(409).json({ error: 'That psychologist already has a booking at this exact time' });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// POST /bookings — claim credit + create Booking + create Payment as one Postgres
// transaction (see db/create_booking_transaction.sql). If any step fails — including
// the unique-slot conflict — Postgres rolls back all of it, so there's never a
// booking left without a payment, or a credit stranded as 'used' with nothing to show for it.
// Auto-confirms immediately (same as the crisis-match path) rather than creating a
// pending request a psychologist has to accept first -- the calendar this books
// against (GET /psychologists/:id/availability) already only ever offers genuinely
// free slots, so there's nothing left to approve. A Payment is always created here:
// 'paid' if a Care Credit covered it, 'pending' (needs /payments/:id/checkout) if not.
app.post('/bookings', async (req, res) => {
  const { resident_id, psychologist_id, schedule, use_credit } = req.body;

  if (!resident_id || !psychologist_id || !schedule) {
    return res.status(400).json({ error: 'resident_id, psychologist_id, and schedule are required' });
  }

  // Only verified psychologists can be booked. The listing already hides the
  // rest, but create_booking_transaction itself doesn't check, so a direct
  // API call could otherwise book a pending / denied psychologist.
  const { data: bookable } = await supabase
    .from('Psychologist').select('is_verified').eq('psychologist_id', psychologist_id).maybeSingle();
  if (!bookable?.is_verified) {
    return res.status(404).json({ error: 'This psychologist is not available for booking right now' });
  }

  const { data, error } = await supabase.rpc('create_booking_transaction', {
    p_resident_id: resident_id,
    p_psychologist_id: psychologist_id,
    p_schedule: schedule,
    p_auto_confirm: true,
    p_use_credit: use_credit !== false,
  });

  if (error) {
    if (error.message === 'PSYCHOLOGIST_NOT_FOUND') {
      return res.status(404).json({ error: 'This psychologist is not available for booking right now' });
    }
    if (error.code === '23505') {
      return res.status(409).json({ error: 'This slot was just requested by someone else. Please pick another time.' });
    }
    return res.status(500).json({ error: error.message });
  }

  // Since this is now auto-confirmed rather than a request they'd see in a
  // pending queue, the psychologist needs an explicit heads-up that a session
  // just landed on their calendar. Best-effort: the booking already succeeded
  // either way, so a notification failure shouldn't fail the response.
  try {
    const { data: psychologist } = await supabase
      .from('Psychologist')
      .select('user_id')
      .eq('psychologist_id', psychologist_id)
      .single();
    if (psychologist) {
      await supabase.from('Notification').insert([{
        user_id: psychologist.user_id,
        type: 'system',
        title: 'New session booked',
        body: 'A resident just booked a confirmed session with you.',
        link: '/psychologist/schedule',
        read: false,
      }]);
    }
  } catch {
    // best-effort
  }

  res.status(201).json(data);
});

// GET /psychologists/me/booking-requests — the logged-in psychologist's own pending
// appointment requests, oldest first.
app.get('/psychologists/me/booking-requests', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data: psychologist, error: psychError } = await supabase
    .from('Psychologist')
    .select('psychologist_id')
    .eq('user_id', req.user.user_id)
    .single();

  if (psychError || !psychologist) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data, error } = await supabase
    .from('Booking')
    .select('*, User(name)')
    .eq('psychologist_id', psychologist.psychologist_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /psychologists/me/bookings?status=confirmed&start=YYYY-MM-DD&end=YYYY-MM-DD
// — the logged-in psychologist's own bookings (as opposed to /booking-requests
// above, which is pending-only), with Payment status/amount joined in so the
// Appointment Management calendar can derive each card's real status (pending /
// awaiting payment / confirmed & paid / cancelled / declined) without a second
// round trip per booking. start/end filter by `schedule`, inclusive, for a
// calendar view's visible range -- both optional, omitting them returns everything.
app.get('/psychologists/me/bookings', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data: psychologist, error: psychError } = await supabase
    .from('Psychologist')
    .select('psychologist_id')
    .eq('user_id', req.user.user_id)
    .single();

  if (psychError || !psychologist) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  let query = supabase
    .from('Booking')
    .select('*, User(name), Payment(status, amount)')
    .eq('psychologist_id', psychologist.psychologist_id)
    .order('schedule', { ascending: true });

  if (req.query.status) query = query.eq('status', req.query.status);
  if (req.query.start) query = query.gte('schedule', req.query.start);
  if (req.query.end) query = query.lte('schedule', req.query.end);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// A session counts as completed ONLY when completed_at is set (see
// db/booking_completed_at.sql). It can be set once the session is confirmed,
// paid, and its start time has passed.
function bookingIsPaid(b) {
  const payments = Array.isArray(b.Payment) ? b.Payment : (b.Payment ? [b.Payment] : []);
  return payments.some((p) => p.status === 'paid');
}

// GET /psychologists/me/completed-sessions -- Appointment Management's
// "Completed Sessions" tab. Returns:
//   completed            bookings actually marked completed (completed_at set)
//   awaiting_completion  confirmed + paid sessions whose time has passed but
//                        that nobody has marked completed yet (shown separately,
//                        never counted as completed)
app.get('/psychologists/me/completed-sessions', requireAuth, requireRole('psychologist'), async (req, res) => {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const fields = 'booking_id, resident_id, schedule, status, session_type, care_credit_id, rescheduled_at, completed_at, created_at, User(name), Payment(status, amount)';
  const [completedRes, pastRes] = await Promise.all([
    supabase.from('Booking').select(fields)
      .eq('psychologist_id', psychologistId)
      .eq('status', 'confirmed')
      .not('completed_at', 'is', null)
      .order('schedule', { ascending: false }),
    supabase.from('Booking').select(fields)
      .eq('psychologist_id', psychologistId)
      .eq('status', 'confirmed')
      .is('completed_at', null)
      .lt('schedule', new Date().toISOString())
      .order('schedule', { ascending: false }),
  ]);
  if (completedRes.error) {
    const missing = /completed_at/.test(completedRes.error.message);
    return res.status(500).json({
      error: missing ? 'Completed Sessions needs the db/booking_completed_at.sql migration to be run first.' : completedRes.error.message,
    });
  }
  if (pastRes.error) return res.status(500).json({ error: pastRes.error.message });

  res.json({
    completed: completedRes.data,
    awaiting_completion: pastRes.data.filter(bookingIsPaid),
  });
});

// POST /bookings/:id/complete -- psychologist marks one of their own sessions
// as completed. The conditional update (completed_at IS NULL) makes it
// idempotent under double-clicks / two tabs.
app.post('/bookings/:id/complete', requireAuth, requireRole('psychologist'), async (req, res) => {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data: booking, error } = await supabase
    .from('Booking')
    .select('booking_id, psychologist_id, schedule, status, completed_at, Payment(status)')
    .eq('booking_id', req.params.id)
    .single();
  if (error || !booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.psychologist_id !== psychologistId) return res.status(403).json({ error: 'This is not your session' });
  if (booking.completed_at) return res.status(409).json({ error: 'This session is already marked as completed' });
  if (booking.status !== 'confirmed') return res.status(409).json({ error: 'Only confirmed sessions can be marked as completed' });
  if (!bookingIsPaid(booking)) return res.status(409).json({ error: 'This session has not been paid yet, so it cannot be marked as completed' });
  if (new Date(booking.schedule) > new Date()) {
    return res.status(409).json({ error: 'This session has not started yet, so it cannot be marked as completed' });
  }

  const { data, error: updateError } = await supabase
    .from('Booking')
    .update({ completed_at: new Date().toISOString() })
    .eq('booking_id', booking.booking_id)
    .is('completed_at', null)
    .select('*, User(name), Payment(status, amount)');
  if (updateError) return res.status(500).json({ error: updateError.message });
  if (!data || data.length === 0) return res.status(409).json({ error: 'This session is already marked as completed' });
  res.json(data[0]);
});

// GET /psychologists/me/dashboard-summary — stats + charts for the Dashboard home page.
app.get('/psychologists/me/dashboard-summary', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data: psychologist, error: psychError } = await supabase
    .from('Psychologist')
    .select('psychologist_id')
    .eq('user_id', req.user.user_id)
    .single();

  if (psychError || !psychologist) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data: bookings, error: bookingsError } = await supabase
    .from('Booking')
    .select('booking_id, resident_id, schedule, status')
    .eq('psychologist_id', psychologist.psychologist_id);

  if (bookingsError) return res.status(500).json({ error: bookingsError.message });

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentMonthKey = now.toISOString().slice(0, 7);

  const confirmedBookings = bookings.filter((b) => b.status === 'confirmed');
  const todaysSessions = confirmedBookings.filter((b) => b.schedule.slice(0, 10) === todayStr);
  const completedSessions = confirmedBookings.filter((b) => new Date(b.schedule) < now);
  const pendingRequests = bookings.filter((b) => b.status === 'pending');

  // Monthly earnings: only count Payment rows actually marked 'paid' as earned. A
  // 'pending' payment is money the resident hasn't paid yet -- counting it as
  // "earnings" would claim money that was never actually received.
  const thisMonthBookingIds = confirmedBookings
    .filter((b) => b.schedule.slice(0, 7) === currentMonthKey)
    .map((b) => b.booking_id);

  let monthlyEarningsPaid = 0;
  let monthlyEarningsPending = 0;
  if (thisMonthBookingIds.length > 0) {
    const { data: payments, error: paymentsError } = await supabase
      .from('Payment')
      .select('booking_id, psychologist_payout, status')
      .in('booking_id', thisMonthBookingIds);
    if (paymentsError) return res.status(500).json({ error: paymentsError.message });
    for (const p of payments) {
      if (p.status === 'paid') monthlyEarningsPaid += Number(p.psychologist_payout);
      else if (p.status === 'pending') monthlyEarningsPending += Number(p.psychologist_payout);
    }
  }

  // Appointments per month: last 7 months including the current one, counting any
  // live (non-cancelled/declined) booking regardless of status. Everything here uses
  // UTC consistently (both the key AND its label) -- schedule strings from Postgres are
  // UTC, so building the key from a *local* Date (new Date(y, m, 1)) shifted the whole
  // window by a day/month in timezones ahead of UTC (e.g. Philippines, UTC+8), silently
  // dropping the current month's bookings because the key no longer matched.
  const monthKeys = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    monthKeys.push({
      key: d.toISOString().slice(0, 7),
      label: d.toLocaleString('default', { month: 'short', timeZone: 'UTC' }),
    });
  }
  const monthCounts = Object.fromEntries(monthKeys.map((m) => [m.key, 0]));
  bookings
    .filter((b) => b.status !== 'cancelled' && b.status !== 'declined')
    .forEach((b) => {
      const key = b.schedule.slice(0, 7);
      if (key in monthCounts) monthCounts[key] += 1;
    });
  const appointmentsPerMonth = monthKeys.map((m) => ({ month: m.label, count: monthCounts[m.key] }));

  // Mood distribution: for each distinct resident with a confirmed booking here,
  // compare their two most recent Mood_Entry rows. Needs at least 2 entries to
  // classify at all -- a client with 0 or 1 entries is left out rather than guessed at.
  const clientIds = [...new Set(confirmedBookings.map((b) => b.resident_id))];
  let improving = 0;
  let stable = 0;
  let needsAttention = 0;

  if (clientIds.length > 0) {
    const { data: moodEntries, error: moodError } = await supabase
      .from('Mood_Entry')
      .select('user_id, mood_level, created_at')
      .in('user_id', clientIds)
      .order('created_at', { ascending: false });

    if (!moodError && moodEntries) {
      const latestTwoByUser = {};
      for (const entry of moodEntries) {
        if (!latestTwoByUser[entry.user_id]) latestTwoByUser[entry.user_id] = [];
        if (latestTwoByUser[entry.user_id].length < 2) latestTwoByUser[entry.user_id].push(entry.mood_level);
      }
      for (const clientId of clientIds) {
        const [latest, previous] = latestTwoByUser[clientId] || [];
        if (latest == null || previous == null) continue;
        if (latest > previous) improving += 1;
        else if (latest < previous) needsAttention += 1;
        else stable += 1;
      }
    }
  }

  const classifiedCount = improving + stable + needsAttention;

  res.json({
    today_sessions: todaysSessions.length,
    pending_requests: pendingRequests.length,
    completed_sessions: completedSessions.length,
    monthly_earnings_paid: monthlyEarningsPaid,
    monthly_earnings_pending: monthlyEarningsPending,
    appointments_per_month: appointmentsPerMonth,
    mood_distribution:
      classifiedCount > 0
        ? {
            improving: Math.round((improving / classifiedCount) * 100),
            stable: Math.round((stable / classifiedCount) * 100),
            needs_attention: Math.round((needsAttention / classifiedCount) * 100),
            improving_count: improving,
            stable_count: stable,
            needs_attention_count: needsAttention,
          }
        : null,
    todays_sessions_detail: todaysSessions.map((b) => ({
      booking_id: b.booking_id,
      resident_id: b.resident_id,
      schedule: b.schedule,
    })),
  });
});

// GET /psychologists/me/reports — Session/Earnings reports for the Reports page:
// last 12 months of earnings (paid vs pending) and every session in that window,
// with the resident anonymized (same masking as the Dashboard's today's-sessions
// table) since this is a bulk/exportable view, not a specific-client lookup --
// that's what My Clients is for.
app.get('/psychologists/me/reports', requireAuth, requireRole('psychologist'), async (req, res) => {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const now = new Date();
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  const { data: bookings, error: bookingsError } = await supabase
    .from('Booking')
    .select('booking_id, resident_id, schedule, status')
    .eq('psychologist_id', psychologistId)
    .gte('schedule', windowStart.toISOString())
    .order('schedule', { ascending: false });
  if (bookingsError) return res.status(500).json({ error: bookingsError.message });

  const bookingIds = bookings.map((b) => b.booking_id);
  let payments = [];
  if (bookingIds.length > 0) {
    const { data, error: paymentsError } = await supabase
      .from('Payment')
      .select('booking_id, psychologist_payout, status')
      .in('booking_id', bookingIds);
    if (paymentsError) return res.status(500).json({ error: paymentsError.message });
    payments = data;
  }
  const paymentByBooking = Object.fromEntries(payments.map((p) => [p.booking_id, p]));

  const monthKeys = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    monthKeys.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleString('default', { month: 'short', year: '2-digit', timeZone: 'UTC' }) });
  }
  const earningsByMonth = Object.fromEntries(monthKeys.map((m) => [m.key, { paid: 0, pending: 0 }]));

  let totalPaid = 0;
  let totalPending = 0;
  let completedCount = 0;

  const sessions = bookings.map((b) => {
    const payment = paymentByBooking[b.booking_id] || null;
    const monthKey = b.schedule.slice(0, 7);
    if (payment && monthKey in earningsByMonth) {
      if (payment.status === 'paid') earningsByMonth[monthKey].paid += Number(payment.psychologist_payout);
      else if (payment.status === 'pending') earningsByMonth[monthKey].pending += Number(payment.psychologist_payout);
    }
    if (payment?.status === 'paid') totalPaid += Number(payment.psychologist_payout);
    if (payment?.status === 'pending') totalPending += Number(payment.psychologist_payout);
    if (b.status === 'confirmed' && new Date(b.schedule) < now) completedCount += 1;

    return {
      booking_id: b.booking_id,
      client: anonymizeResidentId(b.resident_id),
      schedule: b.schedule,
      status: b.status,
      payout: payment ? Number(payment.psychologist_payout) : null,
      payment_status: payment?.status || null,
    };
  });

  res.json({
    sessions,
    earnings_by_month: monthKeys.map((m) => ({ month: m.label, ...earningsByMonth[m.key] })),
    totals: {
      total_sessions: bookings.length,
      completed_sessions: completedCount,
      total_paid: totalPaid,
      total_pending: totalPending,
    },
  });
});

// POST /bookings/:id/accept — confirms the request: consumes the reserved credit (if
// any) and creates the Payment. See db/booking_accept_decline.sql.
app.post('/bookings/:id/accept', requireAuth, requireRole('psychologist'), requireVerifiedPsychologist, async (req, res) => {
  const { data: psychologist, error: psychError } = await supabase
    .from('Psychologist')
    .select('psychologist_id')
    .eq('user_id', req.user.user_id)
    .single();

  if (psychError || !psychologist) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data, error } = await supabase.rpc('accept_booking_request', {
    p_booking_id: req.params.id,
    p_psychologist_id: psychologist.psychologist_id,
  });

  if (error) {
    if (error.message === 'BOOKING_NOT_FOUND') return res.status(404).json({ error: 'Booking not found' });
    if (error.message === 'NOT_YOUR_BOOKING') return res.status(403).json({ error: 'This is not your booking request' });
    if (error.message === 'BOOKING_NOT_PENDING') return res.status(409).json({ error: 'This request is no longer pending' });
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// POST /bookings/:id/decline — releases the reserved credit back to 'available' and
// frees up the slot for someone else to request. See db/booking_accept_decline.sql.
app.post('/bookings/:id/decline', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data: psychologist, error: psychError } = await supabase
    .from('Psychologist')
    .select('psychologist_id')
    .eq('user_id', req.user.user_id)
    .single();

  if (psychError || !psychologist) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data, error } = await supabase.rpc('decline_booking_request', {
    p_booking_id: req.params.id,
    p_psychologist_id: psychologist.psychologist_id,
  });

  if (error) {
    if (error.message === 'BOOKING_NOT_FOUND') return res.status(404).json({ error: 'Booking not found' });
    if (error.message === 'NOT_YOUR_BOOKING') return res.status(403).json({ error: 'This is not your booking request' });
    if (error.message === 'BOOKING_NOT_PENDING') return res.status(409).json({ error: 'This request is no longer pending' });
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// POST /bookings/:id/cancel — resident cancelling their own booking. Reuses the same
// admin_cancel_booking transaction (releases the credit, refunds/cancels the
// Payment) — the function itself has no role logic, ownership is checked here.
app.post('/bookings/:id/cancel', requireAuth, requireRole('resident'), async (req, res) => {
  const { data: booking, error: findError } = await supabase
    .from('Booking')
    .select('resident_id, Payment(status)')
    .eq('booking_id', req.params.id)
    .single();

  if (findError || !booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.resident_id !== req.user.user_id) return res.status(403).json({ error: 'This is not your booking' });

  // Once paid (cash or Care Credit), a session can be rescheduled but not
  // cancelled -- same no-show/cancellation policy a real counseling practice
  // would hold psychologists' reserved time against.
  if (booking.Payment?.some((p) => p.status === 'paid')) {
    return res.status(409).json({ error: "This session is already paid and can't be cancelled. You can reschedule it instead." });
  }

  const { data, error } = await supabase.rpc('admin_cancel_booking', { p_booking_id: req.params.id });

  if (error) {
    if (error.message === 'BOOKING_NOT_FOUND') return res.status(404).json({ error: 'Booking not found' });
    if (error.message === 'ALREADY_TERMINAL') return res.status(409).json({ error: 'This booking is already cancelled or declined' });
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// PATCH /bookings/:id/reschedule — body: { schedule }. A confirmed booking resets to
// 'pending' so the psychologist re-accepts the new time — see db/reschedule_booking.sql.
app.patch('/bookings/:id/reschedule', requireAuth, requireRole('resident'), async (req, res) => {
  const { schedule } = req.body;
  if (!schedule) return res.status(400).json({ error: 'schedule is required' });

  const { data, error } = await supabase.rpc('reschedule_booking', {
    p_booking_id: req.params.id,
    p_resident_id: req.user.user_id,
    p_new_schedule: schedule,
  });

  if (error) {
    if (error.message === 'BOOKING_NOT_FOUND') return res.status(404).json({ error: 'Booking not found' });
    if (error.message === 'NOT_YOUR_BOOKING') return res.status(403).json({ error: 'This is not your booking' });
    if (error.message === 'ALREADY_TERMINAL') return res.status(409).json({ error: 'This booking is already cancelled or declined' });
    if (error.code === '23505') return res.status(409).json({ error: 'That psychologist already has a booking at that time' });
    return res.status(500).json({ error: error.message });
  }

  // Best-effort: flags this booking as "Rescheduled" for the psychologist's
  // Appointment Management calendar color coding.
  await supabase.from('Booking').update({ rescheduled_at: new Date().toISOString() }).eq('booking_id', req.params.id);

  res.json(data);
});

// POST /bookings/:id/psychologist-cancel — mirrors the resident cancel route,
// ownership checked against the psychologist side instead. Reuses
// admin_cancel_booking since the unwind logic (release credit, refund/cancel
// Payment) doesn't depend on who initiated it.
app.post('/bookings/:id/psychologist-cancel', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data: psychologist, error: psychError } = await supabase
    .from('Psychologist')
    .select('psychologist_id')
    .eq('user_id', req.user.user_id)
    .single();

  if (psychError || !psychologist) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data: booking, error: findError } = await supabase
    .from('Booking')
    .select('psychologist_id')
    .eq('booking_id', req.params.id)
    .single();

  if (findError || !booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.psychologist_id !== psychologist.psychologist_id) return res.status(403).json({ error: 'This is not your booking' });

  const { data, error } = await supabase.rpc('admin_cancel_booking', { p_booking_id: req.params.id });

  if (error) {
    if (error.message === 'BOOKING_NOT_FOUND') return res.status(404).json({ error: 'Booking not found' });
    if (error.message === 'ALREADY_TERMINAL') return res.status(409).json({ error: 'This booking is already cancelled or declined' });
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// POST /bookings/:id/resend-payment-notification — for a confirmed-but-unpaid
// booking, re-sends the resident a reminder notification. The Appointment
// Management calendar's "Awaiting Payment" card action.
app.post('/bookings/:id/resend-payment-notification', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data: psychologist, error: psychError } = await supabase
    .from('Psychologist')
    .select('psychologist_id')
    .eq('user_id', req.user.user_id)
    .single();
  if (psychError || !psychologist) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data: booking, error: findError } = await supabase
    .from('Booking')
    .select('resident_id, psychologist_id, schedule, Payment(status)')
    .eq('booking_id', req.params.id)
    .single();
  if (findError || !booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.psychologist_id !== psychologist.psychologist_id) return res.status(403).json({ error: 'This is not your booking' });
  if (booking.Payment?.some((p) => p.status === 'paid')) {
    return res.status(409).json({ error: 'This session is already paid for' });
  }

  const { error } = await supabase.from('Notification').insert([{
    user_id: booking.resident_id,
    type: 'system',
    title: 'Payment reminder',
    body: `Your session on ${new Date(booking.schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })} is still awaiting payment.`,
    link: `/session/${req.params.id}`,
    read: false,
  }]);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ sent: true });
});

// PATCH /bookings/:id/psychologist-reschedule — body: { schedule }. See
// db/psychologist_reschedule_booking.sql for why this leaves status/Payment/
// Care_Credit untouched, unlike the resident-initiated reschedule above.
app.patch('/bookings/:id/psychologist-reschedule', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { schedule } = req.body;
  if (!schedule) return res.status(400).json({ error: 'schedule is required' });

  const { data: psychologist, error: psychError } = await supabase
    .from('Psychologist')
    .select('psychologist_id')
    .eq('user_id', req.user.user_id)
    .single();

  if (psychError || !psychologist) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data, error } = await supabase.rpc('psychologist_reschedule_booking', {
    p_booking_id: req.params.id,
    p_psychologist_id: psychologist.psychologist_id,
    p_new_schedule: schedule,
  });

  if (error) {
    if (error.message === 'BOOKING_NOT_FOUND') return res.status(404).json({ error: 'Booking not found' });
    if (error.message === 'NOT_YOUR_BOOKING') return res.status(403).json({ error: 'This is not your booking' });
    if (error.message === 'ALREADY_TERMINAL') return res.status(409).json({ error: 'This booking is already cancelled or declined' });
    if (error.code === '23505') return res.status(409).json({ error: 'You already have a booking at that time' });
    return res.status(500).json({ error: error.message });
  }

  // Best-effort: the reschedule already succeeded either way, so a failed
  // notification insert shouldn't fail this response.
  await supabase.from('Notification').insert([{
    user_id: data.booking.resident_id,
    type: 'system',
    title: 'Session rescheduled',
    body: `Your psychologist moved your session to ${new Date(data.booking.schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}.`,
    link: `/session/${req.params.id}`,
    read: false,
  }]);

  // Best-effort: flags this booking as "Rescheduled" for the Appointment
  // Management calendar's color coding -- the reschedule itself already succeeded.
  await supabase.from('Booking').update({ rescheduled_at: new Date().toISOString() }).eq('booking_id', req.params.id);

  res.json(data);
});

// GET /psychologists/me/notes — every session note this psychologist has
// ever written, across all their clients, newest first. Without this the
// only way to find a note was to already remember which booking it was on
// and open that specific session -- this is the "Notes" sidebar page.
app.get('/psychologists/me/notes', requireAuth, requireRole('psychologist'), async (req, res) => {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data, error } = await supabase
    .from('Session_Note')
    .select('note_id, booking_id, body, created_at, updated_at, Booking(schedule, User(name))')
    .eq('psychologist_id', psychologistId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /bookings/:id/notes — session notes, visible to either participant on
// the booking (see db/session_notes.sql). The psychologist writes them;
// PUT below also notifies the resident when new notes are saved.
app.get('/bookings/:id/notes', requireAuth, async (req, res) => {
  const role = await getBookingParticipantRole(req.params.id, req.user);
  if (!role) return res.status(403).json({ error: 'You are not part of this session' });

  const { data, error } = await supabase
    .from('Session_Note')
    .select('body, created_at, updated_at')
    .eq('booking_id', req.params.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || { body: '' });
});

app.put('/bookings/:id/notes', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { body } = req.body;
  if (body === undefined) return res.status(400).json({ error: 'body is required' });

  const { data: psychologist, error: psychError } = await supabase
    .from('Psychologist')
    .select('psychologist_id')
    .eq('user_id', req.user.user_id)
    .single();

  if (psychError || !psychologist) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data: booking, error: findError } = await supabase
    .from('Booking')
    .select('psychologist_id, resident_id')
    .eq('booking_id', req.params.id)
    .single();

  if (findError || !booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.psychologist_id !== psychologist.psychologist_id) return res.status(403).json({ error: 'This is not your booking' });

  // Fire-and-forget: the resident gets notified every time notes are saved
  // (new or edited) -- notes are visible to them via GET above, so this is
  // just the heads-up that there's something new to read.
  const notifyResident = () => {
    supabase.from('Notification').insert([{
      user_id: booking.resident_id,
      type: 'system',
      title: 'Session notes added',
      body: 'Your psychologist added notes from your session.',
      link: `/session/${req.params.id}`,
      read: false,
    }]).then(() => {});
  };

  const { data: existing } = await supabase
    .from('Session_Note')
    .select('note_id')
    .eq('booking_id', req.params.id)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('Session_Note')
      .update({ body, updated_at: new Date().toISOString() })
      .eq('note_id', existing.note_id)
      .select('body, created_at, updated_at');
    if (error) return res.status(500).json({ error: error.message });
    notifyResident();
    return res.json(data[0]);
  }

  const { data, error } = await supabase
    .from('Session_Note')
    .insert([{ booking_id: req.params.id, psychologist_id: psychologist.psychologist_id, body }])
    .select('body, created_at, updated_at');

  if (error) return res.status(500).json({ error: error.message });
  notifyResident();
  res.status(201).json(data[0]);
});

// POST /bookings/:id/escalate — see db/emergency_escalation.sql: this app has no
// real integration with police/EMS/a crisis hotline, so this raises the session
// urgently for every admin to see and act on, and never claims emergency
// services were actually contacted.
app.post('/bookings/:id/escalate', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { note } = req.body;

  const { data: psychologist, error: psychError } = await supabase
    .from('Psychologist')
    .select('psychologist_id')
    .eq('user_id', req.user.user_id)
    .single();

  if (psychError || !psychologist) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data: booking, error: findError } = await supabase
    .from('Booking')
    .select('psychologist_id')
    .eq('booking_id', req.params.id)
    .single();

  if (findError || !booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.psychologist_id !== psychologist.psychologist_id) return res.status(403).json({ error: 'This is not your booking' });

  const { data: escalation, error } = await supabase
    .from('Emergency_Escalation')
    .insert([{ booking_id: req.params.id, psychologist_id: psychologist.psychologist_id, note: note || null }])
    .select();

  if (error) return res.status(500).json({ error: error.message });

  const { data: admins } = await supabase.from('User').select('user_id').eq('role', 'admin');
  if (admins && admins.length > 0) {
    await supabase.from('Notification').insert(
      admins.map((a) => ({
        user_id: a.user_id,
        type: 'system',
        title: 'Emergency escalation raised',
        body: `A psychologist flagged booking #${req.params.id} as an emergency. Review it as soon as possible.`,
        link: '/admin/dashboard',
        read: false,
      }))
    );
  }

  res.status(201).json(escalation[0]);
});

// GET /bookings/:id — used by the Session page to render the right controls
// (reschedule/cancel/notes/escalate for the psychologist). Gated the same way
// as the chat: only the two participants on this specific booking.
app.get('/bookings/:id', requireAuth, async (req, res) => {
  const role = await getBookingParticipantRole(req.params.id, req.user);
  if (!role) return res.status(403).json({ error: 'You are not part of this session' });

  const { data, error } = await supabase
    .from('Booking')
    .select('*, User(name), Psychologist(psychologist_id, User(name))')
    .eq('booking_id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Booking not found' });
  res.json(data);
});

// POST /bookings/:id/start-call — the psychologist's "Audio call" button hits this
// so the resident gets a real-time pop-up to join, instead of having to guess
// their psychologist is already waiting in the room.
app.post('/bookings/:id/start-call', requireAuth, requireRole('psychologist'), async (req, res) => {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data: booking, error } = await supabase
    .from('Booking')
    .select('booking_id, resident_id, psychologist_id, schedule, User(name)')
    .eq('booking_id', req.params.id)
    .single();

  if (error || !booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.psychologist_id !== psychologistId) return res.status(403).json({ error: 'This is not your session' });

  io.to(`user-${booking.resident_id}`).emit('call-started', {
    booking_id: booking.booking_id,
    psychologist_name: req.user.name,
  });

  res.json({ started: true });
});

// ---- Resident Inquiries -------------------------------------------------------
// One identified conversation per (resident, psychologist) pair, stored in
// Inquiry_Message (see db/inquiry_messages.sql + db/resident_inquiries.sql).
// This replaced the old booking-scoped, identity-masked "Anonymous Chat": the
// legacy Message rows were copied into Inquiry_Message by the migration, and
// /bookings/:id/messages below now reads/writes the same pair thread, so there
// is exactly one messaging system.
//
// Two statuses are attached to every conversation, and they are deliberately
// independent of each other:
//   * booking_status -- derived on every read from the real Booking + Payment
//     rows (never stored, never manually settable), so it can't drift from the
//     actual appointment state.
//   * inquiry_status -- derived from the messages' read receipts plus the
//     psychologist's one manual action, "Resolved" (Inquiry_Thread.resolved_at).

const INQUIRY_MESSAGE_FIELDS = 'message_id, resident_id, psychologist_id, sender_role, body, created_at, read_at';
const SESSION_LENGTH_MS = 60 * 60 * 1000; // every slot is one hour (see appointmentStatus.js)

// Per-booking status from the real records. 'expired' is not a stored state:
// a request still pending approval, or an approved booking still unpaid, once
// its session time has fully passed can no longer happen -- so it has expired.
function deriveBookingAppointmentStatus(booking, now = new Date()) {
  const ended = new Date(booking.schedule).getTime() + SESSION_LENGTH_MS < now.getTime();
  const payments = Array.isArray(booking.Payment) ? booking.Payment : (booking.Payment ? [booking.Payment] : []);

  if (booking.status === 'cancelled' || booking.status === 'declined') return booking.status;
  // Explicitly marked completed (db/booking_completed_at.sql) always wins.
  if (booking.completed_at && booking.status === 'confirmed') return 'completed';
  if (booking.status === 'pending') return ended ? 'expired' : 'pending_approval';

  if (payments.some((p) => p.status === 'paid')) return ended ? 'completed' : 'booked';
  if (payments.some((p) => p.status === 'refunded' || p.status === 'cancelled')) return 'cancelled';
  return ended ? 'expired' : 'awaiting_payment';
}

// The single badge shown beside a resident's name: their most actionable
// CURRENT appointment state with this psychologist.
function summarizeBookingStatus(bookings, now = new Date()) {
  const derived = bookings.map((b) => ({ ...b, appointment_status: deriveBookingAppointmentStatus(b, now) }));
  const soonest = (key) => derived
    .filter((b) => b.appointment_status === key)
    .sort((a, b) => new Date(a.schedule) - new Date(b.schedule))[0] || null;

  const booked = soonest('booked');
  if (booked) return { booking_status: 'booked', primary: booked, derived };
  const awaiting = soonest('awaiting_payment');
  if (awaiting) return { booking_status: 'awaiting_payment', primary: awaiting, derived };
  const pending = soonest('pending_approval');
  if (pending) return { booking_status: 'pending_approval', primary: pending, derived };

  // Nothing live. If their most recent booking fell through, say so; a past
  // completed session (or no booking at all) means not currently booked.
  const latest = [...derived].sort((a, b) => new Date(b.schedule) - new Date(a.schedule))[0];
  if (latest && ['cancelled', 'declined', 'expired'].includes(latest.appointment_status)) {
    return { booking_status: 'cancelled_expired', primary: null, derived };
  }
  return { booking_status: 'not_booked', primary: null, derived };
}

function serializeAppointment(b) {
  const payments = Array.isArray(b.Payment) ? b.Payment : (b.Payment ? [b.Payment] : []);
  const payment = payments.find((p) => p.status === 'paid') || payments[0] || null;
  return {
    booking_id: b.booking_id,
    schedule: b.schedule,
    session_type: b.session_type || null,
    booking_record_status: b.status,
    appointment_status: b.appointment_status,
    rescheduled: Boolean(b.rescheduled_at),
    payment_status: payment?.status || null,
    payment_amount: payment?.amount ?? null,
  };
}

// messagesNewestFirst: every message in ONE thread, newest first.
function deriveInquiryStatus(messagesNewestFirst, thread) {
  const last = messagesNewestFirst[0];
  const lastResident = messagesNewestFirst.find((m) => m.sender_role === 'resident');
  const lastPsych = messagesNewestFirst.find((m) => m.sender_role === 'psychologist');
  const unread = messagesNewestFirst.filter((m) => m.sender_role === 'resident' && !m.read_at).length;
  const resolvedAt = thread?.resolved_at ? new Date(thread.resolved_at) : null;

  // A resident writing again after resolution re-opens it automatically.
  if (resolvedAt && (!lastResident || resolvedAt >= new Date(lastResident.created_at))) {
    return { inquiry_status: 'resolved', unread_count: unread };
  }
  if (unread > 0) {
    const neverAnswered = !lastPsych || (resolvedAt && resolvedAt >= new Date(lastPsych.created_at));
    return { inquiry_status: neverAnswered ? 'new' : 'unread', unread_count: unread };
  }
  if (last?.sender_role === 'psychologist') return { inquiry_status: 'responded', unread_count: 0 };
  return { inquiry_status: 'in_progress', unread_count: 0 };
}

// Privacy gate: a psychologist may only see/act on a resident who has actually
// messaged them or has a real booking with them -- never an arbitrary user id.
async function psychologistCanAccessResident(psychologistId, residentId) {
  const [{ count: msgCount }, { count: bookingCount }] = await Promise.all([
    supabase.from('Inquiry_Message').select('message_id', { count: 'exact', head: true })
      .eq('psychologist_id', psychologistId).eq('resident_id', residentId),
    supabase.from('Booking').select('booking_id', { count: 'exact', head: true })
      .eq('psychologist_id', psychologistId).eq('resident_id', residentId),
  ]);
  return (msgCount || 0) > 0 || (bookingCount || 0) > 0;
}

async function getPsychologistUserId(psychologistId) {
  const { data } = await supabase.from('Psychologist').select('user_id').eq('psychologist_id', psychologistId).single();
  return data?.user_id || null;
}

// Marks the OTHER side's messages in a thread as read by `readerRole`, and tells
// the thread room so the sender's view can update its read receipts live.
async function markInquiryRead(residentId, psychologistId, readerRole) {
  const otherRole = readerRole === 'psychologist' ? 'resident' : 'psychologist';
  const readAt = new Date().toISOString();
  const { data } = await supabase
    .from('Inquiry_Message')
    .update({ read_at: readAt })
    .eq('resident_id', residentId)
    .eq('psychologist_id', psychologistId)
    .eq('sender_role', otherRole)
    .is('read_at', null)
    .select('message_id');
  if (data && data.length > 0) {
    io.to(`inquiry-${residentId}-${psychologistId}`).emit('inquiry-read', {
      resident_id: Number(residentId),
      psychologist_id: Number(psychologistId),
      reader_role: readerRole,
      read_at: readAt,
    });
    if (readerRole === 'psychologist') {
      const psychUserId = await getPsychologistUserId(psychologistId);
      if (psychUserId) io.to(`user-${psychUserId}`).emit('inquiry-updated', { resident_id: Number(residentId) });
    }
  }
}

// Single write path for every message, from either side and from either entry
// point (the inquiry thread itself, or a booking's Session page chat).
async function postInquiryMessage({ residentId, psychologistId, senderRole, body, senderName }) {
  // Looked up BEFORE inserting so we can tell whether this opens a new
  // inquiry and avoid stacking one notification per consecutive message.
  const { data: previous } = await supabase
    .from('Inquiry_Message')
    .select('sender_role, read_at')
    .eq('resident_id', residentId)
    .eq('psychologist_id', psychologistId)
    .order('created_at', { ascending: false })
    .limit(1);
  const prev = previous?.[0];

  const { data, error } = await supabase
    .from('Inquiry_Message')
    .insert([{ resident_id: residentId, psychologist_id: psychologistId, sender_role: senderRole, body }])
    .select(INQUIRY_MESSAGE_FIELDS);
  if (error) return { error };

  const message = data[0];
  const psychUserId = await getPsychologistUserId(psychologistId);

  io.to(`inquiry-${residentId}-${psychologistId}`).emit('new-inquiry-message', {
    ...message,
    resident_id: Number(residentId),
    psychologist_id: Number(psychologistId),
  });
  if (psychUserId) io.to(`user-${psychUserId}`).emit('inquiry-updated', { resident_id: Number(residentId) });
  io.to(`user-${residentId}`).emit('inquiry-updated', { psychologist_id: Number(psychologistId) });

  // Notify only when the recipient doesn't already have an unread message
  // waiting from this same sender in this thread.
  const recipientAlreadyPinged = prev && prev.sender_role === senderRole && !prev.read_at;
  if (!recipientAlreadyPinged) {
    try {
      if (senderRole === 'resident' && psychUserId) {
        const { data: thread } = await supabase
          .from('Inquiry_Thread').select('resolved_at')
          .eq('resident_id', residentId).eq('psychologist_id', psychologistId).maybeSingle();
        const isNewInquiry = !prev || Boolean(thread?.resolved_at);
        await supabase.from('Notification').insert([{
          user_id: psychUserId,
          type: 'message',
          title: isNewInquiry ? `New inquiry from ${senderName || 'a resident'}` : `New message from ${senderName || 'a resident'}`,
          body: 'Open Resident Inquiries to read and reply.',
          link: `/psychologist/inquiries?resident=${residentId}`,
          read: false,
        }]);
      } else if (senderRole === 'psychologist') {
        await supabase.from('Notification').insert([{
          user_id: residentId,
          type: 'message',
          title: `${senderName || 'Your psychologist'} replied to your inquiry`,
          body: 'Open Messages to read the reply.',
          link: `/messages?psychologist=${psychologistId}`,
          read: false,
        }]);
      }
    } catch {
      // best-effort: the message itself was already saved and delivered
    }
  }

  return { message };
}

// GET /bookings/:id/messages, POST /bookings/:id/messages -- the chat embedded
// on the Session page. Now just a window onto the same (resident, psychologist)
// thread the booking belongs to; only that booking's two participants pass.
async function getBookingPair(bookingId) {
  const { data } = await supabase
    .from('Booking').select('resident_id, psychologist_id').eq('booking_id', bookingId).single();
  return data || null;
}

app.get('/bookings/:id/messages', requireAuth, async (req, res) => {
  const role = await getBookingParticipantRole(req.params.id, req.user);
  if (!role) return res.status(403).json({ error: 'You are not part of this conversation' });
  const pair = await getBookingPair(req.params.id);
  if (!pair) return res.status(404).json({ error: 'Booking not found' });

  const { data, error } = await supabase
    .from('Inquiry_Message')
    .select(INQUIRY_MESSAGE_FIELDS)
    .eq('resident_id', pair.resident_id)
    .eq('psychologist_id', pair.psychologist_id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  await markInquiryRead(pair.resident_id, pair.psychologist_id, role);
  res.json(data);
});

app.post('/bookings/:id/messages', requireAuth, async (req, res) => {
  const body = (req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'body is required' });
  const role = await getBookingParticipantRole(req.params.id, req.user);
  if (!role) return res.status(403).json({ error: 'You are not part of this conversation' });
  const pair = await getBookingPair(req.params.id);
  if (!pair) return res.status(404).json({ error: 'Booking not found' });

  const { message, error } = await postInquiryMessage({
    residentId: pair.resident_id,
    psychologistId: pair.psychologist_id,
    senderRole: role,
    body,
    senderName: req.user.name,
  });
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(message);
});

// ---- Resident side -------------------------------------------------------------
// resident_id is ALWAYS the caller's own verified id -- a resident can never read
// or write anyone else's thread.

// GET /residents/me/inquiries -- the resident's Messages inbox.
app.get('/residents/me/inquiries', requireAuth, requireRole('resident'), async (req, res) => {
  const { data: messages, error } = await supabase
    .from('Inquiry_Message')
    .select('psychologist_id, sender_role, body, created_at, read_at')
    .eq('resident_id', req.user.user_id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  if (messages.length === 0) return res.json([]);

  const psychIds = [...new Set(messages.map((m) => m.psychologist_id))];
  const [{ data: psychs }, { data: bookings }] = await Promise.all([
    supabase.from('Psychologist').select('psychologist_id, profile_photo_url, User(name)').in('psychologist_id', psychIds),
    supabase.from('Booking')
      .select('booking_id, psychologist_id, schedule, status, Payment(status)')
      .eq('resident_id', req.user.user_id)
      .in('psychologist_id', psychIds),
  ]);

  const now = new Date();
  const rows = psychIds.map((pid) => {
    const thread = messages.filter((m) => m.psychologist_id === pid);
    const psych = (psychs || []).find((p) => p.psychologist_id === pid);
    // Audio calls stay tied to a real, confirmed + paid upcoming booking.
    const callable = (bookings || [])
      .filter((b) => b.psychologist_id === pid && deriveBookingAppointmentStatus(b, now) === 'booked')
      .sort((a, b) => new Date(a.schedule) - new Date(b.schedule))[0];
    return {
      psychologist_id: pid,
      psychologist_name: psych?.User?.name || 'Your psychologist',
      profile_photo_url: psych?.profile_photo_url
        ? supabase.storage.from('psychologist-photos').getPublicUrl(psych.profile_photo_url).data.publicUrl
        : null,
      last_message: thread[0].body,
      last_message_at: thread[0].created_at,
      last_sender_role: thread[0].sender_role,
      unread_count: thread.filter((m) => m.sender_role === 'psychologist' && !m.read_at).length,
      call_booking_id: callable?.booking_id || null,
      call_schedule: callable?.schedule || null,
    };
  });
  res.json(rows);
});

// GET/POST /inquiries/:psychologistId/messages -- resident side of one thread.
app.get('/inquiries/:psychologistId/messages', requireAuth, requireRole('resident'), async (req, res) => {
  const { data, error } = await supabase
    .from('Inquiry_Message')
    .select(INQUIRY_MESSAGE_FIELDS)
    .eq('resident_id', req.user.user_id)
    .eq('psychologist_id', req.params.psychologistId)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  await markInquiryRead(req.user.user_id, req.params.psychologistId, 'resident');
  res.json(data);
});

// Residents may message any verified psychologist -- no booking required.
app.post('/inquiries/:psychologistId/messages', requireAuth, requireRole('resident'), async (req, res) => {
  const body = (req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'body is required' });

  const { data: psychologist } = await supabase
    .from('Psychologist')
    .select('psychologist_id, is_verified')
    .eq('psychologist_id', req.params.psychologistId)
    .single();
  if (!psychologist || !psychologist.is_verified) return res.status(404).json({ error: 'Psychologist not found' });

  // The name attached to the inquiry comes from the account record, never the token
  // payload or request body, so it is always the real account owner's name.
  const { data: me } = await supabase.from('User').select('name, role').eq('user_id', req.user.user_id).single();
  if (!me || me.role !== 'resident') return res.status(403).json({ error: 'Only registered residents can send inquiries' });

  const { message, error } = await postInquiryMessage({
    residentId: req.user.user_id,
    psychologistId: psychologist.psychologist_id,
    senderRole: 'resident',
    body,
    senderName: me.name,
  });
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(message);
});

// ---- Psychologist side ---------------------------------------------------------
// psychologist_id is ALWAYS resolved from the caller's own JWT.

// GET /psychologists/me/inquiries -- Resident Inquiries list: one row per
// resident, with real name, last message, unread count, inquiry status and the
// live booking-status badge.
app.get('/psychologists/me/inquiries', requireAuth, requireRole('psychologist'), async (req, res) => {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data: messages, error } = await supabase
    .from('Inquiry_Message')
    .select('resident_id, sender_role, body, created_at, read_at')
    .eq('psychologist_id', psychologistId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  if (messages.length === 0) return res.json([]);

  const residentIds = [...new Set(messages.map((m) => m.resident_id))];
  const [usersRes, bookingsRes, threadsRes] = await Promise.all([
    supabase.from('User').select('user_id, name, role').in('user_id', residentIds),
    supabase.from('Booking')
      .select('*, Payment(status, amount)')
      .eq('psychologist_id', psychologistId)
      .in('resident_id', residentIds),
    supabase.from('Inquiry_Thread').select('resident_id, resolved_at')
      .eq('psychologist_id', psychologistId).in('resident_id', residentIds),
  ]);
  if (usersRes.error) return res.status(500).json({ error: usersRes.error.message });
  if (bookingsRes.error) return res.status(500).json({ error: bookingsRes.error.message });
  // Inquiry_Thread may not exist yet if the migration hasn't been run -- degrade
  // to "never resolved" rather than failing the whole inbox.
  const threads = threadsRes.error ? [] : threadsRes.data;

  const now = new Date();
  const rows = [];
  for (const residentId of residentIds) {
    const user = usersRes.data.find((u) => u.user_id === residentId);
    // Only real resident accounts are listed; nothing is guessed or invented.
    if (!user || user.role !== 'resident') continue;
    const thread = messages.filter((m) => m.resident_id === residentId);
    const { booking_status, primary } = summarizeBookingStatus(
      bookingsRes.data.filter((b) => b.resident_id === residentId), now
    );
    const { inquiry_status, unread_count } = deriveInquiryStatus(
      thread, threads.find((t) => t.resident_id === residentId)
    );
    rows.push({
      resident_id: residentId,
      resident_name: user.name,
      last_message: thread[0].body,
      last_message_at: thread[0].created_at,
      last_sender_role: thread[0].sender_role,
      unread_count,
      inquiry_status,
      booking_status,
      next_appointment: primary ? serializeAppointment(primary) : null,
    });
  }
  rows.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
  res.json(rows);
});

// GET /psychologists/me/inquiries/unread-count -- sidebar badge.
app.get('/psychologists/me/inquiries/unread-count', requireAuth, requireRole('psychologist'), async (req, res) => {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.json({ unread_messages: 0, unread_conversations: 0 });

  const { data, error } = await supabase
    .from('Inquiry_Message')
    .select('resident_id')
    .eq('psychologist_id', psychologistId)
    .eq('sender_role', 'resident')
    .is('read_at', null);
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    unread_messages: data.length,
    unread_conversations: new Set(data.map((m) => m.resident_id)).size,
  });
});

// GET /psychologists/me/inquiries/:residentId -- conversation header: resident
// profile (non-sensitive fields only), inquiry status, booking status, and every
// appointment this resident has with THIS psychologist.
app.get('/psychologists/me/inquiries/:residentId', requireAuth, requireRole('psychologist'), async (req, res) => {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });
  const residentId = Number(req.params.residentId);
  if (!Number.isInteger(residentId)) return res.status(400).json({ error: 'Invalid resident' });

  if (!(await psychologistCanAccessResident(psychologistId, residentId))) {
    return res.status(403).json({ error: 'This resident has not contacted you' });
  }

  const [userRes, bookingsRes, messagesRes, threadRes] = await Promise.all([
    // Deliberately no email/phone/address/assessment data: name, barangay and
    // join date are enough to know who you're talking to.
    supabase.from('User').select('user_id, name, role, created_at, Barangay(name, city)').eq('user_id', residentId).single(),
    supabase.from('Booking')
      .select('*, Payment(status, amount)')
      .eq('psychologist_id', psychologistId).eq('resident_id', residentId),
    supabase.from('Inquiry_Message').select('sender_role, created_at, read_at')
      .eq('psychologist_id', psychologistId).eq('resident_id', residentId)
      .order('created_at', { ascending: false }),
    supabase.from('Inquiry_Thread').select('resolved_at')
      .eq('psychologist_id', psychologistId).eq('resident_id', residentId).maybeSingle(),
  ]);
  if (userRes.error || !userRes.data || userRes.data.role !== 'resident') {
    return res.status(404).json({ error: 'Resident not found' });
  }
  if (bookingsRes.error) return res.status(500).json({ error: bookingsRes.error.message });

  const now = new Date();
  const { booking_status, primary, derived } = summarizeBookingStatus(bookingsRes.data, now);
  const { inquiry_status, unread_count } = deriveInquiryStatus(messagesRes.data || [], threadRes.data);
  const appointments = derived
    .sort((a, b) => new Date(b.schedule) - new Date(a.schedule))
    .map(serializeAppointment);

  res.json({
    resident: {
      resident_id: residentId,
      name: userRes.data.name,
      barangay: userRes.data.Barangay ? [userRes.data.Barangay.name, userRes.data.Barangay.city].filter(Boolean).join(', ') : null,
      member_since: userRes.data.created_at || null,
      // My Clients only lists residents with a real booking -- link there
      // only when that page will actually show them.
      is_client: bookingsRes.data.length > 0,
    },
    inquiry_status,
    unread_count,
    resolved_at: threadRes.data?.resolved_at || null,
    booking_status,
    primary_appointment: primary ? serializeAppointment(primary) : null,
    appointments,
  });
});

// GET/POST /psychologists/me/inquiries/:residentId/messages -- psychologist side
// of one thread. Opening it marks the resident's messages read.
app.get('/psychologists/me/inquiries/:residentId/messages', requireAuth, requireRole('psychologist'), async (req, res) => {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data, error } = await supabase
    .from('Inquiry_Message')
    .select(INQUIRY_MESSAGE_FIELDS)
    .eq('resident_id', req.params.residentId)
    .eq('psychologist_id', psychologistId)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  await markInquiryRead(req.params.residentId, psychologistId, 'psychologist');
  res.json(data);
});

app.post('/psychologists/me/inquiries/:residentId/messages', requireAuth, requireRole('psychologist'), async (req, res) => {
  const body = (req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'body is required' });

  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });
  const residentId = Number(req.params.residentId);

  // A psychologist can only reply to someone who contacted or booked them --
  // they can't cold-message arbitrary user ids.
  if (!(await psychologistCanAccessResident(psychologistId, residentId))) {
    return res.status(403).json({ error: 'This resident has not contacted you' });
  }

  const { message, error } = await postInquiryMessage({
    residentId,
    psychologistId,
    senderRole: 'psychologist',
    body,
    senderName: req.user.name,
  });
  if (error) return res.status(500).json({ error: error.message });

  // Replying means the resident's messages have been seen.
  await markInquiryRead(residentId, psychologistId, 'psychologist');
  res.status(201).json(message);
});

// POST /psychologists/me/inquiries/:residentId/resolve and /reopen -- the only
// manual inquiry-status action. Has no effect on any booking.
async function setInquiryResolved(req, res, resolved) {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });
  const residentId = Number(req.params.residentId);
  if (!(await psychologistCanAccessResident(psychologistId, residentId))) {
    return res.status(403).json({ error: 'This resident has not contacted you' });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('Inquiry_Thread')
    .upsert([{ resident_id: residentId, psychologist_id: psychologistId, resolved_at: resolved ? now : null, updated_at: now }],
      { onConflict: 'resident_id,psychologist_id' });
  if (error) return res.status(500).json({ error: error.message });

  if (resolved) await markInquiryRead(residentId, psychologistId, 'psychologist');
  io.to(`user-${req.user.user_id}`).emit('inquiry-updated', { resident_id: residentId });
  res.json({ resolved, resolved_at: resolved ? now : null });
}

app.post('/psychologists/me/inquiries/:residentId/resolve', requireAuth, requireRole('psychologist'), (req, res) => setInquiryResolved(req, res, true));
app.post('/psychologists/me/inquiries/:residentId/reopen', requireAuth, requireRole('psychologist'), (req, res) => setInquiryResolved(req, res, false));

// GET /care-credits/reconciliation?barangay_id=3 (barangay_id optional — omit for every barangay)
//
// Verifies the Care_Credit ledger actually adds up per barangay: total issued must equal
// available + used, and every credit marked 'used' must be linked to exactly one Booking.
// An "orphaned" used credit (used but no booking references it) means the ledger and the
// bookings table drifted apart — the exact failure mode a racy or non-atomic claim
// could cause; see db/create_booking_transaction.sql for how claiming is made atomic.
app.get('/care-credits/reconciliation', async (req, res) => {
  const { barangay_id } = req.query;

  let query = supabase.from('Care_Credit').select('credit_id, barangay_id, amount, status');
  if (barangay_id) query = query.eq('barangay_id', barangay_id);

  const { data: credits, error: creditsError } = await query;
  if (creditsError) return res.status(500).json({ error: creditsError.message });

  const usedCreditIds = credits.filter((c) => c.status === 'used').map((c) => c.credit_id);

  let linkedIds = new Set();
  if (usedCreditIds.length > 0) {
    const { data: linkedBookings, error: bookingsError } = await supabase
      .from('Booking')
      .select('care_credit_id')
      .in('care_credit_id', usedCreditIds);

    if (bookingsError) return res.status(500).json({ error: bookingsError.message });
    linkedIds = new Set(linkedBookings.map((b) => b.care_credit_id));
  }

  const byBarangay = {};
  for (const c of credits) {
    if (!byBarangay[c.barangay_id]) {
      byBarangay[c.barangay_id] = {
        barangay_id: c.barangay_id,
        total_issued: 0,
        total_amount_issued: 0,
        available: 0,
        amount_available: 0,
        reserved: 0,
        amount_reserved: 0,
        used: 0,
        amount_used: 0,
        other_status: 0,
        orphaned_used_credits: 0,
      };
    }
    const b = byBarangay[c.barangay_id];
    b.total_issued += 1;
    b.total_amount_issued += Number(c.amount);
    if (c.status === 'available') {
      b.available += 1;
      b.amount_available += Number(c.amount);
    } else if (c.status === 'reserved') {
      // Held against a pending Appointment Request — not yet spent, not free to reuse.
      // See db/booking_accept_decline.sql: accept turns this into 'used', decline
      // releases it back to 'available'.
      b.reserved += 1;
      b.amount_reserved += Number(c.amount);
    } else if (c.status === 'used') {
      b.used += 1;
      b.amount_used += Number(c.amount);
      if (!linkedIds.has(c.credit_id)) b.orphaned_used_credits += 1;
    } else {
      b.other_status += 1;
    }
  }

  const results = Object.values(byBarangay).map((b) => ({
    ...b,
    reconciled:
      b.other_status === 0 &&
      b.orphaned_used_credits === 0 &&
      b.available + b.reserved + b.used === b.total_issued,
  }));

  if (barangay_id) {
    return res.json(
      results[0] || {
        barangay_id: Number(barangay_id),
        total_issued: 0,
        total_amount_issued: 0,
        available: 0,
        amount_available: 0,
        reserved: 0,
        amount_reserved: 0,
        used: 0,
        amount_used: 0,
        other_status: 0,
        orphaned_used_credits: 0,
        reconciled: true,
      }
    );
  }
  res.json(results);
});

// POST /care-credits/allocate — issues new Care Credits against the barangay's Budget.
// Two modes, mutually exclusive:
//   { resident_id, amount } — issue one credit to a single resident. barangay_id is
//     always derived from that resident's own User.barangay_id, never taken from the
//     request body, so a credit can never be issued under a barangay the recipient
//     doesn't actually belong to (the segregation guarantee this module is named for).
//   { barangay_id, amount } — issue one credit of `amount` to every resident currently
//     registered under that barangay (an LGU funding a round of credits for its own residents).
// Both modes run through allocate_care_credit_single/allocate_care_credits_bulk (see
// db/budget_and_subscription.sql), which reject the request if the barangay's
// subscription isn't active or its budget can't cover the amount -- see Resource &
// Budget Management / Subscription Monitoring.
app.post('/care-credits/allocate', requireAuth, requireRole('admin'), async (req, res) => {
  const { barangay_id, resident_id, amount } = req.body;

  const numericAmount = Number(amount);
  if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  if (!barangay_id && !resident_id) {
    return res.status(400).json({
      error: 'either barangay_id (fund every resident there) or resident_id (fund just one) is required',
    });
  }

  const handleAllocationError = (error, res) => {
    if (error.message === 'RESIDENT_NOT_FOUND') return res.status(404).json({ error: 'Resident not found' });
    if (error.message === 'SUBSCRIPTION_INACTIVE') return res.status(400).json({ error: "This barangay's subscription is not active" });
    if (error.message === 'NO_BUDGET_FOR_BARANGAY') return res.status(400).json({ error: 'This barangay has no funded budget yet' });
    if (error.message === 'INSUFFICIENT_BUDGET') return res.status(400).json({ error: 'Insufficient remaining budget for this barangay' });
    return res.status(500).json({ error: error.message });
  };

  if (resident_id) {
    const { data, error } = await supabase.rpc('allocate_care_credit_single', {
      p_resident_id: resident_id,
      p_amount: numericAmount,
    });

    if (error) return handleAllocationError(error, res);
    return res.status(201).json({ credits_issued: 1, total_amount: numericAmount, credits: [data] });
  }

  const { data: barangay, error: barangayError } = await supabase
    .from('Barangay')
    .select('barangay_id')
    .eq('barangay_id', barangay_id)
    .single();

  if (barangayError || !barangay) return res.status(404).json({ error: 'Barangay not found' });

  const { data, error } = await supabase.rpc('allocate_care_credits_bulk', {
    p_barangay_id: barangay_id,
    p_amount: numericAmount,
  });

  if (error) return handleAllocationError(error, res);
  res.status(201).json(data);
});

// GET /admin/subscription-plans — the full catalog, including retired plans, so
// the admin can still see and reactivate something they'd turned off.
app.get('/admin/subscription-plans', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase.from('Subscription_Plan').select('*').order('price', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /admin/subscription-plans — add a new plan tier to the catalog.
app.post('/admin/subscription-plans', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, description, price, care_credits, validity_months, is_featured, features } = req.body;
  if (!name || !price || !care_credits) {
    return res.status(400).json({ error: 'name, price, and care_credits are required' });
  }
  const { data, error } = await supabase
    .from('Subscription_Plan')
    .insert([{
      name,
      description: description || null,
      price: Number(price),
      care_credits: Number(care_credits),
      validity_months: validity_months ? Number(validity_months) : 12,
      is_featured: Boolean(is_featured),
      ...(Array.isArray(features) ? { features: features.map((x) => String(x).trim()).filter(Boolean).slice(0, 12) } : {}),
    }])
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

// PATCH /admin/subscription-plans/:id — edit any field, including is_active. Turning
// a plan inactive just hides it from the barangay-facing catalog -- every barangay
// already on it keeps its own snapshot of the terms (Subscription.plan_name/price/
// care_credits), so nobody currently subscribed is affected.
app.patch('/admin/subscription-plans/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, description, price, care_credits, validity_months, is_featured, is_active, features } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (price !== undefined) updates.price = Number(price);
  if (care_credits !== undefined) updates.care_credits = Number(care_credits);
  if (validity_months !== undefined) updates.validity_months = Number(validity_months);
  if (is_featured !== undefined) updates.is_featured = Boolean(is_featured);
  if (is_active !== undefined) updates.is_active = Boolean(is_active);
  if (Array.isArray(features)) updates.features = features.map((x) => String(x).trim()).filter(Boolean).slice(0, 12);

  const { data, error } = await supabase.from('Subscription_Plan').update(updates).eq('plan_id', req.params.id).select();
  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'Plan not found' });
  res.json(data[0]);
});

// DELETE /admin/subscription-plans/:id — removes it from the catalog entirely.
// Any barangay already on it keeps its snapshot; only plan_id on their row goes NULL.
app.delete('/admin/subscription-plans/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { error } = await supabase.from('Subscription_Plan').delete().eq('plan_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: true });
});

// GET /admin/subscriptions — every barangay's subscription, enriched with the plan
// it's on and its validity window. Barangays with no row yet default to 'inactive',
// which is also what blocks funding/allocation for them (see db/budget_and_subscription.sql).
app.get('/admin/subscriptions', requireAuth, requireRole('admin'), async (req, res) => {
  const { data: barangays, error: bError } = await supabase.from('Barangay').select('barangay_id, name, city');
  if (bError) return res.status(500).json({ error: bError.message });

  // Expire / activate from real server-side dates before reporting.
  await syncSubscriptions();
  const { data: subs, error: sError } = await supabase.from('Subscription').select('*');
  if (sError) return res.status(500).json({ error: sError.message });
  const { data: openReqs } = await supabase.from('Subscription_Request').select('request_id, barangay_id, status, plan_name').in('status', OPEN_REQUEST_STATUSES);
  const openByBarangay = new Map((openReqs || []).map((r) => [String(r.barangay_id), r]));
  const now = new Date();

  const subByBarangay = Object.fromEntries(subs.map((s) => [s.barangay_id, s]));

  res.json(
    barangays.map((barangay) => {
      const sub = subByBarangay[barangay.barangay_id];
      const open = openByBarangay.get(String(barangay.barangay_id)) || null;
      const display = subscriptionDisplayStatus(sub, open, now);
      const renewalDue = display === 'expiring_soon' || display === 'pending_renewal';
      return {
        display_status: display,
        days_remaining: sub?.status === 'active' && sub?.expires_at ? Math.max(0, daysUntil(sub.expires_at, now)) : null,
        upcoming_status: open?.status || null,
        upcoming_plan: open?.plan_name || null,
        barangay_id: barangay.barangay_id,
        name: barangay.name,
        city: barangay.city,
        subscription_id: sub?.subscription_id || null,
        plan_id: sub?.plan_id || null,
        plan_name: sub?.plan_name || sub?.plan || null,
        price: sub?.price ?? null,
        care_credits: sub?.care_credits ?? null,
        validity_months: sub?.validity_months ?? null,
        status: sub?.status === 'past_due' ? 'expired' : (sub?.status || 'inactive'),
        started_at: sub?.started_at || null,
        expires_at: sub?.expires_at || null,
        renewed_at: sub?.renewed_at || null,
        renewal_due: renewalDue,
      };
    })
  );
});

// POST /admin/subscriptions/:barangayId — body: { status }. A manual override for
// deactivating/cancelling a subscription outside the normal assign/renew flow.
app.post('/admin/subscriptions/:barangayId', requireAuth, requireRole('admin'), async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['active', 'inactive', 'expired', 'cancelled'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }

  const { data: barangay, error: bError } = await supabase
    .from('Barangay')
    .select('barangay_id')
    .eq('barangay_id', req.params.barangayId)
    .single();

  if (bError || !barangay) return res.status(404).json({ error: 'Barangay not found' });

  const { data, error } = await supabase
    .from('Subscription')
    .upsert([{ barangay_id: req.params.barangayId, status }], { onConflict: 'barangay_id' })
    .select();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('Subscription_History').insert([{
    barangay_id: req.params.barangayId,
    plan_id: data[0].plan_id,
    plan_name: data[0].plan_name,
    action: 'status_changed',
    status,
    actor_role: 'admin',
  }]);

  // Best-effort: the subscription change already succeeded either way.
  const lguUserId = await getLguUserIdForBarangay(req.params.barangayId);
  if (lguUserId) {
    await supabase.from('Notification').insert([{
      user_id: lguUserId,
      type: 'system',
      title: 'Subscription updated',
      body: `Your barangay's subscription is now ${status}.`,
      link: '/lgu/subscription',
      read: false,
    }]);
  }

  res.json(data[0]);
});


// Manual admin overrides (assign / renew) bypass the request workflow, so they
// are refused while an approved or scheduled renewal exists -- otherwise the
// two could produce overlapping terms. Neither issues plan Care Credits.
async function hasCommittedRenewal(barangayId) {
  const { data, error } = await supabase.from('Subscription_Request').select('request_id')
    .eq('barangay_id', barangayId).in('status', ['approved', 'scheduled']).limit(1);
  if (error) return false; // migration not run yet: nothing to conflict with
  return (data || []).length > 0;
}

// POST /admin/subscriptions/:barangayId/assign — body: { plan_id }. Admin directly
// puts a barangay on a plan and activates it immediately -- the LGU Admin is the
// authority here, same as a barangay self-subscribing from its own side.
app.post('/admin/subscriptions/:barangayId/assign', requireAuth, requireRole('admin'), async (req, res) => {
  const { plan_id } = req.body;
  if (!plan_id) return res.status(400).json({ error: 'plan_id is required' });

  const { data: barangay } = await supabase.from('Barangay').select('barangay_id').eq('barangay_id', req.params.barangayId).single();
  if (!barangay) return res.status(404).json({ error: 'Barangay not found' });
  if (await hasCommittedRenewal(req.params.barangayId)) {
    return res.status(409).json({ error: 'This barangay has an approved renewal request. Use Subscription Renewal Requests instead.' });
  }

  try {
    const sub = await applySubscriptionPlan(req.params.barangayId, plan_id, 'admin');
    const lguUserId = await getLguUserIdForBarangay(req.params.barangayId);
    if (lguUserId) {
      await supabase.from('Notification').insert([{
        user_id: lguUserId,
        type: 'system',
        title: 'Subscription plan assigned',
        body: `Your barangay has been placed on the ${sub.plan_name} plan.`,
        link: '/lgu/subscription',
        read: false,
      }]);
    }
    res.json(sub);
  } catch (err) {
    if (err.message === 'PLAN_NOT_FOUND') return res.status(404).json({ error: 'Plan not found or no longer active' });
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/subscriptions/:barangayId/renew — extends the barangay's current plan
// (or a newly chosen one, via plan_id) by another validity period.
app.post('/admin/subscriptions/:barangayId/renew', requireAuth, requireRole('admin'), async (req, res) => {
  if (await hasCommittedRenewal(req.params.barangayId)) {
    return res.status(409).json({ error: 'This barangay has an approved renewal request. Use Subscription Renewal Requests instead.' });
  }
  const { data: existing } = await supabase.from('Subscription').select('plan_id').eq('barangay_id', req.params.barangayId).maybeSingle();
  const planId = req.body.plan_id || existing?.plan_id;
  if (!planId) return res.status(400).json({ error: 'This barangay has no plan to renew -- assign one first' });

  try {
    const sub = await applySubscriptionPlan(req.params.barangayId, planId, 'admin', { isRenewal: true });
    res.json(sub);
  } catch (err) {
    if (err.message === 'PLAN_NOT_FOUND') return res.status(404).json({ error: 'Plan not found or no longer active' });
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/subscriptions/:barangayId/history — this barangay's full subscribe/
// renew/status-change audit trail, most recent first.
app.get('/admin/subscriptions/:barangayId/history', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('Subscription_History')
    .select('*')
    .eq('barangay_id', req.params.barangayId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /admin/budgets — every barangay's funded/spent/remaining totals.
app.get('/admin/budgets', requireAuth, requireRole('admin'), async (req, res) => {
  const { data: barangays, error: bError } = await supabase.from('Barangay').select('barangay_id, name, city');
  if (bError) return res.status(500).json({ error: bError.message });

  const { data: budgets, error: budError } = await supabase.from('Budget').select('*');
  if (budError) return res.status(500).json({ error: budError.message });

  const budgetByBarangay = Object.fromEntries(budgets.map((b) => [b.barangay_id, b]));

  res.json(
    barangays.map((barangay) => {
      const budget = budgetByBarangay[barangay.barangay_id];
      const totalFunded = budget ? Number(budget.total_funded) : 0;
      const totalSpent = budget ? Number(budget.total_spent) : 0;
      return {
        barangay_id: barangay.barangay_id,
        name: barangay.name,
        city: barangay.city,
        total_funded: totalFunded,
        total_spent: totalSpent,
        remaining: totalFunded - totalSpent,
      };
    })
  );
});

// POST /admin/budgets/:barangayId/fund — body: { amount }. Blocked unless the
// barangay's subscription is active — see db/budget_and_subscription.sql.
app.post('/admin/budgets/:barangayId/fund', requireAuth, requireRole('admin'), async (req, res) => {
  const { amount } = req.body;
  const numericAmount = Number(amount);
  if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const { data, error } = await supabase.rpc('fund_barangay_budget', {
    p_barangay_id: req.params.barangayId,
    p_amount: numericAmount,
  });

  if (error) {
    if (error.message === 'SUBSCRIPTION_INACTIVE') {
      return res.status(400).json({ error: "This barangay's subscription is not active" });
    }
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
});

// GET /admin/accomplishment-report — per-barangay activity summary: residents,
// counseling sessions, care credits, and budget. Wired to the Admin role for now
// since there's no separate LGU account type yet (same gap as Resource & Budget
// Management) -- "Generate Barangay Report (Own)" is simulated here by picking
// one barangay from the full list rather than a real per-LGU login scope.
app.get('/admin/accomplishment-report', requireAuth, requireRole('admin'), async (req, res) => {
  const { data: barangays, error: bError } = await supabase.from('Barangay').select('barangay_id, name, city');
  if (bError) return res.status(500).json({ error: bError.message });

  const { data: residents, error: residentsError } = await supabase
    .from('User')
    .select('user_id, barangay_id')
    .eq('role', 'resident');
  if (residentsError) return res.status(500).json({ error: residentsError.message });

  const { data: bookings, error: bookingsError } = await supabase
    .from('Booking')
    .select('status, User(barangay_id)');
  if (bookingsError) return res.status(500).json({ error: bookingsError.message });

  const { data: credits, error: creditsError } = await supabase
    .from('Care_Credit')
    .select('barangay_id, amount, status');
  if (creditsError) return res.status(500).json({ error: creditsError.message });

  const { data: budgets, error: budgetError } = await supabase.from('Budget').select('*');
  if (budgetError) return res.status(500).json({ error: budgetError.message });

  const budgetByBarangay = Object.fromEntries(budgets.map((b) => [b.barangay_id, b]));

  res.json(barangays.map((barangay) => {
    const residentCount = residents.filter((u) => u.barangay_id === barangay.barangay_id).length;

    const barangayBookings = bookings.filter((b) => b.User?.barangay_id === barangay.barangay_id);
    const confirmedSessions = barangayBookings.filter((b) => b.status === 'confirmed').length;

    const barangayCredits = credits.filter((c) => c.barangay_id === barangay.barangay_id);
    const creditsIssued = barangayCredits.reduce((sum, c) => sum + Number(c.amount), 0);
    const creditsUsed = barangayCredits.filter((c) => c.status === 'used').reduce((sum, c) => sum + Number(c.amount), 0);

    const budget = budgetByBarangay[barangay.barangay_id];
    const budgetFunded = budget ? Number(budget.total_funded) : 0;
    const budgetSpent = budget ? Number(budget.total_spent) : 0;

    return {
      barangay_id: barangay.barangay_id,
      name: barangay.name,
      city: barangay.city,
      resident_count: residentCount,
      session_count: barangayBookings.length,
      confirmed_session_count: confirmedSessions,
      care_credits_issued: creditsIssued,
      care_credits_used: creditsUsed,
      budget_funded: budgetFunded,
      budget_spent: budgetSpent,
      budget_remaining: budgetFunded - budgetSpent,
    };
  }));
});

// GET /admin/platform-report — "Reports & Analytics": platform-WIDE trends,
// not per-barangay like Accomplishment Report above. Last 12 months of real
// signups and sessions, plus a real payments summary.
app.get('/admin/platform-report', requireAuth, requireRole('admin'), async (req, res) => {
  const [usersRes, bookingsRes, paymentsRes] = await Promise.all([
    supabase.from('User').select('role, created_at'),
    supabase.from('Booking').select('status, schedule'),
    supabase.from('Payment').select('amount, platform_fee, psychologist_payout, status, created_at'),
  ]);
  if (usersRes.error) return res.status(500).json({ error: usersRes.error.message });
  if (bookingsRes.error) return res.status(500).json({ error: bookingsRes.error.message });
  if (paymentsRes.error) return res.status(500).json({ error: paymentsRes.error.message });

  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' }) });
  }
  const monthKey = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${d.getMonth()}`;
  };

  const signupsByMonth = months.map((m) => {
    const key = `${m.year}-${m.month}`;
    const inMonth = usersRes.data.filter((u) => monthKey(u.created_at) === key);
    return {
      label: m.label,
      residents: inMonth.filter((u) => u.role === 'resident').length,
      psychologists: inMonth.filter((u) => u.role === 'psychologist').length,
    };
  });

  const sessionsByMonth = months.map((m) => {
    const key = `${m.year}-${m.month}`;
    const inMonth = bookingsRes.data.filter((b) => monthKey(b.schedule) === key);
    return {
      label: m.label,
      confirmed: inMonth.filter((b) => b.status === 'confirmed').length,
      pending: inMonth.filter((b) => b.status === 'pending').length,
      cancelled: inMonth.filter((b) => b.status === 'cancelled' || b.status === 'declined').length,
    };
  });

  const paidPayments = paymentsRes.data.filter((p) => p.status === 'paid');

  res.json({
    signups_by_month: signupsByMonth,
    sessions_by_month: sessionsByMonth,
    payments: {
      total_collected: paidPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0),
      platform_fees: paidPayments.reduce((sum, p) => sum + Number(p.platform_fee || 0), 0),
      psychologist_payouts: paidPayments.reduce((sum, p) => sum + Number(p.psychologist_payout || 0), 0),
      pending_count: paymentsRes.data.filter((p) => p.status === 'pending').length,
      paid_count: paidPayments.length,
    },
  });
});

// GET /jitsi-token/:bookingId?name=Joan&role=resident
app.get('/jitsi-token/:bookingId', (req, res) => {
  const { bookingId } = req.params;
  const { name, role } = req.query;

  const roomName = `openup-booking-${bookingId}`;
  const isModerator = role === 'psychologist'; // psychologist moderates the session

  const payload = {
    aud: 'jitsi',
    iss: 'chat',
    sub: process.env.JAAS_APP_ID,
    room: roomName,
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour expiry
    context: {
      user: {
        name: name || 'Guest',
        moderator: isModerator,
      },
      features: {
        livestreaming: false,
        recording: false,
        transcription: false,
      },
    },
  };

  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header: { kid: process.env.JAAS_KEY_ID },
  });

  res.json({ token, room: `${process.env.JAAS_APP_ID}/${roomName}` });
});

app.get('/group-sessions', async (req, res) => {
  const { data, error } = await supabase
    .from('Group_Session')
    .select('*, Psychologist(psychologist_id, User(name)), Group_Session_Participant(participant_id)')
    .eq('status', 'scheduled')
    .order('schedule', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  // Participant count only -- never the list of who's in it, same identity
  // boundary as the rest of this app's resident-facing views.
  res.json(data.map((s) => ({
    ...s,
    participant_count: s.Group_Session_Participant?.length || 0,
    Group_Session_Participant: undefined,
  })));
});

// POST /group-sessions/:id/join — registers this resident for a scheduled
// group session, refusing once max_participants is already reached. This is
// what makes "max participants" a real cap instead of a decorative number;
// the resident's client only navigates into the Jitsi room after this succeeds.
app.post('/group-sessions/:id/join', requireAuth, requireRole('resident'), async (req, res) => {
  const { data: session, error: findError } = await supabase
    .from('Group_Session')
    .select('group_session_id, status, max_participants, Group_Session_Participant(participant_id)')
    .eq('group_session_id', req.params.id)
    .single();

  if (findError || !session) return res.status(404).json({ error: 'Group session not found' });
  if (session.status !== 'scheduled') return res.status(409).json({ error: 'This session is no longer available to join.' });

  const currentCount = session.Group_Session_Participant?.length || 0;
  if (currentCount >= session.max_participants) {
    return res.status(409).json({ error: 'This session is full.' });
  }

  const { error } = await supabase
    .from('Group_Session_Participant')
    .insert([{ group_session_id: req.params.id, resident_id: req.user.user_id }]);

  // A duplicate join (already registered, e.g. rejoining after a dropped
  // connection) is fine -- not an error, just a no-op.
  if (error && error.code !== '23505') return res.status(500).json({ error: error.message });

  res.json({ joined: true });
});

// GET /psychologists/me/group-sessions — the ones this psychologist is hosting,
// for the "Facilitate Session" view (My Clients has the roster, this has the
// sessions themselves).
app.get('/psychologists/me/group-sessions', requireAuth, requireRole('psychologist'), async (req, res) => {
  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data, error } = await supabase
    .from('Group_Session')
    .select('*, Group_Session_Participant(participant_id)')
    .eq('psychologist_id', psychologistId)
    .order('schedule', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map((s) => ({
    ...s,
    participant_count: s.Group_Session_Participant?.length || 0,
    Group_Session_Participant: undefined,
  })));
});

// POST /group-sessions — schedules a new one this psychologist will host. Without
// this there'd be no way to ever create a Group_Session row, so "Facilitate
// Session" would have nothing to facilitate.
app.post('/group-sessions', requireAuth, requireRole('psychologist'), requireVerifiedPsychologist, async (req, res) => {
  const { topic, schedule, max_participants } = req.body;
  if (!topic || !schedule) return res.status(400).json({ error: 'topic and schedule are required' });

  const cap = max_participants === undefined ? 8 : Number(max_participants);
  if (!Number.isInteger(cap) || cap < 1 || cap > 8) {
    return res.status(400).json({ error: 'max_participants must be a whole number between 1 and 8' });
  }

  const psychologistId = await getOwnPsychologistId(req.user.user_id);
  if (!psychologistId) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data, error } = await supabase
    .from('Group_Session')
    .insert([{ psychologist_id: psychologistId, topic, schedule, max_participants: cap }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

// Shared ownership check for the status/reschedule actions below -- every one
// of them needs "is this session actually mine" before touching it.
async function getOwnedGroupSession(groupSessionId, userId) {
  const psychologistId = await getOwnPsychologistId(userId);
  if (!psychologistId) return { error: 'No psychologist profile found for this account', status: 404 };

  const { data: session, error } = await supabase
    .from('Group_Session')
    .select('group_session_id, psychologist_id')
    .eq('group_session_id', groupSessionId)
    .single();

  if (error || !session) return { error: 'Group session not found', status: 404 };
  if (session.psychologist_id !== psychologistId) return { error: 'This is not your session', status: 403 };
  return { session };
}

app.post('/group-sessions/:id/complete', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { error: ownErr, status } = await getOwnedGroupSession(req.params.id, req.user.user_id);
  if (ownErr) return res.status(status).json({ error: ownErr });

  const { data, error } = await supabase
    .from('Group_Session')
    .update({ status: 'completed' })
    .eq('group_session_id', req.params.id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.post('/group-sessions/:id/cancel', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { error: ownErr, status } = await getOwnedGroupSession(req.params.id, req.user.user_id);
  if (ownErr) return res.status(status).json({ error: ownErr });

  const { data, error } = await supabase
    .from('Group_Session')
    .update({ status: 'cancelled' })
    .eq('group_session_id', req.params.id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.patch('/group-sessions/:id/reschedule', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { schedule } = req.body;
  if (!schedule) return res.status(400).json({ error: 'schedule is required' });

  const { error: ownErr, status } = await getOwnedGroupSession(req.params.id, req.user.user_id);
  if (ownErr) return res.status(status).json({ error: ownErr });

  const { data, error } = await supabase
    .from('Group_Session')
    .update({ schedule })
    .eq('group_session_id', req.params.id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// Reuses the same JWT-signing logic as /jitsi-token, but keyed by group_session_id
app.get('/group-session-token/:groupSessionId', (req, res) => {
  const { groupSessionId } = req.params;
  const { name, role } = req.query;

  const roomName = `openup-group-${groupSessionId}`;
  const isModerator = role === 'psychologist';

  const payload = {
    aud: 'jitsi',
    iss: 'chat',
    sub: process.env.JAAS_APP_ID,
    room: roomName,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    context: {
      user: { name: name || 'Guest', moderator: isModerator },
      features: { livestreaming: false, recording: false, transcription: false },
    },
  };

  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header: { kid: process.env.JAAS_KEY_ID },
  });

  res.json({ token, room: `${process.env.JAAS_APP_ID}/${roomName}` });
});

// POST /auth/signup
app.post('/auth/signup', async (req, res) => {
  const { name, email, password, role, barangay_id, license_no, credentials, session_price } = req.body;

  if (!name || !email || !password || !role || !barangay_id) {
    return res.status(400).json({ error: 'name, email, password, role, and barangay_id are required' });
  }

  // Psychologist applicants need these up front — an admin can't verify a license
  // number that was never collected. session_price is deliberately NOT required
  // here: it's set later from the psychologist's own profile, after signup --
  // create_booking_transaction already refuses to book a psychologist with no
  // price set (PSYCHOLOGIST_NOT_FOUND), so this can never be booked around.
  if (role === 'psychologist' && (!license_no || !credentials)) {
    return res.status(400).json({ error: 'license_no and credentials are required for psychologists' });
  }

  // Check if email already exists
  const { data: existing } = await supabase
    .from('User')
    .select('user_id')
    .eq('email', email)
    .limit(1);

  if (existing && existing.length > 0) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('User')
    .insert([{
      name,
      email,
      password: hashedPassword,
      role,
      barangay_id,
      status: 'active',
    }])
    .select('user_id, name, email, role, barangay_id, status'); // never return the password

  if (error) {
    return res.status(500).json({ error: friendlyDbError(error) });
  }

  const user = data[0];

  if (role === 'psychologist') {
    // Unverified and unbookable until an admin approves it — see POST /admin/psychologists/:id/verify
    const { error: psychError } = await supabase
      .from('Psychologist')
      .insert([{
        user_id: user.user_id,
        license_no,
        credentials,
        session_price: session_price ? Number(session_price) : null,
        specialties: [],
        is_verified: false,
        is_available: false,
      }]);

    if (psychError) {
      // Roll back the User row rather than leaving a psychologist account with no profile
      await supabase.from('User').delete().eq('user_id', user.user_id);
      return res.status(500).json({ error: psychError.message });
    }
  }

  res.status(201).json(user);
});

// POST /auth/login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { data: users, error } = await supabase
    .from('User')
    .select('*')
    .eq('email', email)
    .limit(1);

  if (error) {
    return res.status(500).json({ error: friendlyDbError(error) });
  }

  if (!users || users.length === 0) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const user = users[0];
  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'This account has been suspended. Contact an administrator.' });
  }
  if (user.status === 'rejected') {
    return res.status(403).json({ error: 'This account is not active.' });
  }

  const token = jwt.sign(
    { user_id: user.user_id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
      barangay_id: user.barangay_id,
    },
  });
});

// GET /users/me — the logged-in user's own account fields (never the password hash).
app.get('/users/me', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('User')
    .select('user_id, name, email, role, barangay_id, status')
    .eq('user_id', req.user.user_id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Account not found' });
  res.json(data);
});

// GET /care-credits/me — the logged-in resident's own Care Credit balance.
// 'available' is spendable now; 'reserved' is held against a pending booking
// request (released back to 'available' if the psychologist declines); 'used'
// is spent and excluded here on purpose -- this is a balance, not a ledger.
app.get('/care-credits/me', requireAuth, requireRole('resident'), async (req, res) => {
  const { data, error } = await supabase
    .from('Care_Credit')
    .select('credit_id, amount, status, created_at')
    .eq('resident_id', req.user.user_id)
    .in('status', ['available', 'reserved'])
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const available = data.filter((c) => c.status === 'available');
  const reserved = data.filter((c) => c.status === 'reserved');

  res.json({
    available_count: available.length,
    available_amount: available.reduce((sum, c) => sum + Number(c.amount), 0),
    reserved_count: reserved.length,
    reserved_amount: reserved.reduce((sum, c) => sum + Number(c.amount), 0),
    credits: data,
  });
});

// PATCH /users/me — self-service account update. Changing the password requires
// current_password to match first; email changes are checked for uniqueness against
// every OTHER account (not this one, or a same-email "change" would false-positive).
app.patch('/users/me', requireAuth, async (req, res) => {
  const { name, email, current_password, new_password } = req.body;

  if (!name && !email && !new_password) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  const { data: user, error: findError } = await supabase
    .from('User')
    .select('user_id, password')
    .eq('user_id', req.user.user_id)
    .single();

  if (findError || !user) return res.status(404).json({ error: 'Account not found' });

  const updates = {};
  if (name) updates.name = name;

  if (email) {
    const { data: existing } = await supabase
      .from('User')
      .select('user_id')
      .eq('email', email)
      .neq('user_id', req.user.user_id)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    updates.email = email;
  }

  if (new_password) {
    if (!current_password) {
      return res.status(400).json({ error: 'current_password is required to set a new password' });
    }
    const matches = await bcrypt.compare(current_password, user.password);
    if (!matches) return res.status(401).json({ error: 'Current password is incorrect' });
    updates.password = await bcrypt.hash(new_password, 10);
  }

  const { data, error } = await supabase
    .from('User')
    .update(updates)
    .eq('user_id', req.user.user_id)
    .select('user_id, name, email, role, barangay_id, status');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// GET/POST /trusted-contacts, DELETE /trusted-contacts/:id — a resident's own
// trusted-contact list for the AI Crisis Companion's "alert trusted person" action.
app.get('/trusted-contacts', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('Trusted_Contact')
    .select('*')
    .eq('user_id', req.user.user_id)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/trusted-contacts', requireAuth, async (req, res) => {
  const { name, relationship, phone, email } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!phone && !email) return res.status(400).json({ error: 'phone or email is required' });

  const { data, error } = await supabase
    .from('Trusted_Contact')
    .insert([{ user_id: req.user.user_id, name, relationship: relationship || null, phone: phone || null, email: email || null }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.delete('/trusted-contacts/:id', requireAuth, async (req, res) => {
  const { data: contact, error: findError } = await supabase
    .from('Trusted_Contact')
    .select('user_id')
    .eq('contact_id', req.params.id)
    .single();

  if (findError || !contact) return res.status(404).json({ error: 'Contact not found' });
  if (contact.user_id !== req.user.user_id) return res.status(403).json({ error: 'This is not your contact' });

  const { error } = await supabase.from('Trusted_Contact').delete().eq('contact_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: true });
});

// POST /trusted-contacts/:id/alert — logs a crisis alert for this contact.
// delivered stays false: no SMS/email provider is wired in yet, so this
// deliberately does NOT tell the resident their contact was actually notified —
// only that the request was recorded.
app.post('/trusted-contacts/:id/alert', requireAuth, async (req, res) => {
  const { data: contact, error: findError } = await supabase
    .from('Trusted_Contact')
    .select('user_id, name')
    .eq('contact_id', req.params.id)
    .single();

  if (findError || !contact) return res.status(404).json({ error: 'Contact not found' });
  if (contact.user_id !== req.user.user_id) return res.status(403).json({ error: 'This is not your contact' });

  const { data, error } = await supabase
    .from('Crisis_Alert')
    .insert([{ user_id: req.user.user_id, contact_id: req.params.id, delivered: false }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ ...data[0], contact_name: contact.name });
});

// GET /auth/me — round-trips the stored token: confirms it's still valid and returns
// who it belongs to. The frontend calls this on app load to detect an expired/invalid
// stored token instead of silently trusting whatever's in localStorage forever.
//
// requireAuth only checks the JWT's signature, not whether the account it names is
// still real -- a deleted or suspended account's old token would otherwise keep
// passing this check for its full 8h lifetime, only surfacing as a confusing foreign
// key error the next time the resident tried to save something new. Checking the
// account still exists here is what actually forces a stale session back to login.
app.get('/auth/me', requireAuth, async (req, res) => {
  const { data: user, error } = await supabase
    .from('User')
    .select('user_id, status')
    .eq('user_id', req.user.user_id)
    .maybeSingle();

  if (error || !user) return res.status(401).json({ error: 'This account no longer exists.' });
  if (user.status === 'suspended' || user.status === 'rejected') {
    return res.status(401).json({ error: 'This account is no longer active.' });
  }

  res.json({ user: req.user });
});

// Fallback only -- the real, admin-editable list lives in Crisis_Escalation_Rule
// (see db/admin_platform_features.sql, seeded with this exact list). Detection
// falls back to this hardcoded copy if that table is ever empty or unreachable,
// so a DB hiccup can never silently disable crisis detection.
const CRISIS_PHRASES = [
  'kill myself', 'want to die', 'end my life', 'better off without me',
  'no reason to live', "can't go on", 'suicide', 'hurting myself',
  'self harm', 'end it all', "don't want to be here anymore",
  'no point in living',
];

let crisisPhrasesCache = { phrases: null, loadedAt: 0 };
const CRISIS_PHRASES_CACHE_MS = 60 * 1000;

async function getCrisisPhrases() {
  const now = Date.now();
  if (crisisPhrasesCache.phrases && now - crisisPhrasesCache.loadedAt < CRISIS_PHRASES_CACHE_MS) {
    return crisisPhrasesCache.phrases;
  }
  try {
    const { data, error } = await supabase.from('Crisis_Escalation_Rule').select('phrase');
    if (!error && data && data.length > 0) {
      crisisPhrasesCache = { phrases: data.map((d) => d.phrase.toLowerCase()), loadedAt: now };
      return crisisPhrasesCache.phrases;
    }
  } catch {
    // fall through to the hardcoded default below
  }
  return CRISIS_PHRASES;
}

const emotionReflections = {
  sadness: "It sounds like you're carrying something heavy right now. These feelings are real, and they matter.",
  fear: "It sounds like something is weighing on you and making things feel uncertain or unsafe.",
  anger: "It sounds like you're dealing with real frustration right now, and that's valid.",
  joy: "It's good to hear some lightness in what you shared today.",
  surprise: "It sounds like something unexpected has been on your mind.",
  disgust: "It sounds like something's been sitting heavy and uncomfortable with you.",
  neutral: "Thanks for sharing what's on your mind today.",
};

// Free, local stand-in for the HuggingFace emotion-classification model
// (j-hartmann/emotion-english-distilroberta-base), which now sits behind a
// paid Inference Providers account. A keyword lexicon obviously can't match
// a trained model's nuance, but it's honest, instant, costs nothing, and
// (unlike that English-only model) also covers common Bisaya/Filipino words,
// since residents journal in both. Same Ekman-style label set everywhere
// else in the app (utils/voiceEmotions.js on the frontend) already expects.
const EMOTION_LEXICON = {
  joy: [
    'happy', 'happiness', 'joy', 'joyful', 'glad', 'great', 'excited', 'excitement',
    'love', 'loved', 'grateful', 'thankful', 'blessed', 'proud', 'fun', 'relieved',
    'hopeful', 'hope', 'nalipay', 'lipay', 'malipayon', 'saya', 'masaya', 'tuwa', 'natuwa',
  ],
  sadness: [
    'sad', 'sadness', 'down', 'depressed', 'depression', 'cry', 'crying', 'cried',
    'lonely', 'alone', 'hurt', 'heartbroken', 'miss', 'missing', 'grief', 'grieving',
    'hopeless', 'empty', 'guol', 'maguol', 'luoy', 'mingaw', 'naguol', 'sad kaayo',
  ],
  fear: [
    'afraid', 'scared', 'fear', 'anxious', 'anxiety', 'worried', 'worry', 'nervous',
    'panic', 'terrified', 'overwhelmed', 'uneasy', 'dread', 'hadlok', 'nahadlok',
    'kabalaka', 'kabalakaon', 'kulba', 'kulbaan',
  ],
  anger: [
    'angry', 'anger', 'mad', 'furious', 'frustrated', 'frustration', 'annoyed',
    'irritated', 'rage', 'pissed', 'resentful', 'suko', 'nasuko', 'kasuko', 'galit',
  ],
  disgust: [
    'disgust', 'disgusted', 'gross', 'sick of', 'ashamed', 'shame', 'guilt', 'guilty',
    'regret', 'kalagot', 'lagot', 'kasilag', 'kasuko kaayo',
  ],
  surprise: [
    'surprised', 'shocked', 'shock', 'unexpected', 'suddenly', 'startled',
    'nakuratan', 'nakalurat', 'nahibulong',
  ],
};

function classifyEmotionLocally(transcript) {
  const words = (transcript || '').toLowerCase().match(/[a-z']+/g) || [];
  const wordSet = new Set(words);
  const text = ` ${(transcript || '').toLowerCase()} `;

  const scores = Object.entries(EMOTION_LEXICON).map(([label, keywords]) => {
    const score = keywords.reduce((count, kw) => {
      // Multi-word phrases ("sick of") need a substring check; single words
      // match the pre-tokenized set so "sadness" doesn't also match inside
      // an unrelated longer word.
      const hit = kw.includes(' ') ? text.includes(` ${kw} `) : wordSet.has(kw);
      return count + (hit ? 1 : 0);
    }, 0);
    return { label, score };
  }).sort((a, b) => b.score - a.score);

  const top = scores.filter((s) => s.score > 0);
  if (top.length === 0) return { label: 'neutral', indicators: [] };

  return { label: top[0].label, indicators: top.slice(0, 2).map((s) => s.label) };
}

// Templated fallback for the AI Crisis Companion's chat reply, used only when
// the LLM call fails (same paid-account billing wall as above) -- several
// varied, non-clinical phrasings per emotion so a conversation doesn't feel
// like it's hitting the same canned line every turn. Keeps the same safety
// constraints as COMPANION_SYSTEM_PROMPT: no diagnosis, no invented hotline
// numbers, crisis messages point toward the in-app psychologist connection.
const COMPANION_CRISIS_REPLIES = [
  "I hear how much pain you're in right now, and I don't want you to go through this alone. Connecting with a licensed psychologist through OpenUp can give you real support -- would you like help doing that?",
  "What you're feeling sounds really heavy, and it matters. You deserve support beyond just this chat -- I can help connect you with a licensed psychologist right now, if you're open to it.",
  "Thank you for telling me this -- that takes courage. I think talking to a licensed psychologist could really help you through this moment. I can help connect you with one.",
];

// Checked before the generic Ekman emotion buckets below -- distinguishes common
// situations that classifyEmotionLocally would otherwise flatten into one "sadness"
// bucket (heartbreak, grief, and loneliness all contain words like "miss"/"alone"/
// "hurt"), so this fallback doesn't give the exact same reply to a breakup as to a
// bad day. None of these default to a breathing exercise -- only "overwhelmed" does.
const SITUATION_LEXICON = {
  heartbreak: ['boyfriend', 'girlfriend', 'ex ', 'breakup', 'broke up', 'break up', 'heartbroken', "doesn't love me", 'no longer loves me', 'cheated', 'left me'],
  grief: ['passed away', 'died', 'death', 'funeral', 'miss my', 'lost my', 'grieving'],
  loneliness: ['lonely', 'no friends', 'all alone', 'nobody cares', 'no one understands', 'mingaw'],
  family: ['my parents', 'my mom', 'my dad', 'my family', 'my sibling', 'my brother', 'my sister'],
  academic: ['exam', 'grades', 'school', 'thesis', 'failing', 'deadline', 'professor'],
  financial: ['money', 'rent', 'debt', 'bills', 'financial', 'cant afford', "can't afford", 'walay kwarta'],
  exhaustion: ['exhausted', 'burnt out', 'burned out', 'tired of everything', 'so tired', 'drained'],
  overwhelmed: ['panic', 'panicking', 'overwhelmed', 'racing thoughts', "can't breathe", 'cant breathe'],
};

const COMPANION_SITUATION_REPLIES = {
  heartbreak: [
    "That sounds like a really painful thing to be carrying -- a relationship ending like that can hurt in a way that's hard to put into words. What's weighing on you most about it right now?",
    "I'm sorry you're going through this. That kind of hurt is real, and it doesn't mean anything about your worth. Do you want to talk about what happened?",
  ],
  grief: [
    "I'm so sorry for your loss. Missing someone like that is a real kind of pain, and there's no timeline for it. Would you like to share a memory of them?",
    "That sounds like a deep loss to carry. It's okay to let yourself feel it. What do you miss most about them?",
  ],
  loneliness: [
    "Feeling that alone is really hard, even when there are people around. I'm glad you're sharing this instead of sitting with it by yourself. What does that loneliness feel like for you lately?",
    "That sounds isolating, and I'm sorry you're feeling that way. You're not as alone in this as it feels right now -- what's been making it feel this way?",
  ],
  family: [
    "Family stuff can sit really heavy, especially when it's ongoing. What's been happening?",
    "That sounds like a tough dynamic to be in the middle of. Do you want to walk me through what's going on?",
  ],
  academic: [
    "That kind of pressure can feel relentless. What part of it feels the most urgent right now?",
    "School stress like that is genuinely a lot to carry. What would feel most helpful to talk through -- the workload itself, or how you're feeling about it?",
  ],
  financial: [
    "Money stress is exhausting in a way that follows you everywhere. What's the most pressing part of it right now?",
    "That's a heavy thing to be dealing with. Is there a specific part of it you want to think through together?",
  ],
  exhaustion: [
    "Being tired of everything, all at once, is its own kind of heavy. You don't have to have a plan right now -- what's been draining you the most?",
    "That sounds like real burnout, not just a bad day. What would it look like to get even a little bit of that weight off you?",
  ],
  overwhelmed: [
    "That sounds like a lot to be feeling all at once. Would it help to slow your breathing down together right now -- in for 4, hold for 4, out for 4?",
  ],
};

const COMPANION_EMOTION_REPLIES = {
  sadness: [
    "That sounds really heavy to carry. It's okay to feel this way -- do you want to tell me a bit more about what's been going on?",
    "I'm sorry you're feeling this way. Sometimes just naming it helps a little. What's been weighing on you most?",
  ],
  fear: [
    "It sounds like something's been making you feel uneasy or anxious. What's the part that worries you the most?",
    "That uncertainty sounds really uncomfortable to sit with. Do you want to talk through what's behind it?",
  ],
  anger: [
    "It sounds like you're dealing with real frustration right now, and that's valid. What happened?",
    "That frustration makes sense given what you're describing. Do you want to talk through what triggered it?",
  ],
  disgust: [
    "That sounds like something that's been sitting heavy and uncomfortable with you. Want to tell me more?",
  ],
  joy: [
    "It's really good to hear some lightness in what you shared. What's been going well for you?",
    "I'm glad to hear that. What's contributed to feeling this way?",
  ],
  surprise: [
    "That sounds like it caught you off guard. How are you feeling about it now?",
  ],
  neutral: [
    "I'm here with you. Can you tell me a bit more about what's going on?",
    "Thanks for sharing that with me. What's been on your mind today?",
  ],
};

function detectSituationLocally(message) {
  const text = ` ${(message || '').toLowerCase()} `;
  const match = Object.entries(SITUATION_LEXICON).find(([, phrases]) => phrases.some((p) => text.includes(` ${p} `) || text.includes(p)));
  return match ? match[0] : null;
}

function generateTemplatedCompanionReply(message, isCrisis) {
  if (isCrisis) {
    const pool = COMPANION_CRISIS_REPLIES;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const situation = detectSituationLocally(message);
  const pool = situation
    ? COMPANION_SITUATION_REPLIES[situation]
    : (COMPANION_EMOTION_REPLIES[classifyEmotionLocally(message).label] || COMPANION_EMOTION_REPLIES.neutral);
  return pool[Math.floor(Math.random() * pool.length)];
}

// Exact-phrase check against the admin-editable list -- fast, deterministic,
// and still catches known high-risk phrases even if the LLM call below is
// down. Kept as its own function since it's the only check that works offline.
async function detectCrisisRiskByKeyword(transcript) {
  const phrases = await getCrisisPhrases();
  const lower = transcript.toLowerCase();
  return phrases.some((phrase) => lower.includes(phrase));
}

// A phrase list alone misses anything paraphrased or indirect -- "i dont want to
// live anymore" and "everyone would be better off if i just disappeared" both slip
// past every phrase in Crisis_Escalation_Rule, even though they're clearly crisis
// language a human would catch immediately. This asks the same model already
// generating replies to classify the message directly, as a semantic backstop.
// Best-effort: if the call fails, this just contributes nothing -- the keyword
// check in detectCrisisRisk below still stands on its own either way.
async function detectCrisisRiskByLLM(transcript) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [
          {
            role: 'system',
            content: 'You classify a single message for crisis risk: self-harm, suicidal thoughts or ideation (including indirect expressions like wanting to disappear or not wanting to be here), abuse, or being in immediate danger. Reply with exactly one word: YES or NO. Nothing else.',
          },
          { role: 'user', content: transcript },
        ],
        max_tokens: 300,
        temperature: 0,
      }),
    });
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim().toUpperCase() || '';
    return text.startsWith('YES');
  } catch {
    return false;
  }
}

async function detectCrisisRisk(transcript) {
  const [byKeyword, byLLM] = await Promise.all([
    detectCrisisRiskByKeyword(transcript),
    detectCrisisRiskByLLM(transcript),
  ]);
  return byKeyword || byLLM;
}

// AI Crisis Management / "Configure Escalation Rules" -- the admin-editable
// crisis-detection keyword list detectCrisisRisk() actually reads from.
app.get('/admin/escalation-rules', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase.from('Crisis_Escalation_Rule').select('*').order('phrase', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/admin/escalation-rules', requireAuth, requireRole('admin'), async (req, res) => {
  const { phrase } = req.body;
  if (!phrase || !phrase.trim()) return res.status(400).json({ error: 'phrase is required' });

  const { data, error } = await supabase
    .from('Crisis_Escalation_Rule')
    .insert([{ phrase: phrase.trim().toLowerCase() }])
    .select();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'This phrase is already in the list' });
    return res.status(500).json({ error: error.message });
  }
  crisisPhrasesCache.loadedAt = 0; // force a refresh on the next check
  res.status(201).json(data[0]);
});

app.delete('/admin/escalation-rules/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { error } = await supabase.from('Crisis_Escalation_Rule').delete().eq('rule_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  crisisPhrasesCache.loadedAt = 0;
  res.json({ deleted: true });
});

// AI Crisis Management / "Manage Emergency Contacts" -- real, admin-verified
// numbers shown to a resident in crisis instead of a placeholder. GET is
// public (the Crisis Companion needs it unauthenticated); writes are admin-only.
app.get('/emergency-contacts', async (req, res) => {
  let query = supabase.from('Emergency_Contact').select('*').order('created_at', { ascending: true });
  const { barangay_id } = req.query;
  if (barangay_id !== undefined) {
    // Platform-wide (barangay_id IS NULL) contacts always show, plus this barangay's own.
    query = query.or(`barangay_id.is.null,barangay_id.eq.${Number(barangay_id)}`);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/admin/emergency-contacts', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, phone, description, barangay_id } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });

  const { data, error } = await supabase
    .from('Emergency_Contact')
    .insert([{ name, phone, description: description || null, barangay_id: barangay_id || null }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.patch('/admin/emergency-contacts/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, phone, description, barangay_id } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (description !== undefined) updates.description = description;
  if (barangay_id !== undefined) updates.barangay_id = barangay_id || null;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const { data, error } = await supabase.from('Emergency_Contact').update(updates).eq('contact_id', req.params.id).select();
  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'Contact not found' });
  res.json(data[0]);
});

app.delete('/admin/emergency-contacts/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { error } = await supabase.from('Emergency_Contact').delete().eq('contact_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: true });
});

const JOURNAL_EMOTIONS = [
  'sadness', 'anxiety', 'fear', 'anger', 'frustration', 'loneliness', 'grief',
  'stress', 'happiness', 'relief', 'hope', 'confusion', 'emotional exhaustion',
];

function stripJsonFences(text) {
  return (text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// A loose, defensive pass over whatever the model returned -- never trust shape,
// types, or length from an LLM response directly. Anything not recognized or not
// actually supported by the transcript (per the prompt's own instruction) comes
// back null/empty rather than a guess.
function sanitizeJournalAnalysis(parsed) {
  const allowed = new Set(JOURNAL_EMOTIONS);
  const primary = allowed.has((parsed.primary_emotion || '').toLowerCase()) ? parsed.primary_emotion.toLowerCase() : null;
  const secondary = Array.isArray(parsed.secondary_emotions)
    ? parsed.secondary_emotions.filter((e) => allowed.has((e || '').toLowerCase())).slice(0, 2)
    : [];
  const intensity = ['mild', 'moderate', 'intense'].includes((parsed.intensity || '').toLowerCase())
    ? parsed.intensity.toLowerCase()
    : null;
  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations
      .slice(0, 4)
      .map((r, i) => ({
        id: i,
        title: String(r?.title || '').slice(0, 100),
        explanation: String(r?.explanation || '').slice(0, 400),
        why_it_helps: String(r?.why_it_helps || '').slice(0, 400),
        how_to: String(r?.how_to || '').slice(0, 400),
        completed: false,
      }))
      .filter((r) => r.title)
    : [];

  return {
    title: parsed.title ? String(parsed.title).slice(0, 80) : null,
    primary_emotion: primary,
    secondary_emotions: secondary,
    emotional_intensity: intensity,
    emotional_summary: parsed.emotional_summary ? String(parsed.emotional_summary).slice(0, 800) : null,
    understanding_text: parsed.understanding ? String(parsed.understanding).slice(0, 800) : null,
    key_concerns: Array.isArray(parsed.key_concerns) ? parsed.key_concerns.filter(Boolean).map(String).slice(0, 4) : [],
    emotional_insights: Array.isArray(parsed.emotional_insights) ? parsed.emotional_insights.filter(Boolean).map(String).slice(0, 3) : [],
    reflection_question: parsed.reflection_question ? String(parsed.reflection_question).slice(0, 300) : null,
    positive_signs: parsed.positive_signs ? String(parsed.positive_signs).slice(0, 300) : null,
    recommendations,
  };
}

// Replaces the old generateLLMReflection (a bare 2-sentence summary that was
// never even saved) with a single structured-JSON call covering the full AI
// Reflection: emotional summary, why they might feel this way, key concerns
// actually mentioned, deeper insights, a reflection question, and a dynamic
// recommendation set generated from THIS transcript -- not a static lookup
// table keyed by one of 7 emotion buckets.
async function generateJournalAnalysis(transcript, isCrisis) {
  const prompt = `You are an AI assistant inside a mental wellness app. Analyze this personal voice journal entry and respond with ONLY a single valid JSON object -- no markdown, no code fences, no text before or after it, no asterisks or other markdown inside any string value. Use this exact shape:

{
  "title": a short 3-6 word descriptive title for this entry,
  "primary_emotion": one of ${JSON.stringify(JOURNAL_EMOTIONS)}, or null if the transcript genuinely doesn't give enough to tell -- never force a classification,
  "secondary_emotions": array of 0-2 strings from that same list,
  "intensity": one of "mild", "moderate", "intense", or null,
  "emotional_summary": 2-3 sentences interpreting (not repeating) the user's overall emotional state in natural language,
  "understanding": 2-3 sentences explaining WHY they might feel this way, grounded only in what they actually said -- no invented assumptions,
  "key_concerns": array of 0-4 short strings naming concrete issues actually mentioned (e.g. "Financial worries", "Family responsibilities") -- empty array if none are clearly present,
  "emotional_insights": array of 1-3 short sentences using tentative language like "Your words suggest..." or "It sounds like...",
  "reflection_question": one single open-ended question specific to what they said,
  "positive_signs": a short string noting any resilience, hope, or positive emotion actually present, or null if none,
  "recommendations": array of 2-4 objects, each {"title": short action title, "explanation": what to do, "why_it_helps": why this specifically helps given THEIR situation, "how_to": a simple realistic step}
}

For recommendations: do NOT default to breathing exercises, meditation, journaling, or "talk to a psychologist" for every entry -- only include one of those if it is genuinely the best fit for what they described. Every recommendation must be concrete, practical, and tailored to their actual words, never generic.${
  isCrisis
    ? ' This entry was flagged for possible self-harm, suicidal thoughts, abuse, or danger -- the app is separately already surfacing its own crisis support UI for this (verified local emergency contacts and a path to a licensed psychologist), so you do not need to and should not invent hotline numbers or generic "call a crisis line" advice. key_concerns and emotional_insights should reflect the seriousness honestly, and the recommendations array should contain exactly one entry about connecting with a licensed psychologist through the app right now or reaching out to someone they trust immediately -- not an independent coping tip.'
    : ''
}
Never diagnose. Everyday feeling words (sad, anxious, afraid, angry) are fine, but never use a clinical/diagnostic label as if it were a conclusion about the person -- no "depression", "PTSD", "disorder", "clinically anxious", or similar, even phrased tentatively ("may have depression" is still a diagnosis). Describe only what their actual words express. Never state an emotional interpretation as a fact; every summary, insight, and concern is a possible interpretation, not a certainty.

Journal entry: "${transcript.replace(/"/g, "'")}"`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: prompt }],
      // gpt-oss's reasoning chain alone regularly runs 1000+ tokens before it even
      // starts the actual JSON -- measured truncation (finish_reason: "length") at
      // 1600, clean completion at 3500, so this is set with real headroom above that.
      max_tokens: 4500,
    }),
  });

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!res.ok || !raw) throw new Error('Journal analysis unavailable');

  const parsed = JSON.parse(stripJsonFences(raw));
  return sanitizeJournalAnalysis(parsed);
}

// Last-resort fallback if the LLM call itself fails -- reuses the same local
// situation/emotion detection as the AI Crisis Companion's fallback so even this
// degraded path doesn't collapse heartbreak, grief, and loneliness into one
// generic "sadness" response, and doesn't default to a breathing exercise.
const JOURNAL_FALLBACK_RECOMMENDATIONS = {
  heartbreak: [
    { title: 'Let yourself feel it without judgment', explanation: 'Give the hurt room instead of pushing it down.', why_it_helps: 'Suppressing a breakup\'s pain tends to make it resurface later, often harder to deal with.', how_to: 'Set aside a few quiet minutes today to just sit with how you feel, even if it\'s uncomfortable.' },
    { title: 'Talk to someone who knows you', explanation: 'Share what happened with a trusted friend or family member.', why_it_helps: 'Heartbreak feels heavier when carried alone -- being heard can lighten it.', how_to: 'Reach out to one person today, even just to say "can we talk."' },
  ],
  grief: [
    { title: 'Write down a memory of them', explanation: 'Put into words one moment with them that stays with you.', why_it_helps: 'Grief often needs expression, not resolution -- memories keep the connection alive.', how_to: 'Open a notes app or journal and write for five minutes about one memory, no pressure to finish.' },
    { title: 'Let yourself grieve without a timeline', explanation: 'There\'s no "right" pace for missing someone.', why_it_helps: 'Expecting yourself to "move on" by a certain point usually adds guilt on top of grief.', how_to: 'When the feeling comes up today, let it pass through instead of fighting it.' },
  ],
  loneliness: [
    { title: 'Reach out to one person today', explanation: 'A short message to someone you trust, even just to check in.', why_it_helps: 'Loneliness often grows in silence -- a small bit of real contact can interrupt that.', how_to: 'Send one text today: "thinking of you, how are you doing?"' },
  ],
  family: [
    { title: 'Name what you actually need from them', explanation: 'Get clear with yourself on what outcome you want from this family situation.', why_it_helps: 'Family conflict feels more manageable once you know what you\'re actually hoping for.', how_to: 'Write down one sentence: "what I need right now is ___."' },
  ],
  academic: [
    { title: 'Pick the single most urgent task', explanation: 'Out of everything on your plate, name the one thing due soonest.', why_it_helps: 'A pile of academic work feels less overwhelming once it\'s one task, not everything at once.', how_to: 'Write down just that one task and the next 20-minute step toward it.' },
  ],
  financial: [
    { title: 'Break the money worry into one concrete number', explanation: 'Identify the specific amount or bill that\'s weighing on you most.', why_it_helps: 'Financial stress often feels bigger as a vague fear than as an actual number you can plan around.', how_to: 'Write down the one bill or cost that\'s most urgent, and one possible next step for it.' },
  ],
  exhaustion: [
    { title: 'Protect one small window of rest', explanation: 'Find even 20-30 minutes today with no obligations in it.', why_it_helps: 'Burnout builds when rest keeps getting deferred -- small real breaks add up.', how_to: 'Block out a specific time today and treat it as non-negotiable, even if it\'s short.' },
  ],
  overwhelmed: [
    { title: 'Slow your breathing for a minute', explanation: 'A brief grounding breath -- in for 4, hold for 4, out for 4.', why_it_helps: 'When everything feels like too much at once, slowing your breathing can bring your body out of panic mode.', how_to: 'Try it right now, a few times in a row, before doing anything else.' },
  ],
};

function generateFallbackJournalAnalysis(transcript, isCrisis) {
  const { label: emotion } = classifyEmotionLocally(transcript);
  const situation = detectSituationLocally(transcript);
  const summary = emotionReflections[emotion.toLowerCase()] || emotionReflections.neutral;
  const recommendations = (situation ? JOURNAL_FALLBACK_RECOMMENDATIONS[situation] : null) || [
    { title: 'Name what\'s actually on your mind', explanation: 'Put a specific word or sentence to what you\'re feeling right now.', why_it_helps: 'Naming a feeling precisely tends to make it easier to sit with than a vague sense of unease.', how_to: 'Finish this sentence for yourself: "what I\'m really feeling is ___."' },
  ];
  return {
    title: null,
    primary_emotion: JOURNAL_EMOTIONS.includes(emotion) ? emotion : null,
    secondary_emotions: [],
    emotional_intensity: isCrisis ? 'intense' : null,
    emotional_summary: summary,
    understanding_text: null,
    key_concerns: [],
    emotional_insights: [],
    reflection_question: null,
    positive_signs: null,
    recommendations: recommendations.map((r, i) => ({ ...r, id: i, completed: false })),
  };
}

// POST /voice-journal — audio upload (+ client-transcribed text) → emotion analysis → crisis check → save
app.post('/voice-journal', requireAuth, upload.single('audio'), async (req, res) => {
  const { duration_seconds, transcript } = req.body;
  const userId = req.user.user_id;
  const audioFile = req.file;

  if (!audioFile) {
    return res.status(400).json({ error: 'an audio file is required' });
  }
  if (!transcript || !transcript.trim()) {
    return res.status(400).json({ error: 'transcript is required' });
  }

  try {
    // Transcription happens client-side now (the browser's own Web Speech API,
    // see VoiceJournal.jsx) -- HuggingFace's hosted Whisper model sits behind a
    // paid Inference Providers account, and the browser's built-in recognizer
    // costs nothing. The resident can also edit the transcript before saving,
    // which a server-side model never allowed anyway.
    //
    // Step 1: Crisis check first (deterministic + semantic backstop -- never left
    // to a single pass) so the analysis call below knows whether to treat this
    // as a crisis entry.
    const isCrisis = await detectCrisisRisk(transcript);

    // Step 2: the full structured AI Reflection -- emotional summary, why they
    // might feel this way, key concerns actually mentioned, insights, a
    // reflection question, and recommendations generated from THIS transcript.
    let analysis;
    try {
      analysis = await generateJournalAnalysis(transcript, isCrisis);
    } catch {
      analysis = generateFallbackJournalAnalysis(transcript, isCrisis);
    }
    // classifyEmotionLocally still backs content_indicators (used elsewhere, e.g.
    // Daily Insights' keyword correlation) and is the fallback when the AI
    // declined to classify an emotion at all.
    const { label: localEmotion, indicators: contentIndicators } = classifyEmotionLocally(transcript);
    const primaryEmotion = analysis.primary_emotion || localEmotion;

    // Step 3: Upload the audio to storage now that the user has confirmed they want to keep it
    const audioPath = `${userId}/${Date.now()}.webm`;
    const { error: uploadError } = await supabase.storage
      .from('voice-journal-audio')
      .upload(audioPath, audioFile.buffer, { contentType: 'audio/webm' });

    if (uploadError) {
      return res.status(500).json({ error: uploadError.message });
    }

    // Step 4: Save everything to Supabase -- the full analysis and recommendation
    // set are persisted on the row itself (not just returned), so reopening this
    // entry later from Journal History shows the same thing, not just a bare emotion label.
    const { data, error } = await supabase
      .from('Voice_Journal')
      .insert([{
        user_id: userId,
        transcript,
        title: analysis.title,
        emotion_result: primaryEmotion,
        content_indicators: contentIndicators,
        secondary_emotions: analysis.secondary_emotions,
        emotional_intensity: analysis.emotional_intensity,
        emotional_summary: analysis.emotional_summary,
        understanding_text: analysis.understanding_text,
        key_concerns: analysis.key_concerns,
        emotional_insights: analysis.emotional_insights,
        reflection_question: analysis.reflection_question,
        positive_signs: analysis.positive_signs,
        recommendations: analysis.recommendations,
        risk_flag: isCrisis,
        audio_path: audioPath,
        duration_seconds: duration_seconds ? Number(duration_seconds) : null,
      }])
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Step 5: a flagged crisis entry actually escalates now instead of just sitting in
    // the DB as a flag nobody acts on — same match-or-queue path the AI Crisis
    // Companion uses. Best-effort: the journal entry is already saved either way, so a
    // failure here shouldn't fail the whole request. This escalation happens on every
    // flagged entry regardless of pattern -- a single crisis-language entry still gets
    // real help queued immediately, that's a safety behavior, not a UI nag.
    let crisisEscalation = null;
    if (isCrisis) {
      try {
        crisisEscalation = await escalateCrisis(userId);
      } catch (escalationErr) {
        crisisEscalation = { error: escalationErr.message };
      }
    }

    // The intrusive "severe emotional distress" popup, separately, is reserved for a
    // repeated pattern -- 3+ flagged entries within the last 7 days -- rather than
    // firing on every single flagged entry.
    let showCrisisModal = false;
    if (isCrisis) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await supabase
        .from('Voice_Journal')
        .select('journal_id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('risk_flag', true)
        .gte('created_at', sevenDaysAgo);
      if (!countError) showCrisisModal = (count || 0) >= 3;
    }

    res.status(201).json({
      ...data[0],
      crisis_escalation: crisisEscalation,
      show_crisis_modal: showCrisisModal,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scoped to the caller's own entries regardless of what :userId says -- the
// frontend still calls this with its own id in the URL, but ownership is the
// JWT's, never the path param, so nobody can read another resident's journal
// by changing the number in the URL.
app.get('/voice-journal/user/:userId', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('Voice_Journal')
    .select('*')
    .eq('user_id', req.user.user_id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /voice-journal/:id — edit the title and/or transcript of one of the
// caller's own entries. Pass regenerate: true alongside a transcript change to
// recompute the AI analysis + recommendations for the new wording (kept as an
// explicit opt-in, not automatic, since re-running it costs an AI call and the
// resident might just be fixing a typo).
app.patch('/voice-journal/:id', requireAuth, async (req, res) => {
  const { title, transcript, regenerate } = req.body;

  const { data: existing, error: findError } = await supabase
    .from('Voice_Journal')
    .select('*')
    .eq('journal_id', req.params.id)
    .eq('user_id', req.user.user_id)
    .maybeSingle();
  if (findError) return res.status(500).json({ error: findError.message });
  if (!existing) return res.status(404).json({ error: 'Journal entry not found' });

  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title ? String(title).slice(0, 80) : null;

  if (transcript !== undefined && transcript.trim() && transcript !== existing.transcript) {
    updates.transcript = transcript;

    if (regenerate) {
      const isCrisis = await detectCrisisRisk(transcript);
      let analysis;
      try {
        analysis = await generateJournalAnalysis(transcript, isCrisis);
      } catch {
        analysis = generateFallbackJournalAnalysis(transcript, isCrisis);
      }
      const { label: localEmotion, indicators: contentIndicators } = classifyEmotionLocally(transcript);

      Object.assign(updates, {
        emotion_result: analysis.primary_emotion || localEmotion,
        content_indicators: contentIndicators,
        secondary_emotions: analysis.secondary_emotions,
        emotional_intensity: analysis.emotional_intensity,
        emotional_summary: analysis.emotional_summary,
        understanding_text: analysis.understanding_text,
        key_concerns: analysis.key_concerns,
        emotional_insights: analysis.emotional_insights,
        reflection_question: analysis.reflection_question,
        positive_signs: analysis.positive_signs,
        recommendations: analysis.recommendations,
        risk_flag: isCrisis,
        title: title !== undefined ? updates.title : (analysis.title || existing.title),
      });
      // Editing an old entry's wording never re-triggers crisis escalation/booking --
      // that only happens once, at the moment the entry was first recorded.
    }
  }

  const { data, error } = await supabase.from('Voice_Journal').update(updates).eq('journal_id', req.params.id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// PATCH /voice-journal/:id/recommendations/:index — toggle one recommendation's
// completed flag within the entry's own stored recommendations array.
app.patch('/voice-journal/:id/recommendations/:index', requireAuth, async (req, res) => {
  const { completed } = req.body;
  const index = Number(req.params.index);

  const { data: existing, error: findError } = await supabase
    .from('Voice_Journal')
    .select('recommendations')
    .eq('journal_id', req.params.id)
    .eq('user_id', req.user.user_id)
    .maybeSingle();
  if (findError) return res.status(500).json({ error: findError.message });
  if (!existing) return res.status(404).json({ error: 'Journal entry not found' });

  const recommendations = Array.isArray(existing.recommendations) ? [...existing.recommendations] : [];
  if (!recommendations[index]) return res.status(404).json({ error: 'Recommendation not found' });
  recommendations[index] = { ...recommendations[index], completed: Boolean(completed) };

  const { data, error } = await supabase
    .from('Voice_Journal')
    .update({ recommendations })
    .eq('journal_id', req.params.id)
    .select('recommendations');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// DELETE /voice-journal/:id — removes the entry (transcript, analysis, and
// recommendations all live on this one row) and its audio file from storage,
// scoped to the caller's own entries only.
// GET /voice-journal/:id/audio-url — a short-lived signed URL for the entry's
// own audio file (the storage bucket is private, so there's no plain public
// URL to hand back). Scoped to the caller's own entry.
app.get('/voice-journal/:id/audio-url', requireAuth, async (req, res) => {
  const { data: existing, error: findError } = await supabase
    .from('Voice_Journal')
    .select('audio_path')
    .eq('journal_id', req.params.id)
    .eq('user_id', req.user.user_id)
    .maybeSingle();
  if (findError) return res.status(500).json({ error: findError.message });
  if (!existing) return res.status(404).json({ error: 'Journal entry not found' });
  if (!existing.audio_path) return res.status(404).json({ error: 'No audio recording for this entry' });

  const { data, error } = await supabase.storage
    .from('voice-journal-audio')
    .createSignedUrl(existing.audio_path, 300);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ url: data.signedUrl });
});

app.delete('/voice-journal/:id', requireAuth, async (req, res) => {
  const { data: existing, error: findError } = await supabase
    .from('Voice_Journal')
    .select('audio_path')
    .eq('journal_id', req.params.id)
    .eq('user_id', req.user.user_id)
    .maybeSingle();
  if (findError) return res.status(500).json({ error: findError.message });
  if (!existing) return res.status(404).json({ error: 'Journal entry not found' });

  const { error } = await supabase.from('Voice_Journal').delete().eq('journal_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });

  if (existing.audio_path) {
    try {
      await supabase.storage.from('voice-journal-audio').remove([existing.audio_path]);
    } catch {
      // best-effort cleanup -- the entry is already deleted either way
    }
  }

  res.json({ deleted: true });
});

// Shared by /crisis-match (AI Crisis Companion) and the Voice Journal's crisis-flag
// path: finds an available verified psychologist and instantly books an audio session
// (auto-confirmed, no waiting on accept), or queues the resident in Crisis_Requests if
// nobody's free right now. Returns the same shape both callers need.
async function escalateCrisis(userId) {
  // Best-effort, fire-and-forget: a notification failure must never block a
  // real crisis escalation. Covers both outcomes below.
  const notifyLgu = async (title, body) => {
    try {
      const { data: resident } = await supabase.from('User').select('name, barangay_id').eq('user_id', userId).single();
      const lguUserId = resident ? await getLguUserIdForBarangay(resident.barangay_id) : null;
      if (lguUserId) {
        await supabase.from('Notification').insert([{
          user_id: lguUserId,
          type: 'system',
          title,
          body: body(resident.name),
          link: '/lgu/residents',
          read: false,
        }]);
      }
    } catch {
      // never block the real escalation on a notification failure
    }
  };

  const { data: available, error: findError } = await supabase
    .from('Psychologist')
    .select('psychologist_id, session_price')
    .eq('is_verified', true)
    .eq('is_available', true)
    .limit(1);

  if (findError) throw findError;

  if (!available || available.length === 0) {
    const { data: queued, error: queueError } = await supabase
      .from('Crisis_Requests')
      .insert([{ user_id: userId, status: 'queued' }])
      .select();

    if (queueError) throw queueError;
    notifyLgu('Crisis escalation queued', (name) => `${name} tried to escalate to a psychologist, but nobody was available -- they're queued.`);
    return { matched: false, queued: queued[0] };
  }

  const psychologistId = available[0].psychologist_id;

  const { data, error } = await supabase.rpc('create_booking_transaction', {
    p_resident_id: userId,
    p_psychologist_id: psychologistId,
    p_schedule: new Date().toISOString(),
    p_session_type: 'crisis',
    p_auto_confirm: true,
  });

  if (error) throw error;

  await supabase.from('Psychologist').update({ is_available: false }).eq('psychologist_id', psychologistId);
  notifyLgu('Crisis escalation matched', (name) => `${name} was just matched with a psychologist after a crisis escalation.`);

  return { matched: true, booking: data.booking };
}

app.post('/crisis-match', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  try {
    res.json(await escalateCrisis(user_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rewritten from scratch after the original version's one line -- "Offer a simple
// grounding or breathing exercise if it fits naturally" -- turned out to be exactly
// why every reply defaulted to breathing exercises: a single vague instruction with
// nothing else to anchor to, so the model reached for it constantly. This version
// instead tells it to actually listen, name the specific kind of situation it's
// hearing, vary its structure, and treat a breathing/grounding exercise as ONE
// possible tool among many -- not the default move.
const COMPANION_SYSTEM_PROMPT = `You are a warm, emotionally intelligent, non-clinical companion inside a mental wellness app called OpenUp for Cebu City residents. You are a compassionate listener first, not an advice machine.

Read each message for what it actually is: heartbreak and breakups, grief and loss, loneliness, family conflict, academic stress, financial difficulty, emotional exhaustion/burnout, everyday sadness, anxiety, anger, or something else entirely. Respond to THAT specific situation in your own words -- never a generic, one-size-fits-all reply.

How to respond:
- Acknowledge and reflect what they seem to be feeling before you suggest anything. Sometimes that's all a message needs -- it's okay to just listen and ask a gentle follow-up question instead of offering a solution.
- Vary your structure and length (anywhere from one short sentence to a few) -- don't fall into a predictable template every turn, and don't sound like a motivational-quote generator.
- Do NOT default to suggesting breathing exercises, grounding exercises, journaling, meditation, or "talk to a psychologist" -- only bring one of these up when it's genuinely and specifically relevant to what they just said (e.g. they describe panic or racing anxiety right now, or they directly ask for a calming technique).
- Look at your own earlier replies in this conversation (included below) and do not repeat the same suggestion or the same phrasing you already used -- if you already offered a breathing exercise, suggesting it again is a failure.
- When it fits, offer specific, practical, situation-relevant ideas (e.g. for heartbreak: processing the loss, not blaming themselves, what they need right now; for grief: letting them share memories; for academic/financial stress: breaking the problem down, who could realistically help) rather than generic wellness tips.
- Ask a real follow-up question when curiosity or clarity would help, instead of always wrapping up with one.

Boundaries:
- Never diagnose, never use clinical labels, never claim to be a licensed professional.
- You are a supportive companion, not a replacement for real relationships or professional care -- don't encourage the person to rely on you instead of real people, and don't present yourself as always available or as enough on your own.
- Gently point toward a licensed psychologist (via the app's in-app option) when it's truly warranted, not every single turn.
- Never invent or state specific phone numbers, hotline numbers, or emergency contact details under any circumstance — you do not actually know them; the app shows verified local crisis resources separately.
- If someone expresses thoughts of self-harm, suicide, abuse, or being in danger, treat it seriously and calmly: acknowledge the pain directly, do not minimize it, do not just suggest a breathing exercise, and clearly encourage connecting with a licensed psychologist through the app's in-app option right now (without listing phone numbers yourself).
- Match the language the person used (Bisaya, Filipino, or English) as best you can.
- This reply is shown as plain chat text, not rendered markdown: never use **asterisks**, #headers, or other markdown syntax. If you give a short list of steps or options, put each one on its own line starting with a plain number like "1." followed by a space, never run them together in one paragraph.`;

const COMPANION_PREFERENCE_INSTRUCTIONS = {
  listen: 'Right now the person has specifically asked to just be listened to. Do not give advice, suggestions, exercises, or next steps unless they explicitly ask for one in this message -- just acknowledge and reflect what they\'re feeling, and it\'s okay to ask a gentle question instead.',
  advice: 'Right now the person has specifically asked for actual advice. After briefly acknowledging their feelings, give specific, practical, situation-relevant suggestions for what they could actually do -- not generic wellness tips.',
  understand: 'Right now the person wants help understanding their own feelings. Focus on asking gentle, curious questions that help them explore and name what they\'re feeling and why, rather than jumping to solutions.',
  calm: 'Right now the person has specifically asked for help calming down in this moment. It is appropriate here to guide them through a simple grounding or breathing technique, since this is exactly what they asked for.',
};

app.post('/crisis-companion/chat', requireAuth, async (req, res) => {
  const { message, history, conversation_id, preference } = req.body;
  const userId = req.user.user_id;

  if (!message) return res.status(400).json({ error: 'message is required' });

  const isCrisis = await detectCrisisRisk(message);

  // Feeds the AI Effectiveness Tracker's detection rate -- never the message
  // itself, just whether this turn tripped the check. Best-effort: a logging
  // failure shouldn't break the conversation.
  supabase.from('AI_Detection_Log').insert([{ user_id: userId, crisis_detected: isCrisis }]).then(() => {});

  // `history` already ends with this same user message (the client appends it before sending),
  // so it's passed through as-is rather than appending `message` a second time. A wider
  // window than before (10 turns, not 6) so the model can actually see its own earlier
  // replies and avoid repeating a suggestion it already made this conversation.
  const recentHistory = (history || []).slice(-10).map((h) => ({
    role: h.role === 'user' ? 'user' : 'assistant',
    content: h.content,
  }));

  // All framing lives in system-role messages up front, before any conversation turns --
  // the base prompt, then the person's chosen conversation mode (if any), then an extra
  // reinforcement on crisis turns (models weight instructions near generation time more
  // heavily, so this is on top of the crisis clause already in the base prompt, not instead of it).
  const systemMessages = [{ role: 'system', content: COMPANION_SYSTEM_PROMPT }];
  if (preference && COMPANION_PREFERENCE_INSTRUCTIONS[preference]) {
    systemMessages.push({ role: 'system', content: COMPANION_PREFERENCE_INSTRUCTIONS[preference] });
  }
  if (isCrisis) {
    systemMessages.push({
      role: 'system',
      content: 'This message was flagged as possibly involving self-harm, suicide, abuse, or a crisis. Respond with calm, serious, direct empathy -- do not minimize this and do not just suggest a breathing exercise. Clearly and warmly encourage connecting with a licensed psychologist through the app right now.',
    });
  }

  // The LLM call is attempted first (richer, context-aware replies) and falls
  // back to generateTemplatedCompanionReply on ANY failure -- API-level (the
  // same Groq account as Voice Journal) or network-level -- so the
  // companion always replies with something relevant instead of erroring out
  // or repeating one static line forever.
  let reply;
  try {
    const llmRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [...systemMessages, ...recentHistory],
        // gpt-oss's internal "reasoning" chain runs noticeably longer on sensitive/crisis
        // content before producing a final answer — too small a budget truncates the reply
        // before any content is ever emitted (same issue as the Voice Journal reflection).
        max_tokens: 900,
      }),
    });
    const data = await llmRes.json();
    reply = data?.choices?.[0]?.message?.content?.trim();
  } catch {
    reply = null;
  }

  const finalReply = reply || generateTemplatedCompanionReply(message, isCrisis);

  // Persist this turn so the conversation survives closing the tab and shows up
  // in the resident's own history. Best-effort: a storage hiccup still lets the
  // reply through -- it just won't be saved.
  let conversationId = conversation_id || null;
  try {
    if (conversationId) {
      await supabase
        .from('Crisis_Conversation')
        .update({ last_message_at: new Date().toISOString(), crisis_detected: isCrisis ? true : undefined })
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);
    } else {
      const { data: created, error: createError } = await supabase
        .from('Crisis_Conversation')
        .insert([{
          user_id: userId,
          title: message.length > 60 ? `${message.slice(0, 60)}...` : message,
          crisis_detected: isCrisis,
        }])
        .select()
        .single();
      if (!createError) conversationId = created.conversation_id;
    }

    if (conversationId) {
      await supabase.from('Crisis_Message').insert([
        { conversation_id: conversationId, role: 'user', content: message, crisis_detected: isCrisis },
        { conversation_id: conversationId, role: 'assistant', content: finalReply, crisis_detected: false },
      ]);
    }
  } catch {
    // Conversation keeps going even if the save failed.
  }

  res.json({
    reply: finalReply,
    crisis_detected: isCrisis,
    conversation_id: conversationId,
  });
});

// GET /crisis-companion/conversations — this resident's own past conversations,
// most recently active first, for the History panel.
app.get('/crisis-companion/conversations', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('Crisis_Conversation')
    .select('conversation_id, title, crisis_detected, started_at, last_message_at')
    .eq('user_id', req.user.user_id)
    .order('last_message_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /crisis-companion/conversations/:id/messages — full transcript of one of
// the resident's own conversations. Scoped by user_id so nobody can read
// another resident's crisis chat by guessing an id.
app.get('/crisis-companion/conversations/:id/messages', requireAuth, async (req, res) => {
  const { data: conversation, error: convError } = await supabase
    .from('Crisis_Conversation')
    .select('conversation_id')
    .eq('conversation_id', req.params.id)
    .eq('user_id', req.user.user_id)
    .maybeSingle();
  if (convError) return res.status(500).json({ error: convError.message });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

  const { data, error } = await supabase
    .from('Crisis_Message')
    .select('message_id, role, content, crisis_detected, created_at')
    .eq('conversation_id', req.params.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /crisis-companion/conversations/:id — removes a conversation and its
// messages (ON DELETE CASCADE). Scoped to the caller's own conversations.
app.delete('/crisis-companion/conversations/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('Crisis_Conversation')
    .delete()
    .eq('conversation_id', req.params.id)
    .eq('user_id', req.user.user_id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'Conversation not found' });
  res.json({ deleted: true });
});

// POST /crisis-companion/rate — a resident's own rating of an AI Crisis
// Companion conversation (1-5). Feeds the AI Effectiveness Tracker's View
// User Ratings -- the one signal nothing else in this app could stand in for.
app.post('/crisis-companion/rate', async (req, res) => {
  const { user_id, rating } = req.body;
  const numericRating = Number(rating);
  if (!user_id || !Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ error: 'user_id and rating (1-5) are required' });
  }

  const { data, error } = await supabase
    .from('AI_Rating')
    .insert([{ user_id, rating: numericRating }])
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.post('/mood-entries', async (req, res) => {
  const { user_id, mood_level, mood_label } = req.body;
  if (!user_id || !mood_level) {
    return res.status(400).json({ error: 'user_id and mood_level are required' });
  }

  const today = new Date().toISOString().split('T')[0];

  // Check if today's entry already exists — update it instead of creating a duplicate
  const { data: existing } = await supabase
    .from('Mood_Entry')
    .select('mood_id')
    .eq('user_id', user_id)
    .eq('entry_date', today)
    .limit(1);

  if (existing && existing.length > 0) {
    // Re-logging today's mood (picking a different label) starts the "what's
    // behind it" follow-up over -- yesterday's tags shouldn't silently carry
    // onto a new mood.
    let { data, error } = await supabase
      .from('Mood_Entry')
      .update({ mood_level, mood_label: mood_label || null, tags: null })
      .eq('mood_id', existing[0].mood_id)
      .select();
    // Tolerates db/mood_entry_tags.sql not having run yet on a given
    // environment -- logging a mood should never hard-fail over an optional
    // column that only the "what's behind it" follow-up actually needs.
    if (error?.message?.includes('tags')) {
      ({ data, error } = await supabase
        .from('Mood_Entry')
        .update({ mood_level, mood_label: mood_label || null })
        .eq('mood_id', existing[0].mood_id)
        .select());
    }
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data[0]);
  }

  const { data, error } = await supabase
    .from('Mood_Entry')
    .insert([{ user_id, mood_level, mood_label: mood_label || null, entry_date: today }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

// PATCH /mood-entries/today — saves the optional "what's contributing to
// this?" tags against the mood the resident already logged today. Separate
// from POST so picking tags afterward never re-touches mood_level/mood_label.
app.patch('/mood-entries/today', async (req, res) => {
  const { user_id, tags } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('Mood_Entry')
    .update({ tags: Array.isArray(tags) ? tags : null })
    .eq('user_id', user_id)
    .eq('entry_date', today)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: "No mood entry logged for today yet" });
  res.json(data[0]);
});

app.get('/mood-entries/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const { data, error } = await supabase
    .from('Mood_Entry')
    .select('*')
    .eq('user_id', userId)
    .order('entry_date', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const ASSESSMENT_SECTIONS = {
  mood: ['A1', 'A2', 'A3', 'A4', 'A5'],
  anxiety: ['B1', 'B2', 'B3', 'B4', 'B5'],
  stress: ['C1', 'C2', 'C3', 'C4', 'C5'],
};

const BAND_RANK = { low: 0, moderate: 1, elevated: 2 };

function bandForScore(score) {
  if (score >= 10) return 'elevated';
  if (score >= 5) return 'moderate';
  return 'low';
}

// POST /assessment — score the 4-point Mood/Anxiety/Stress sections, plus the
// D1 safety-check item, which is scored separately and never averaged into
// the wellness bands.
app.post('/assessment', async (req, res) => {
  const { user_id, answers } = req.body;

  if (!user_id || !answers) {
    return res.status(400).json({ error: 'user_id and answers are required' });
  }

  const sumSection = (keys) => keys.reduce((total, key) => total + (Number(answers[key]) || 0), 0);

  const moodScore = sumSection(ASSESSMENT_SECTIONS.mood);
  const anxietyScore = sumSection(ASSESSMENT_SECTIONS.anxiety);
  const stressScore = sumSection(ASSESSMENT_SECTIONS.stress);
  const safetyScore = Number(answers.D1) || 0;
  const safetyFlag = safetyScore > 0;

  const moodBand = bandForScore(moodScore);
  const anxietyBand = bandForScore(anxietyScore);
  const stressBand = bandForScore(stressScore);

  // Highest band wins — a spike in one section shouldn't be masked by lower scores elsewhere.
  const overallBand = [moodBand, anxietyBand, stressBand].reduce(
    (worst, band) => (BAND_RANK[band] > BAND_RANK[worst] ? band : worst),
    'low'
  );

  const { data, error } = await supabase
    .from('Assessment_Result')
    .insert([{
      user_id,
      mood_score: moodScore,
      anxiety_score: anxietyScore,
      stress_score: stressScore,
      overall_band: overallBand,
      safety_flag: safetyFlag,
      safety_score: safetyScore,
    }])
    .select();

  if (error) return res.status(500).json({ error: error.message });

  // Records the consent the resident just gave on the consent screen before
  // this submission (see Assessment.jsx's consentChecked gate) -- a real
  // record of a real action, not a fabricated "agreed to terms" event.
  // Best-effort: the assessment itself is already saved either way.
  supabase.from('Consent_Record').insert([{ user_id, consent_type: 'assessment' }]).then(() => {});

  // Alerts the resident's own barangay LGU account (if one exists) when a
  // check-in raises a real safety concern -- real names, same as the rest of
  // the LGU's resident-facing views (Manage Residents, etc.), since this IS
  // the local government responsible for this specific named resident.
  if (safetyFlag) {
    (async () => {
      const { data: resident } = await supabase.from('User').select('name, barangay_id').eq('user_id', user_id).single();
      const lguUserId = resident ? await getLguUserIdForBarangay(resident.barangay_id) : null;
      if (lguUserId) {
        await supabase.from('Notification').insert([{
          user_id: lguUserId,
          type: 'system',
          title: 'Safety concern flagged',
          body: `${resident.name}'s latest check-in flagged a possible safety concern.`,
          link: '/lgu/residents',
          read: false,
        }]);
      }
    })();
  }

  res.status(201).json({
    ...data[0],
    sections: {
      mood: { score: moodScore, band: moodBand },
      anxiety: { score: anxietyScore, band: anxietyBand },
      stress: { score: stressScore, band: stressBand },
    },
  });
});

const MOOD_LABELS = { 1: 'Low', 2: 'Down', 3: 'Okay', 4: 'Good', 5: 'Calm' };
const MOOD_EMOJI = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😌' };

// Mirrors resident/src/utils/emotions.js's EMOTIONS list -- the "Top Mood"
// insight card below needs the exact emoji for the resident's own picked
// label (e.g. "Sad"), not just the generic 1-5 fallback.
const EMOJI_BY_MOOD_LABEL = {
  Calm: '😌', Happy: '🙂', Energetic: '⚡', Grateful: '🙏', Good: '😊', Excited: '🤩',
  Okay: '😐', Confused: '😕', Tired: '😴', Down: '🙁', Irritated: '😠', Anxious: '😰',
  'Mood swings': '😢', 'Low energy': '🥱', Apathetic: '😶', Overwhelmed: '😩',
  Sad: '😞', Depressed: '😔', 'Feeling guilty': '😣', 'Very self-critical': '😖',
};

const INSIGHT_COLORS = {
  streak: '#5DCAA5',
  trend: '#FAC775',
  mood: '#F0997B',
  locked: '#9CA3AF',
  voice: '#B8A6E8',
};

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function startOfWeek(d) {
  // Monday-start week
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

const STOPWORDS = new Set([
  'this', 'that', 'with', 'have', 'just', 'like', 'been', 'about', 'really',
  'know', 'feel', 'feeling', 'felt', 'think', 'lately', 'today', 'still',
  'even', 'when', 'what', 'they', 'them', 'because', 'from', 'want', 'going',
  'there', 'here', 'were', 'would', 'could', 'should', 'their', 'your',
  // contraction remnants left over once the keyword regex strips apostrophes
  // (e.g. "don't" -> "dont") — without these, the most common "word" ends up
  // being a stripped contraction rather than an actual theme
  'dont', 'doesnt', 'cant', 'wont', 'isnt', 'wasnt', 'arent', 'couldnt',
  'wouldnt', 'shouldnt', 'didnt', 'hasnt', 'havent', 'youre', 'theyre',
  'weve', 'thats', 'whats',
]);

const KEYWORD_FOLLOWUPS = {
  sleep: 'Worth noticing — want to check in on your sleep?',
  tired: 'Worth noticing — want to check in on your sleep?',
  insomnia: 'Worth noticing — want to check in on your sleep?',
  work: 'Worth noticing — want to check in on your workload?',
  exam: 'Worth noticing — want to check in on school stress?',
  deadline: 'Worth noticing — want to check in on your workload?',
  stress: 'Worth noticing — want to check in on what\'s been stressful?',
  lonely: 'Worth noticing — want to check in on your support system?',
  alone: 'Worth noticing — want to check in on your support system?',
  money: 'Worth noticing — want to check in on financial stress?',
  family: 'Worth noticing — want to check in on things at home?',
};

// Mirrors the resident-facing tag labels in moodResponses.js on the frontend --
// kept as plain strings on both sides rather than a shared import since the
// client and server don't share a module boundary here.
const FACTOR_FOLLOWUPS = {
  Sleep: 'Worth noticing — want to check in on your sleep?',
  'Work/School': 'Worth noticing — want to check in on your workload?',
  Relationships: 'Worth noticing — want to check in on your relationships?',
  Family: 'Worth noticing — want to check in on things at home?',
  Health: 'Worth noticing — want to check in on how you are feeling physically?',
  Money: 'Worth noticing — want to check in on financial stress?',
  Loneliness: 'Worth noticing — want to check in on your support system?',
};

app.get('/insights/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const cards = [];

  // select('*') rather than naming `tags` explicitly -- tolerates the
  // db/mood_entry_tags.sql migration not having run yet on a given
  // environment instead of hard-failing every Daily Insights card.
  const { data: moodEntries, error: moodError } = await supabase
    .from('Mood_Entry')
    .select('*')
    .eq('user_id', userId)
    .order('entry_date', { ascending: true });

  if (moodError) return res.status(500).json({ error: moodError.message });

  const entriesByDate = new Map((moodEntries || []).map((e) => [e.entry_date, e.mood_level]));

  // --- Card 1: Streak ---
  if (moodEntries && moodEntries.length > 0) {
    // Current streak: consecutive days ending today
    let currentStreak = 0;
    const cursor = new Date();
    while (entriesByDate.has(toDateStr(cursor))) {
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    // Longest streak ever, scanning all logged dates
    const sortedDates = [...entriesByDate.keys()].sort();
    let longestStreak = 0;
    let running = 0;
    let prevDate = null;
    for (const dateStr of sortedDates) {
      const d = new Date(dateStr);
      if (prevDate) {
        const diffDays = Math.round((d - prevDate) / 86400000);
        running = diffDays === 1 ? running + 1 : 1;
      } else {
        running = 1;
      }
      longestStreak = Math.max(longestStreak, running);
      prevDate = d;
    }

    if (currentStreak > 0) {
      cards.push({
        type: 'streak',
        label: 'Streak',
        icon: '🔥',
        accentColor: INSIGHT_COLORS.streak,
        title: `${currentStreak}-day check-in streak`,
        subtext: currentStreak >= longestStreak
          ? 'Your longest one yet.'
          : `Best so far: ${longestStreak} days.`,
      });
    }
  }

  // --- Weekly boundaries ---
  const thisWeekStart = startOfWeek(new Date());
  const prevWeekStart = new Date(thisWeekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekEnd = new Date(thisWeekStart);
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);

  const thisWeekEntries = (moodEntries || []).filter((e) => new Date(e.entry_date) >= thisWeekStart);
  const prevWeekEntries = (moodEntries || []).filter(
    (e) => new Date(e.entry_date) >= prevWeekStart && new Date(e.entry_date) <= prevWeekEnd
  );

  // --- Card 2: Weekly trend ---
  if (thisWeekEntries.length > 0 && prevWeekEntries.length > 0) {
    const avg = (arr) => arr.reduce((sum, e) => sum + e.mood_level, 0) / arr.length;
    const thisAvg = avg(thisWeekEntries);
    const prevAvg = avg(prevWeekEntries);
    const delta = thisAvg - prevAvg;

    let title;
    let verb;
    if (delta > 0.3) {
      title = 'Calmer than last week';
      verb = 'improved';
    } else if (delta < -0.3) {
      title = 'A bit tougher than last week';
      verb = 'dipped';
    } else {
      title = 'About the same as last week';
      verb = 'stayed steady';
    }

    cards.push({
      type: 'trend',
      label: 'Weekly Trend',
      icon: '📈',
      accentColor: INSIGHT_COLORS.trend,
      title,
      subtext: `Your average mood ${verb} compared to the week before.`,
    });
  }

  // --- Card 3: Most common mood this week ---
  if (thisWeekEntries.length > 0) {
    // Grouped by the resident's actual picked label (e.g. "Sad"), not the
    // generic 1-5 bucket -- a legacy entry with no mood_label still falls
    // back to that bucket's name so it's never left unlabeled.
    const counts = {};
    thisWeekEntries.forEach((e) => {
      const key = e.mood_label || MOOD_LABELS[e.mood_level] || 'Logged';
      if (!counts[key]) counts[key] = { count: 0, level: e.mood_level };
      counts[key].count += 1;
    });
    const [topLabel, topInfo] = Object.entries(counts).sort((a, b) => b[1].count - a[1].count)[0];

    cards.push({
      type: 'mood',
      label: 'Top Mood',
      icon: EMOJI_BY_MOOD_LABEL[topLabel] || MOOD_EMOJI[topInfo.level] || '😐',
      accentColor: INSIGHT_COLORS.mood,
      title: `"${topLabel}" was your top mood`,
      subtext: `Logged ${topInfo.count} out of ${thisWeekEntries.length} days this week.`,
    });
  }

  // --- Card 4: Day-of-week pattern (locked until 3+ weeks of history) ---
  if (moodEntries && moodEntries.length > 0) {
    const earliestDate = new Date(moodEntries[0].entry_date);
    const daysOfHistory = Math.floor((new Date() - earliestDate) / 86400000);

    if (daysOfHistory < 21) {
      cards.push({
        type: 'locked',
        label: 'Day Pattern',
        icon: '🔒',
        accentColor: INSIGHT_COLORS.locked,
        title: 'Unlocks after 3 weeks',
        subtext: 'Keep checking in — day-of-week patterns need more history to be reliable.',
      });
    } else {
      const last21 = moodEntries.filter((e) => new Date(e.entry_date) >= new Date(Date.now() - 21 * 86400000));
      const byWeekday = {};
      last21.forEach((e) => {
        const weekday = new Date(e.entry_date).getDay();
        if (!byWeekday[weekday]) byWeekday[weekday] = [];
        byWeekday[weekday].push(e.mood_level);
      });

      const overallAvg = last21.reduce((sum, e) => sum + e.mood_level, 0) / last21.length;
      const weekdayNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

      let lowestWeekday = null;
      let lowestAvg = Infinity;
      Object.entries(byWeekday).forEach(([weekday, levels]) => {
        if (levels.length < 2) return; // need at least 2 occurrences to call it a pattern
        const avg = levels.reduce((s, v) => s + v, 0) / levels.length;
        if (avg < lowestAvg) {
          lowestAvg = avg;
          lowestWeekday = weekday;
        }
      });

      if (lowestWeekday !== null && lowestAvg < overallAvg - 0.4) {
        cards.push({
          type: 'pattern',
          label: 'Day Pattern',
          icon: '📅',
          accentColor: INSIGHT_COLORS.streak,
          title: `${weekdayNames[lowestWeekday]} have been harder lately`,
          subtext: 'Based on your average mood by day of the week, over the last 3+ weeks.',
        });
      } else {
        cards.push({
          type: 'pattern',
          label: 'Day Pattern',
          icon: '📅',
          accentColor: INSIGHT_COLORS.streak,
          title: 'No strong day pattern yet',
          subtext: 'Your mood looks fairly consistent across the week so far.',
        });
      }
    }
  }

  // --- Card 5: Voice journal keyword correlation ---
  const { data: journalEntries } = await supabase
    .from('Voice_Journal')
    .select('transcript, emotion_result, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const thisWeekJournal = (journalEntries || []).filter(
    (j) => new Date(j.created_at) >= thisWeekStart
  );

  if (thisWeekJournal.length >= 2) {
    const wordCounts = {};
    thisWeekJournal.forEach((j) => {
      const words = (j.transcript || '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
      words.forEach((w) => {
        wordCounts[w] = (wordCounts[w] || 0) + 1;
      });
    });

    const topEntry = Object.entries(wordCounts)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])[0];

    if (topEntry) {
      const [keyword, count] = topEntry;
      const followup = KEYWORD_FOLLOWUPS[keyword] || 'Worth noticing — want to explore this further?';

      cards.push({
        type: 'voice',
        label: 'Voice Journal',
        icon: '🎙️',
        accentColor: INSIGHT_COLORS.voice,
        title: `"${keyword}" came up ${count} times`,
        subtext: followup,
      });
    }
  }

  // --- Card 6: "What's contributing to this?" tag correlation, this week ---
  const factorCounts = {};
  thisWeekEntries.forEach((e) => {
    (e.tags || []).forEach((tag) => {
      factorCounts[tag] = (factorCounts[tag] || 0) + 1;
    });
  });
  const topFactor = Object.entries(factorCounts).sort((a, b) => b[1] - a[1])[0];

  if (topFactor && topFactor[1] >= 2) {
    const [factor, count] = topFactor;
    cards.push({
      type: 'factor',
      label: 'This Week',
      icon: '🔎',
      accentColor: INSIGHT_COLORS.mood,
      title: `"${factor}" came up ${count} times`,
      subtext: FACTOR_FOLLOWUPS[factor] || 'Worth noticing — you flagged this more than once this week.',
    });
  }

  res.json(cards);
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { signToken, requireAuth, AuthedRequest } from '../middleware/auth';
import { serializeBusiness } from '../utils/serialize';
import { emailSchema } from '../utils/email';
import { env } from '../env';
import { sendWelcomeEmail, sendPasswordResetEmail, sendVerifyEmail } from '../email';
import { makeResetToken, readResetSubject, verifyResetToken, makeVerifyToken, verifyVerifyToken } from '../authTokens';
import { hasCoords } from '../utils/geo';

export const authRouter = Router();

// Nibbler: city is required for every account — it's what scopes a viewer's feed to
// their own city. Restaurant accounts are a variant of this same signup flow (not a
// separate endpoint): `isRestaurant: true` requires `cuisineSlug` and, rather than also
// asking for a free-text `category` that would just restate the cuisine, derives
// `category` from the chosen cuisine's name server-side.
const signupSchema = z
  .object({
    email: emailSchema,
    // bcrypt (via bcryptjs) silently truncates at 72 bytes, so an unbounded password isn't
    // a crackable-weaker-hash risk — the cap is purely to reject an absurdly large request
    // body before it does any work.
    password: z.string().min(8, 'Password must be at least 8 characters').max(200, 'Password is too long'),
    name: z.string().min(2).max(80),
    handle: z
      .string()
      .min(2)
      .max(30)
      .regex(/^[a-z0-9_]+$/, 'Handle can only contain lowercase letters, numbers, and underscores'),
    city: z.string().min(1, 'City is required').max(80),
    // Optional on purpose: the client sends these only when the user granted the location
    // permission. Declining is a supported path (the account falls back to city matching),
    // so a missing pair must not fail validation. Bounds are enforced here rather than
    // trusted from the device.
    latitude: z.number().finite().min(-90).max(90).optional(),
    longitude: z.number().finite().min(-180).max(180).optional(),
    category: z.string().min(2).max(60).optional(),
    bio: z.string().max(280).optional().default(''),
    isRestaurant: z.boolean().optional().default(false),
    cuisineSlug: z.string().min(1).max(50).optional(),
  })
  .refine((data) => data.isRestaurant === false || Boolean(data.cuisineSlug), {
    message: 'Cuisine type is required for a restaurant account',
    path: ['cuisineSlug'],
  })
  .refine((data) => data.isRestaurant === true || Boolean(data.category), {
    message: 'Category is required',
    path: ['category'],
  });

authRouter.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }
  const { email, password, name, handle, city, bio, isRestaurant, cuisineSlug, latitude, longitude } = parsed.data;

  const existingEmail = await prisma.business.findUnique({ where: { email } });
  if (existingEmail) return res.status(409).json({ error: 'An account with this email already exists' });

  const existingHandle = await prisma.business.findUnique({ where: { handle } });
  if (existingHandle) return res.status(409).json({ error: 'That handle is already taken' });

  let cuisine = null;
  if (isRestaurant) {
    cuisine = await prisma.cuisine.findUnique({ where: { slug: cuisineSlug! } });
    if (!cuisine) return res.status(400).json({ error: 'Unknown cuisine type' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const business = await prisma.business.create({
    data: {
      email,
      passwordHash,
      name,
      handle,
      city,
      bio,
      isRestaurant,
      category: isRestaurant ? cuisine!.name : parsed.data.category!,
      cuisineId: cuisine?.id ?? null,
      // Only stored when the client actually sent a usable pair — a partial or
      // out-of-range pair is left null so it falls into the city-matching path rather
      // than becoming a coordinate that silently matches the wrong restaurants.
      ...(hasCoords({ latitude, longitude }) ? { latitude, longitude } : {}),
    },
    include: { cuisine: true },
  });

  const verifyUrl = `${env.appWebUrl}/verify-email?token=${makeVerifyToken(business.id)}`;
  void sendWelcomeEmail({ email: business.email, name: business.name }, verifyUrl);

  const token = signToken(business.id, null);
  res.status(201).json({ token, business: serializeBusiness(business) });
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const { email, password } = parsed.data;

  const business = await prisma.business.findUnique({ where: { email }, include: { cuisine: true } });
  if (business) {
    const ok = await bcrypt.compare(password, business.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    if (business.suspended) return res.status(403).json({ error: 'This account has been suspended' });
    const token = signToken(business.id, null);
    return res.json({ token, business: serializeBusiness(business) });
  }

  // Not the owner's email — check if it belongs to an invited team member instead.
  const member = await prisma.businessMember.findUnique({ where: { email } });
  if (!member) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await bcrypt.compare(password, member.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  const memberBusiness = await prisma.business.findUnique({ where: { id: member.businessId }, include: { cuisine: true } });
  if (!memberBusiness) return res.status(401).json({ error: 'Invalid email or password' });
  if (memberBusiness.suspended) return res.status(403).json({ error: 'This account has been suspended' });

  const token = signToken(memberBusiness.id, member.id);
  res.json({ token, business: serializeBusiness(memberBusiness), memberRole: member.role });
});

// Guest access: upserts one shared, pre-verified guest business and hands back a
// token, so anyone can look around without signing up. Self-provisioning, so it
// works on any database without a reseed.
authRouter.post('/guest', async (_req, res) => {
  const guest = await prisma.business.upsert({
    where: { email: 'guest@verve.demo' },
    update: {},
    create: {
      email: 'guest@verve.demo',
      passwordHash: await bcrypt.hash('guest', 10),
      name: 'Guest',
      handle: 'guest',
      category: 'Just browsing',
      bio: 'Looking around Verve.',
      emailVerified: true,
    },
  });
  const token = signToken(guest.id, null);
  res.json({ token, business: serializeBusiness(guest) });
});

authRouter.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const business = await prisma.business.findUnique({ where: { id: req.businessId! }, include: { cuisine: true } });
  if (!business) return res.status(404).json({ error: 'Not found' });
  res.json({ business: serializeBusiness(business), isOwner: !req.memberId });
});

// ── Password reset ─────────────────────────────────────────────────────────
const forgotSchema = z.object({ email: emailSchema });

authRouter.post('/forgot-password', async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A valid email is required' });

  const business = await prisma.business.findUnique({ where: { email: parsed.data.email } });
  if (business) {
    const resetUrl = `${env.appWebUrl}/reset-password?token=${makeResetToken(business.id, business.passwordHash)}`;
    void sendPasswordResetEmail({ to: business.email, resetUrl });
  }
  // Always respond the same way so this can't be used to discover which emails have accounts.
  res.json({ ok: true });
});

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

authRouter.post('/reset-password', async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });

  const businessId = readResetSubject(parsed.data.token);
  if (!businessId) return res.status(400).json({ error: 'This reset link is invalid or has expired' });
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business || verifyResetToken(parsed.data.token, business.passwordHash) !== business.id) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired' });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.business.update({ where: { id: business.id }, data: { passwordHash } });
  res.json({ ok: true });
});

// ── Email verification ─────────────────────────────────────────────────────
const verifySchema = z.object({ token: z.string().min(10) });

authRouter.post('/verify-email', async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const businessId = verifyVerifyToken(parsed.data.token);
  if (!businessId) return res.status(400).json({ error: 'This verification link is invalid or has expired' });
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return res.status(400).json({ error: 'This verification link is invalid or has expired' });

  if (!business.emailVerified) {
    await prisma.business.update({ where: { id: business.id }, data: { emailVerified: true } });
  }
  res.json({ ok: true });
});

authRouter.post('/resend-verification', requireAuth, async (req: AuthedRequest, res) => {
  const business = await prisma.business.findUnique({ where: { id: req.businessId! } });
  if (!business) return res.status(404).json({ error: 'Not found' });
  if (business.emailVerified) return res.json({ ok: true, alreadyVerified: true });

  const verifyUrl = `${env.appWebUrl}/verify-email?token=${makeVerifyToken(business.id)}`;
  void sendVerifyEmail({ to: business.email, verifyUrl });
  res.json({ ok: true });
});

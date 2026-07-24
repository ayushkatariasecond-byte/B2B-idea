import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { encodeSolidPng } from '../src/utils/png';

/**
 * Populates one city with example restaurant content so a freshly-launched city isn't an
 * empty feed on day one — the For You feed is hard city-locked, so a city with zero posts
 * shows nothing to its first visitor regardless of how much content exists elsewhere.
 *
 * IMPORTANT — this is placeholder content, not a shortcut to real launch content:
 *   - Media is a flat-color generated PNG (see utils/png.ts), not a real photo or video. It
 *     proves the upload/feed/city-lock pipeline works end to end, but it will visibly read as
 *     a placeholder, not food. Before (or immediately after) opening a city to real people,
 *     these posts should be replaced with real photos/videos from real restaurants.
 *   - The restaurant names/bios/menus below are fictional example data (same shapes as
 *     prisma/seedNibbler.ts, generalized to any city). They are NOT real businesses. Showing
 *     fictional "restaurants" to real public visitors without making clear they're examples
 *     would misrepresent what's actually on the platform — swap this list for real, consenting
 *     restaurants (or clearly-labeled example content) before a genuine public opening.
 *
 * Usage: npx ts-node --transpile-only prisma/seedCity.ts "Chicago"
 * (run `npm run seed:cuisines` first if this is a brand-new database)
 */
const prisma = new PrismaClient();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function writePlaceholder(filename: string, rgb: [number, number, number], accent: [number, number, number]): string {
  const png = encodeSolidPng(360, 640, rgb, accent);
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), png);
  return `/uploads/${filename}`;
}

function slugifyCity(city: string): string {
  return city.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const WARM: [number, number, number] = [230, 126, 34];

interface RestaurantSeed {
  handle: string;
  name: string;
  cuisineSlug: string;
  bio: string;
  color: [number, number, number];
  menuItems: { name: string; price: number; description?: string }[];
  posts: { caption: string; tag: string }[];
}

// Six example restaurants across varied cuisines — enough that a new city's For You and
// cuisine-filter chips both have real content to show, not a fixed roster tied to one city.
const EXAMPLE_RESTAURANTS: RestaurantSeed[] = [
  {
    handle: 'firehouse-bbq',
    name: "Firehouse BBQ",
    cuisineSlug: 'american',
    bio: 'Wood-fired brisket, smoked low and slow for 14 hours.',
    color: [92, 46, 24],
    menuItems: [
      { name: 'Brisket Plate', price: 18.5, description: 'Half pound, choice of two sides' },
      { name: 'Smoked Turkey Sandwich', price: 12 },
    ],
    posts: [
      { caption: 'Pulled this brisket after 14 hours on the smoker. [Example post]', tag: 'Behind the Kitchen' },
      { caption: "Friday special: burnt ends bowl. [Example post]", tag: 'Special Offer' },
    ],
  },
  {
    handle: 'pasta-fresca',
    name: 'Pasta Fresca',
    cuisineSlug: 'italian',
    bio: 'Hand-rolled pasta, made fresh every morning.',
    color: [122, 32, 38],
    menuItems: [
      { name: 'Cacio e Pepe', price: 16, description: 'Black pepper, pecorino romano' },
      { name: 'Burrata Caprese', price: 13 },
    ],
    posts: [{ caption: 'Watch this dough turn into tagliatelle in under a minute. [Example post]', tag: 'Behind the Kitchen' }],
  },
  {
    handle: 'bangkok-bites',
    name: 'Bangkok Bites',
    cuisineSlug: 'thai',
    bio: 'Street-style Thai food — bold, spicy, and fast.',
    color: [23, 107, 92],
    menuItems: [
      { name: 'Pad Kra Pao', price: 14, description: 'Holy basil, choice of protein' },
      { name: 'Mango Sticky Rice', price: 7 },
    ],
    posts: [{ caption: "This wok hits 600°F. [Example post]", tag: 'Behind the Kitchen' }],
  },
  {
    handle: 'taco-spot',
    name: 'The Taco Spot',
    cuisineSlug: 'mexican',
    bio: 'Street tacos and house-made salsas. Open late.',
    color: [178, 58, 32],
    menuItems: [
      { name: 'Al Pastor Taco', price: 4, description: 'Pineapple, cilantro, onion' },
      { name: 'Elote', price: 6 },
    ],
    posts: [{ caption: 'New salsa verde just dropped. [Example post]', tag: 'New Dish' }],
  },
  {
    handle: 'sakura-sushi',
    name: 'Sakura Sushi Bar',
    cuisineSlug: 'japanese',
    bio: 'Omakase-style plates and fresh nigiri, sourced daily.',
    color: [30, 46, 84],
    menuItems: [
      { name: 'Nigiri Set (8pc)', price: 24 },
      { name: 'Miso Soup', price: 4 },
    ],
    posts: [{ caption: "Fish came in this morning. [Example post]", tag: 'Behind the Kitchen' }],
  },
  {
    handle: 'spice-route',
    name: 'Spice Route',
    cuisineSlug: 'indian',
    bio: 'Regional Indian dishes, made in-house daily.',
    color: [140, 90, 20],
    menuItems: [
      { name: 'Butter Chicken', price: 17 },
      { name: 'Garlic Naan', price: 4.5 },
    ],
    posts: [{ caption: 'Tandoor is at temperature — naan orders start now. [Example post]', tag: 'Behind the Kitchen' }],
  },
];

async function main() {
  const city = process.argv[2]?.trim();
  if (!city) {
    console.error('Usage: npx ts-node --transpile-only prisma/seedCity.ts "City Name"');
    process.exit(1);
  }
  console.log(`Seeding EXAMPLE/PLACEHOLDER restaurant content for city: "${city}"`);
  console.log('Reminder: placeholder images + fictional business names — see file header before using this for a real public launch.\n');

  const citySlug = slugifyCity(city);
  const password = await bcrypt.hash('password123', 10);

  for (const r of EXAMPLE_RESTAURANTS) {
    const cuisine = await prisma.cuisine.findUnique({ where: { slug: r.cuisineSlug } });
    if (!cuisine) throw new Error(`Cuisine "${r.cuisineSlug}" not seeded — run npm run seed:cuisines first`);

    const handle = `${r.handle}-${citySlug}`;
    const business = await prisma.business.upsert({
      where: { handle },
      update: {},
      create: {
        email: `${handle}@nibbler.demo`,
        passwordHash: password,
        name: r.name,
        handle,
        category: cuisine.name,
        bio: r.bio,
        city,
        isRestaurant: true,
        cuisineId: cuisine.id,
        menuItems: r.menuItems,
        avatarUrl: writePlaceholder(`${handle}-avatar.png`, r.color, WARM),
        coverUrl: writePlaceholder(`${handle}-cover.png`, r.color, WARM),
        emailVerified: true,
      },
    });

    let i = 0;
    for (const p of r.posts) {
      i += 1;
      const existing = await prisma.post.findFirst({ where: { businessId: business.id, caption: p.caption } });
      if (existing) continue;
      await prisma.post.create({
        data: {
          businessId: business.id,
          mediaUrl: writePlaceholder(`${handle}-post-${i}.png`, r.color, WARM),
          mediaType: 'image',
          caption: p.caption,
          tag: p.tag,
        },
      });
    }
  }

  console.log(`Seeded ${EXAMPLE_RESTAURANTS.length} example restaurants in "${city}".`);
  console.log(`Demo login: e.g. firehouse-bbq-${citySlug}@nibbler.demo / password123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

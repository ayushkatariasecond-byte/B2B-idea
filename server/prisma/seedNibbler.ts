import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { encodeSolidPng } from '../src/utils/png';

const prisma = new PrismaClient();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function writePlaceholder(filename: string, rgb: [number, number, number], accent: [number, number, number]): string {
  const png = encodeSolidPng(360, 640, rgb, accent);
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), png);
  return `/uploads/${filename}`;
}

const WARM: [number, number, number] = [230, 126, 34];

interface RestaurantSeed {
  handle: string;
  name: string;
  city: string;
  cuisineSlug: string;
  bio: string;
  website: string;
  color: [number, number, number];
  menuItems: { name: string; price: number; description?: string }[];
  posts: { caption: string; tag: string }[];
}

// Two cities with real restaurant content, one city with none — proves both the city
// lock (Austin/Denver never leak into each other's feed) and the empty-state path
// (Seattle has a viewer but zero restaurants).
const RESTAURANTS: RestaurantSeed[] = [
  {
    handle: 'franklinsfirehouse',
    name: "Franklin's Firehouse BBQ",
    city: 'Austin',
    cuisineSlug: 'american',
    bio: 'Wood-fired brisket, smoked low and slow for 14 hours. Family-run since 2011.',
    website: 'https://example.com/franklins-firehouse',
    color: [92, 46, 24],
    menuItems: [
      { name: 'Brisket Plate', price: 18.5, description: 'Half pound, choice of two sides' },
      { name: 'Smoked Turkey Sandwich', price: 12 },
      { name: 'Burnt Ends Bowl', price: 15.5, description: 'Over street corn' },
    ],
    posts: [
      { caption: "Pulled this brisket after 14 hours on the smoker. The bark on this one is unreal.", tag: 'Behind the Kitchen' },
      { caption: "Friday special: burnt ends bowl. We sell out by 2pm most days.", tag: 'Special Offer' },
    ],
  },
  {
    handle: 'pastafresca',
    name: 'Pasta Fresca',
    city: 'Austin',
    cuisineSlug: 'italian',
    bio: 'Hand-rolled pasta, made fresh every morning. No boxes, no shortcuts.',
    website: 'https://example.com/pasta-fresca',
    color: [122, 32, 38],
    menuItems: [
      { name: 'Cacio e Pepe', price: 16, description: 'Black pepper, pecorino romano' },
      { name: 'Braised Short Rib Ragu', price: 22 },
      { name: 'Burrata Caprese', price: 13 },
    ],
    posts: [
      { caption: "Watch this dough turn into tagliatelle in under a minute.", tag: 'Behind the Kitchen' },
      { caption: "New on the menu this week: braised short rib ragu.", tag: 'New Dish' },
    ],
  },
  {
    handle: 'bangkokbites',
    name: 'Bangkok Bites',
    city: 'Austin',
    cuisineSlug: 'thai',
    bio: 'Street-style Thai food — bold, spicy, and fast.',
    website: 'https://example.com/bangkok-bites',
    color: [23, 107, 92],
    menuItems: [
      { name: 'Pad Kra Pao', price: 14, description: 'Holy basil, choice of protein' },
      { name: 'Tom Yum Soup', price: 9 },
      { name: 'Mango Sticky Rice', price: 7 },
    ],
    posts: [
      { caption: "This wok hits 600°F. That's why the pad kra pao tastes like this.", tag: 'Behind the Kitchen' },
    ],
  },
  {
    handle: 'milehightacos',
    name: 'Mile High Tacos',
    city: 'Denver',
    cuisineSlug: 'mexican',
    bio: 'Street tacos and house-made salsas. Open late.',
    website: 'https://example.com/mile-high-tacos',
    color: [178, 58, 32],
    menuItems: [
      { name: 'Al Pastor Taco', price: 4, description: 'Pineapple, cilantro, onion' },
      { name: 'Birria Quesataco', price: 5.5 },
      { name: 'Elote', price: 6 },
    ],
    posts: [
      { caption: "Birria consomme, 6 hours in. This is why the quesatacos hit different.", tag: 'Behind the Kitchen' },
      { caption: "New salsa verde just dropped. Heat level: respectful but serious.", tag: 'New Dish' },
    ],
  },
  {
    handle: 'sakurasushibar',
    name: 'Sakura Sushi Bar',
    city: 'Denver',
    cuisineSlug: 'japanese',
    bio: 'Omakase-style plates and fresh nigiri, sourced daily.',
    website: 'https://example.com/sakura-sushi-bar',
    color: [30, 46, 84],
    menuItems: [
      { name: 'Nigiri Set (8pc)', price: 24 },
      { name: 'Spicy Tuna Roll', price: 11 },
      { name: 'Miso Soup', price: 4 },
    ],
    posts: [
      { caption: "Fish came in this morning. Here's tonight's nigiri set before service.", tag: 'Behind the Kitchen' },
    ],
  },
];

// Plain viewer accounts — no posting, just browsing. One per test city, plus one in a
// city with zero restaurants to exercise the empty-state path end to end.
const VIEWERS = [
  { handle: 'ava_austin', name: 'Ava', city: 'Austin' },
  { handle: 'dylan_denver', name: 'Dylan', city: 'Denver' },
  { handle: 'sam_seattle', name: 'Sam', city: 'Seattle' },
];

async function main() {
  const password = await bcrypt.hash('password123', 10);

  for (const r of RESTAURANTS) {
    const cuisine = await prisma.cuisine.findUnique({ where: { slug: r.cuisineSlug } });
    if (!cuisine) throw new Error(`Cuisine "${r.cuisineSlug}" not seeded — run npm run seed:cuisines first`);

    const business = await prisma.business.upsert({
      where: { handle: r.handle },
      update: {},
      create: {
        email: `${r.handle}@nibbler.demo`,
        passwordHash: password,
        name: r.name,
        handle: r.handle,
        category: cuisine.name,
        bio: r.bio,
        city: r.city,
        isRestaurant: true,
        cuisineId: cuisine.id,
        website: r.website,
        menuItems: r.menuItems,
        avatarUrl: writePlaceholder(`${r.handle}-avatar.png`, r.color, WARM),
        coverUrl: writePlaceholder(`${r.handle}-cover.png`, r.color, WARM),
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
          mediaUrl: writePlaceholder(`${r.handle}-post-${i}.png`, r.color, WARM),
          mediaType: 'image',
          caption: p.caption,
          tag: p.tag,
        },
      });
    }
  }

  for (const v of VIEWERS) {
    await prisma.business.upsert({
      where: { handle: v.handle },
      update: {},
      create: {
        email: `${v.handle}@nibbler.demo`,
        passwordHash: password,
        name: v.name,
        handle: v.handle,
        category: 'Diner',
        bio: '',
        city: v.city,
        isRestaurant: false,
        emailVerified: true,
      },
    });
  }

  console.log(`Seeded ${RESTAURANTS.length} restaurants across Austin/Denver and ${VIEWERS.length} viewer accounts.`);
  console.log('Demo login: any handle+"@nibbler.demo" (e.g. ava_austin@nibbler.demo) / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

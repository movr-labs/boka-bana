import { randomUUID } from "crypto";
import type { StoredBooking } from "@/lib/matchi-types";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};

type DatabaseShape = {
  usersById: Record<string, AppUser>;
  userIdsByEmail: Record<string, string>;
  bookingsByUserId: Record<string, StoredBooking[]>;
};

const EMPTY_DATABASE: DatabaseShape = {
  usersById: {},
  userIdsByEmail: {},
  bookingsByUserId: {},
};

type Store = {
  read(): Promise<DatabaseShape>;
  write(database: DatabaseShape): Promise<void>;
};

declare global {
  var bokaBanaMemoryDatabase: DatabaseShape | undefined;
}

function cloneDatabase(database: DatabaseShape): DatabaseShape {
  return JSON.parse(JSON.stringify(database)) as DatabaseShape;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getKvConfig() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

function createMemoryStore(): Store {
  globalThis.bokaBanaMemoryDatabase ??= cloneDatabase(EMPTY_DATABASE);
  return {
    async read() {
      return cloneDatabase(globalThis.bokaBanaMemoryDatabase ?? EMPTY_DATABASE);
    },
    async write(database) {
      globalThis.bokaBanaMemoryDatabase = cloneDatabase(database);
    },
  };
}

function createKvStore(config: { url: string; token: string }): Store {
  const key = "bokabana:database:v1";

  async function command<T>(parts: unknown[]) {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parts),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`KV command failed (${response.status})`);
    }
    const body = (await response.json()) as { result: T };
    return body.result;
  }

  return {
    async read() {
      const result = await command<string | null>(["GET", key]);
      return result ? (JSON.parse(result) as DatabaseShape) : cloneDatabase(EMPTY_DATABASE);
    },
    async write(database) {
      await command(["SET", key, JSON.stringify(database)]);
    },
  };
}

function getStore() {
  const kvConfig = getKvConfig();
  return kvConfig ? createKvStore(kvConfig) : createMemoryStore();
}

export async function findUserByEmail(email: string) {
  const database = await getStore().read();
  const userId = database.userIdsByEmail[normalizeEmail(email)];
  return userId ? database.usersById[userId] ?? null : null;
}

export async function findUserById(userId: string) {
  const database = await getStore().read();
  return database.usersById[userId] ?? null;
}

export async function createUser(input: { name: string; email: string; passwordHash: string }) {
  const store = getStore();
  const database = await store.read();
  const email = normalizeEmail(input.email);

  if (database.userIdsByEmail[email]) {
    throw new Error("E-postadressen används redan");
  }

  const user: AppUser = {
    id: randomUUID(),
    name: input.name.trim(),
    email,
    passwordHash: input.passwordHash,
    createdAt: new Date().toISOString(),
  };

  database.usersById[user.id] = user;
  database.userIdsByEmail[email] = user.id;
  database.bookingsByUserId[user.id] = [];
  await store.write(database);
  return user;
}

export async function listBookings(userId: string) {
  const database = await getStore().read();
  return database.bookingsByUserId[userId] ?? [];
}

export async function saveBooking(userId: string, booking: StoredBooking) {
  const store = getStore();
  const database = await store.read();
  const bookings = database.bookingsByUserId[userId] ?? [];
  const deduped = bookings.filter((item) => item.id !== booking.id);
  database.bookingsByUserId[userId] = [booking, ...deduped];
  await store.write(database);
  return booking;
}

export function publicUser(user: AppUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

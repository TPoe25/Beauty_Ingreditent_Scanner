import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Connect to the database using the provided connection string.
const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });

// Prisma Client is designed to be shared across the entire application. If you instantiate it multiple times, it can lead to performance issues and exhaust your database connections. To prevent this, we use a global variable to store the Prisma Client instance. This way, we ensure that only one instance of Prisma Client is created and reused throughout the application.
const globalForPrisma = global as unknown as {
  prisma?: PrismaClient;
};

// Create a singleton instance of Prisma Client using the provided connection string and adapter.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

// If this script is run in development mode, make sure to store the Prisma Client instance in the global object. This allows the instance to be reused across hot reloads, preventing the creation of multiple instances and avoiding potential performance issues.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

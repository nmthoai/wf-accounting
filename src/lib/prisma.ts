import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = () => {
  return new PrismaClient();
};

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

// One client per process: the production build bundles this module more than
// once (proxy, routes, pages), and each copy would otherwise open its own engine.
globalThis.prismaGlobal = prisma;

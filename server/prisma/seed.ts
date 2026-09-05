import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PrismaClient } from "@prisma/client";

import { getPrisma } from "../src/prisma.js";

const CATEGORY_NAMES = ["Account and Access", "Hardware", "Software", "Network"];
const RELATED_SYSTEM_NAMES = [
  "Email",
  "Campus Wi-Fi",
  "VPN",
  "LEB2 App",
  "Grade Submission App",
  "Printer",
  "Corporate Laptop",
];

const DEVELOPMENT_REQUESTERS = [
  {
    displayName: "Arun Chaiyasit",
    email: "arun.chaiyasit@example.test",
    isActive: true,
  },
  {
    displayName: "Boonmee Srisuk",
    email: "boonmee.srisuk@example.test",
    isActive: true,
  },
  {
    displayName: "Chalida Wongsa",
    email: "chalida.wongsa@example.test",
    isActive: true,
  },
  {
    displayName: "Darin Phromma",
    email: "darin.phromma@example.test",
    isActive: true,
  },
  {
    displayName: "Inactive Test Requester",
    email: "inactive.requester@example.test",
    isActive: false,
  },
];

export async function seedDatabase(prisma: PrismaClient = getPrisma()) {
  for (const name of CATEGORY_NAMES) {
    await prisma.category.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
  }

  for (const name of RELATED_SYSTEM_NAMES) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
  }

  for (const requester of DEVELOPMENT_REQUESTERS) {
    await prisma.developmentRequester.upsert({
      where: { email: requester.email },
      update: {
        displayName: requester.displayName,
        isActive: requester.isActive,
      },
      create: requester,
    });
  }

}

async function main() {
  const prisma = getPrisma();

  try {
    await seedDatabase(prisma);
    console.log(
      `Seeded ${CATEGORY_NAMES.length} categories, ${RELATED_SYSTEM_NAMES.length} related systems, and ${DEVELOPMENT_REQUESTERS.length} development requesters.`,
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  void main();
}

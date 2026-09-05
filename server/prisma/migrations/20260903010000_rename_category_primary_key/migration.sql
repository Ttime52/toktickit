-- PostgreSQL keeps the original primary-key constraint name when the Lab 1
-- Category table is renamed. Align it with the mapped table name so Prisma's
-- schema and the migrated database describe the same constraint.
ALTER TABLE "categories"
  RENAME CONSTRAINT "Category_pkey" TO "categories_pkey";

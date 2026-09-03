-- Preserve the four Category rows created by the Lab 1 migration while
-- moving the table to the snake_case name used by the Lab 2 contract.
ALTER TABLE "Category" RENAME TO "categories";

-- CreateEnum
CREATE TYPE "RequestedPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CurrentStatus" AS ENUM ('NEW');

-- CreateEnum
CREATE TYPE "ItPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "AttachmentAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "categories"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "development_requesters" (
    "id" SERIAL NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "development_requesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "related_systems" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "related_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" SERIAL NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "ticketDate" TIMESTAMP(3) NOT NULL,
    "requesterId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "relatedSystemId" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requestedPriority" "RequestedPriority" NOT NULL DEFAULT 'MEDIUM',
    "itPriority" "ItPriority",
    "currentStatus" "CurrentStatus" NOT NULL DEFAULT 'NEW',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_number_counters" (
    "year" INTEGER NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ticket_number_counters_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "uploadedByRequesterId" INTEGER NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availabilityState" "AttachmentAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "unavailableAt" TIMESTAMP(3),
    "unavailableReason" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedByRequesterId" INTEGER,
    "removalReason" TEXT,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "categories_isActive_name_idx" ON "categories"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "development_requesters_email_key" ON "development_requesters"("email");

-- CreateIndex
CREATE INDEX "development_requesters_isActive_displayName_idx" ON "development_requesters"("isActive", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "related_systems_name_key" ON "related_systems"("name");

-- CreateIndex
CREATE INDEX "related_systems_isActive_name_idx" ON "related_systems"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticketNumber_key" ON "tickets"("ticketNumber");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_idempotencyKey_key" ON "tickets"("idempotencyKey");

-- CreateIndex
CREATE INDEX "tickets_requesterId_updatedAt_idx" ON "tickets"("requesterId", "updatedAt");

-- CreateIndex
CREATE INDEX "tickets_requesterId_currentStatus_idx" ON "tickets"("requesterId", "currentStatus");

-- CreateIndex
CREATE INDEX "tickets_requesterId_categoryId_idx" ON "tickets"("requesterId", "categoryId");

-- CreateIndex
CREATE INDEX "tickets_requesterId_relatedSystemId_idx" ON "tickets"("requesterId", "relatedSystemId");

-- CreateIndex
CREATE INDEX "tickets_requesterId_requestedPriority_idx" ON "tickets"("requesterId", "requestedPriority");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storageKey_key" ON "attachments"("storageKey");

-- CreateIndex
CREATE INDEX "attachments_ticketId_removedAt_idx" ON "attachments"("ticketId", "removedAt");

-- CreateIndex
CREATE INDEX "attachments_ticketId_uploadedAt_idx" ON "attachments"("ticketId", "uploadedAt");

-- Data integrity checks used by the backend ticket-number allocator.
ALTER TABLE "ticket_number_counters"
  ADD CONSTRAINT "ticket_number_counters_year_positive_check" CHECK ("year" > 0),
  ADD CONSTRAINT "ticket_number_counters_next_value_positive_check" CHECK ("nextValue" > 0);

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "development_requesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_relatedSystemId_fkey" FOREIGN KEY ("relatedSystemId") REFERENCES "related_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedByRequesterId_fkey" FOREIGN KEY ("uploadedByRequesterId") REFERENCES "development_requesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_removedByRequesterId_fkey" FOREIGN KEY ("removedByRequesterId") REFERENCES "development_requesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

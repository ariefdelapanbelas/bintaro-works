-- CreateEnum
CREATE TYPE "ConfirmationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "whatsapp" TEXT;
ALTER TABLE "Organization" ADD COLUMN "publicEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN "publicTagline" TEXT;

-- CreateTable
CREATE TABLE "PaymentConfirmation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "status" "ConfirmationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "paymentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentConfirmation_organizationId_status_idx" ON "PaymentConfirmation"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "PaymentConfirmation" ADD CONSTRAINT "PaymentConfirmation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentConfirmation" ADD CONSTRAINT "PaymentConfirmation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

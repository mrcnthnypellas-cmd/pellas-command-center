-- CreateEnum
CREATE TYPE "CountWorkerPosition" AS ENUM ('SUPERVISOR', 'ENCODER', 'COUNTER');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "geofenceEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "geofenceLat" DOUBLE PRECISION,
ADD COLUMN     "geofenceLng" DOUBLE PRECISION,
ADD COLUMN     "geofenceRadiusMeters" INTEGER;

-- CreateTable
CREATE TABLE "CountEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "agencyName" TEXT NOT NULL DEFAULT 'Anthony L. Pellas & Associates',
    "clientName" TEXT NOT NULL DEFAULT 'Mondelez Philippines, Inc.',
    "siteName" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "timeScheduleStart" TEXT NOT NULL DEFAULT '06:00AM',
    "timeScheduleEnd" TEXT NOT NULL DEFAULT '2:00PM',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountWorker" (
    "id" TEXT NOT NULL,
    "countEventId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "position" "CountWorkerPosition" NOT NULL DEFAULT 'COUNTER',
    "tin" TEXT,
    "ratePerDay" DECIMAL(10,2),
    "hourlyRate" DECIMAL(10,2),
    "hoursWorked" DECIMAL(10,2),
    "regularHrs" DECIMAL(10,2),
    "otHrs" DECIMAL(10,2),
    "nightDiffHrs" DECIMAL(10,2),
    "dailyRatePayout" DECIMAL(10,2),
    "otPayout" DECIMAL(10,2),
    "nightDiffPayout" DECIMAL(10,2),
    "transpoAllowance" DECIMAL(10,2),
    "deductionLess" DECIMAL(10,2),
    "netPay" DECIMAL(10,2),
    "receivedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountWorker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "loginBackgroundStorageKey" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
    "appName" TEXT NOT NULL DEFAULT 'My Pellas Command Center',
    "logoStorageKey" TEXT,
    "themePrimaryColor" TEXT,
    "themeBackgroundColor" TEXT,
    "themeFontFamily" TEXT,
    "zoomPercent" INTEGER NOT NULL DEFAULT 100,
    "bannerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bannerMessage" TEXT NOT NULL DEFAULT '',
    "bannerTextColor" TEXT NOT NULL DEFAULT '#ffffff',
    "bannerBackgroundColor" TEXT NOT NULL DEFAULT '#dc2626',
    "bannerFontFamily" TEXT,
    "bannerSpeedSeconds" INTEGER NOT NULL DEFAULT 20,
    "bannerHeight" INTEGER NOT NULL DEFAULT 40,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "imageStorageKey" TEXT,
    "imageMimeType" TEXT,
    "eventDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactDirectoryEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "phone" TEXT NOT NULL,
    "extension" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'phone',
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactDirectoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CountEvent_companyId_idx" ON "CountEvent"("companyId");

-- CreateIndex
CREATE INDEX "CountWorker_countEventId_idx" ON "CountWorker"("countEventId");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_recipientId_idx" ON "ChatMessage"("senderId", "recipientId");

-- CreateIndex
CREATE INDEX "ChatMessage_recipientId_senderId_idx" ON "ChatMessage"("recipientId", "senderId");

-- CreateIndex
CREATE INDEX "Announcement_companyId_isActive_idx" ON "Announcement"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "Announcement_companyId_eventDate_idx" ON "Announcement"("companyId", "eventDate");

-- CreateIndex
CREATE INDEX "ContactDirectoryEntry_companyId_sortOrder_idx" ON "ContactDirectoryEntry"("companyId", "sortOrder");

-- AddForeignKey
ALTER TABLE "CountEvent" ADD CONSTRAINT "CountEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountEvent" ADD CONSTRAINT "CountEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountWorker" ADD CONSTRAINT "CountWorker_countEventId_fkey" FOREIGN KEY ("countEventId") REFERENCES "CountEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSetting" ADD CONSTRAINT "PlatformSetting_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactDirectoryEntry" ADD CONSTRAINT "ContactDirectoryEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactDirectoryEntry" ADD CONSTRAINT "ContactDirectoryEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

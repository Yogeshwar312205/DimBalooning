-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'INSPECTOR',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Drawing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "revision" TEXT NOT NULL DEFAULT 'Rev A',
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Drawing_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InspectionSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "drawingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "revision" TEXT NOT NULL DEFAULT 'Rev A',
    "batchNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InspectionSession_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InspectionSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Balloon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inspectionSessionId" TEXT NOT NULL,
    "balloonNumber" INTEGER NOT NULL,
    "pageNumber" INTEGER NOT NULL DEFAULT 1,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "width" REAL NOT NULL DEFAULT 0.04,
    "height" REAL NOT NULL DEFAULT 0.04,
    "leaderStartX" REAL,
    "leaderStartY" REAL,
    "leaderEndX" REAL,
    "leaderEndY" REAL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Balloon_inspectionSessionId_fkey" FOREIGN KEY ("inspectionSessionId") REFERENCES "InspectionSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Balloon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "balloonId" TEXT NOT NULL,
    "dimensionText" TEXT,
    "nominalValue" REAL,
    "upperTolerance" REAL,
    "lowerTolerance" REAL,
    "lowerLimit" REAL,
    "upperLimit" REAL,
    "actualValue" REAL,
    "unit" TEXT NOT NULL DEFAULT 'mm',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Measurement_balloonId_fkey" FOREIGN KEY ("balloonId") REFERENCES "Balloon" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Measurement_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InspectionCollaborator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inspectionSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InspectionCollaborator_inspectionSessionId_fkey" FOREIGN KEY ("inspectionSessionId") REFERENCES "InspectionSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InspectionCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inspectionSessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_inspectionSessionId_fkey" FOREIGN KEY ("inspectionSessionId") REFERENCES "InspectionSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Report_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Measurement_balloonId_key" ON "Measurement"("balloonId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionCollaborator_inspectionSessionId_userId_key" ON "InspectionCollaborator"("inspectionSessionId", "userId");

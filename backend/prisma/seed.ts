import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create Uploads & Reports directory
  const uploadsDir = path.resolve('uploads');
  const reportsDir = path.resolve('reports');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  // 1. Create Users
  const passwordHash = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@factory.com' },
    update: {},
    create: {
      name: 'Yogeshwar (Chief Quality Engineer)',
      email: 'admin@factory.com',
      passwordHash,
      role: 'ADMIN'
    }
  });

  const inspector = await prisma.user.upsert({
    where: { email: 'inspector@factory.com' },
    update: {},
    create: {
      name: 'Amit Kumar (Senior QA Inspector)',
      email: 'inspector@factory.com',
      passwordHash,
      role: 'INSPECTOR'
    }
  });

  await prisma.user.upsert({
    where: { email: 'engineer@factory.com' },
    update: {},
    create: {
      name: 'Rahul Sharma (Manufacturing Engineer)',
      email: 'engineer@factory.com',
      passwordHash,
      role: 'ENGINEER'
    }
  });

  console.log('✅ Demo Users Created');

  // 2. Create Sample PDF Drawing File if missing
  const samplePdfPath = path.join(uploadsDir, 'sample_gearbox_housing.pdf');
  if (!fs.existsSync(samplePdfPath)) {
    const synopsisPath = 'd:\\DimBalooning\\Reports_Project\\synopsis.pdf';
    if (fs.existsSync(synopsisPath)) {
      fs.copyFileSync(synopsisPath, samplePdfPath);
    }
  }

  const drawing = await prisma.drawing.create({
    data: {
      name: 'GB-1049-A Transmission Gearbox Housing Drawing',
      filePath: 'uploads/sample_gearbox_housing.pdf',
      revision: 'Rev C',
      pageCount: 4,
      uploadedById: admin.id
    }
  });

  console.log('✅ Demo Engineering Drawing Created');

  // 3. Create Inspection Session
  const session = await prisma.inspectionSession.create({
    data: {
      drawingId: drawing.id,
      name: 'First Article Inspection (FAIR) - Batch #8849',
      partNumber: 'GB-1049-A',
      partName: 'Transmission Gearbox Main Housing',
      revision: 'Rev C',
      batchNumber: 'BATCH-8849-Q3',
      status: 'IN_PROGRESS',
      createdById: inspector.id
    }
  });

  console.log('✅ Demo Inspection Session Created');

  // 4. Sample Balloons with PASS / CHECK / FAIL / PENDING
  const seedBalloons = [
    { num: 1, normX: 0.25, normY: 0.35, text: '25.00 ± 0.10', nom: 25.00, upper: 0.10, lower: -0.10, actual: 25.04, unit: 'mm', status: 'PASS', remarks: 'Dimension within nominal tolerance' },
    { num: 2, normX: 0.45, normY: 0.35, text: '10.00 ± 0.20', nom: 10.00, upper: 0.20, lower: -0.20, actual: 10.25, unit: 'mm', status: 'FAIL', remarks: 'Exceeds upper limit 10.20mm' },
    { num: 3, normX: 0.65, normY: 0.35, text: '50.00 +0.10/-0.05', nom: 50.00, upper: 0.10, lower: -0.05, actual: 50.09, unit: 'mm', status: 'CHECK', remarks: 'Near upper limit boundary' },
    { num: 4, normX: 0.25, normY: 0.55, text: '12.50 ± 0.05', nom: 12.50, upper: 0.05, lower: -0.05, actual: 12.49, unit: 'mm', status: 'PASS', remarks: 'Optimal tolerance' },
    { num: 5, normX: 0.45, normY: 0.55, text: 'Ø 100.00 ± 0.50', nom: 100.00, upper: 0.50, lower: -0.50, actual: 100.15, unit: 'mm', status: 'PASS', remarks: 'Bore diameter verified' },
    { num: 6, normX: 0.65, normY: 0.55, text: '15.00 ± 0.10', nom: 15.00, upper: 0.10, lower: -0.10, actual: 14.85, unit: 'mm', status: 'FAIL', remarks: 'Below lower limit 14.90mm' },
    { num: 7, normX: 0.25, normY: 0.75, text: '8.00 ± 0.05', nom: 8.00, upper: 0.05, lower: -0.05, actual: 8.04, unit: 'mm', status: 'CHECK', remarks: 'Near upper limit' },
    { num: 8, normX: 0.45, normY: 0.75, text: 'R 32.00 ± 0.15', nom: 32.00, upper: 0.15, lower: -0.15, actual: 32.05, unit: 'mm', status: 'PASS', remarks: 'Fillet radius verified' },
    { num: 9, normX: 0.65, normY: 0.75, text: '45.00 ± 0.20', nom: 45.00, upper: 0.20, lower: -0.20, actual: null, unit: 'mm', status: 'PENDING', remarks: 'Awaiting CMM measurement' },
    { num: 10, normX: 0.80, normY: 0.75, text: '20.00 ± 0.10', nom: 20.00, upper: 0.10, lower: -0.10, actual: null, unit: 'mm', status: 'PENDING', remarks: 'Awaiting height gauge reading' }
  ];

  for (const item of seedBalloons) {
    const balloon = await prisma.balloon.create({
      data: {
        inspectionSessionId: session.id,
        balloonNumber: item.num,
        pageNumber: 1,
        x: item.normX,
        y: item.normY,
        leaderStartX: item.normX - 0.05,
        leaderStartY: item.normY - 0.03,
        createdById: inspector.id
      }
    });

    const upperLimit = item.nom + item.upper;
    const lowerLimit = item.nom + item.lower;

    await prisma.measurement.create({
      data: {
        balloonId: balloon.id,
        dimensionText: item.text,
        nominalValue: item.nom,
        upperTolerance: item.upper,
        lowerTolerance: item.lower,
        lowerLimit,
        upperLimit,
        actualValue: item.actual,
        unit: item.unit,
        status: item.status,
        remarks: item.remarks,
        updatedById: inspector.id
      }
    });
  }

  console.log('✅ 10 Demo Balloons & Measurements Created');
  console.log('🌱 Database Seed Completed Successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

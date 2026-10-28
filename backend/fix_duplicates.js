const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDuplicateBalloonNumbers() {
  try {
    console.log('Fixing duplicate balloon numbers...');
    
    const sessions = await prisma.inspectionSession.findMany({
      select: { id: true, name: true }
    });
    
    console.log(`Found ${sessions.length} inspection sessions`);
    
    for (const session of sessions) {
      const balloons = await prisma.balloon.findMany({
        where: { inspectionSessionId: session.id },
        orderBy: { createdAt: 'asc' }
      });
      
      console.log(`  Session "${session.name}": ${balloons.length} balloons`);
      
      for (let i = 0; i < balloons.length; i++) {
        await prisma.balloon.update({
          where: { id: balloons[i].id },
          data: { balloonNumber: i + 1 }
        });
      }
    }
    
    console.log('✓ Fixed all balloon numbers');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixDuplicateBalloonNumbers();
